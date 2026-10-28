-- Study Brain core schema (Phase 1)
-- Every table has row-level security on: a student only ever sees their own data.

create extension if not exists pgcrypto;

create type public.file_status as enum ('uploaded', 'processing', 'needs_review', 'done', 'failed');
create type public.question_status as enum ('draft', 'approved', 'rejected');
create type public.session_kind as enum ('paper', 'practice');
create type public.mistake_reason as enum ('concept_gap', 'silly_error', 'time_pressure', 'not_attempted');

-- Exams: system exams have owner_id null and are readable by everyone.
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  slug text unique,
  name text not null,
  total_questions int not null default 100 check (total_questions > 0),
  duration_minutes int not null default 180 check (duration_minutes > 0),
  marks_per_question numeric not null default 1,
  negative_mark numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Topics: subject > chapter > topic. weight = share of the exam's questions (0..1).
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  subject text not null,
  chapter text not null,
  topic text not null,
  weight numeric not null default 0 check (weight >= 0 and weight <= 1),
  sort int not null default 0,
  unique (exam_id, subject, chapter, topic)
);
create index topics_exam_idx on public.topics (exam_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  exam_id uuid references public.exams (id) on delete set null,
  exam_date date,
  daily_set_size int not null default 20 check (daily_set_size between 5 and 100),
  created_at timestamptz not null default now()
);

-- Uploaded PDFs and photos.
create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  file_hash text not null,
  storage_path text not null,
  page_count int,
  status public.file_status not null default 'uploaded',
  error text,
  created_at timestamptz not null default now(),
  unique (owner_id, file_hash)
);

-- Extraction results keyed by file hash, so the same file is only ever sent to AI once.
-- No RLS policies: only the server (service role) reads and writes it.
create table public.extraction_cache (
  file_hash text primary key,
  extractor text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  source_file_id uuid references public.source_files (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  number_in_paper int,
  page_number int,
  body text not null,
  -- [{ "key": "A", "text": "..." }, ...]
  options jsonb not null default '[]'::jsonb,
  correct_option text,
  explanation text,
  image_path text,
  marks numeric not null default 1,
  status public.question_status not null default 'draft',
  created_at timestamptz not null default now()
);
create index questions_owner_idx on public.questions (owner_id, status);
create index questions_source_idx on public.questions (source_file_id);

create table public.test_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  kind public.session_kind not null,
  source_file_id uuid references public.source_files (id) on delete set null,
  time_limit_seconds int,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score numeric,
  max_score numeric
);
create index test_sessions_user_idx on public.test_sessions (user_id, started_at desc);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.test_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  position int not null,
  chosen_option text,
  is_correct boolean,
  seconds_spent int not null default 0,
  answered_at timestamptz,
  unique (session_id, question_id)
);
create index attempts_user_idx on public.attempts (user_id, question_id);

create table public.mistakes (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.attempts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  reason public.mistake_reason,
  suggested_reason public.mistake_reason,
  note text,
  created_at timestamptz not null default now()
);
create index mistakes_user_idx on public.mistakes (user_id, created_at desc);

-- Wrong questions waiting to come back (spaced re-attempts). Used from Phase 2.
create table public.review_queue (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  due_on date not null,
  interval_days int not null default 1,
  times_reviewed int not null default 0,
  primary key (user_id, question_id)
);

-- Create a profile row for every new account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row-level security
alter table public.exams enable row level security;
alter table public.topics enable row level security;
alter table public.profiles enable row level security;
alter table public.source_files enable row level security;
alter table public.extraction_cache enable row level security;
alter table public.questions enable row level security;
alter table public.test_sessions enable row level security;
alter table public.attempts enable row level security;
alter table public.mistakes enable row level security;
alter table public.review_queue enable row level security;

create policy "read system and own exams" on public.exams
  for select to authenticated using (owner_id is null or owner_id = (select auth.uid()));
create policy "manage own exams" on public.exams
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "read topics of visible exams" on public.topics
  for select to authenticated using (
    exists (select 1 from public.exams e where e.id = exam_id and (e.owner_id is null or e.owner_id = (select auth.uid())))
  );
create policy "manage topics of own exams" on public.topics
  for all to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.exams e where e.id = exam_id and e.owner_id = (select auth.uid())));

create policy "own profile" on public.profiles
  for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own files" on public.source_files
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own questions" on public.questions
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own sessions" on public.test_sessions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own attempts" on public.attempts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own mistakes" on public.mistakes
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own review queue" on public.review_queue
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Private storage bucket for uploaded papers. Files live under <user id>/...
insert into storage.buckets (id, name, public) values ('papers', 'papers', false)
  on conflict (id) do nothing;

create policy "upload own papers" on storage.objects
  for insert to authenticated with check (bucket_id = 'papers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "read own papers" on storage.objects
  for select to authenticated using (bucket_id = 'papers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own papers" on storage.objects
  for delete to authenticated using (bucket_id = 'papers' and (storage.foldername(name))[1] = (select auth.uid())::text);
