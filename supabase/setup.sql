-- One-file setup: paste this whole file into the Supabase SQL Editor and click Run.
-- (It is the files in supabase/migrations joined together.)

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
-- NUST NET (Engineering / Computing) with an FSc-based chapter list.
-- Subject split: Maths 50%, Physics 30%, English 20%. Each chapter starts with an equal share
-- of its subject; weights get refined later from real past papers.
-- Check total_questions / duration / negative marking against NUST's admission page each year.

insert into public.exams (slug, name, total_questions, duration_minutes, marks_per_question, negative_mark)
values ('nust-net-engineering', 'NUST NET (Engineering / Computing)', 200, 180, 1, 0)
on conflict (slug) do nothing;

with exam as (
  select id from public.exams where slug = 'nust-net-engineering'
),
rows (subject, share, chapter, topic, sort) as (
  values
    ('Mathematics', 0.5, 'Number Systems', 'Number Systems', 1),
    ('Mathematics', 0.5, 'Sets, Functions and Groups', 'Sets, Functions and Groups', 2),
    ('Mathematics', 0.5, 'Matrices and Determinants', 'Matrices and Determinants', 3),
    ('Mathematics', 0.5, 'Quadratic Equations', 'Quadratic Equations', 4),
    ('Mathematics', 0.5, 'Partial Fractions', 'Partial Fractions', 5),
    ('Mathematics', 0.5, 'Sequences and Series', 'Sequences and Series', 6),
    ('Mathematics', 0.5, 'Permutations, Combinations and Probability', 'Permutations, Combinations and Probability', 7),
    ('Mathematics', 0.5, 'Mathematical Induction and Binomial Theorem', 'Mathematical Induction and Binomial Theorem', 8),
    ('Mathematics', 0.5, 'Fundamentals of Trigonometry', 'Fundamentals of Trigonometry', 9),
    ('Mathematics', 0.5, 'Trigonometric Identities', 'Trigonometric Identities', 10),
    ('Mathematics', 0.5, 'Trigonometric Functions and Graphs', 'Trigonometric Functions and Graphs', 11),
    ('Mathematics', 0.5, 'Application of Trigonometry', 'Application of Trigonometry', 12),
    ('Mathematics', 0.5, 'Inverse Trigonometric Functions', 'Inverse Trigonometric Functions', 13),
    ('Mathematics', 0.5, 'Trigonometric Equations', 'Trigonometric Equations', 14),
    ('Mathematics', 0.5, 'Functions and Limits', 'Functions and Limits', 15),
    ('Mathematics', 0.5, 'Differentiation', 'Differentiation', 16),
    ('Mathematics', 0.5, 'Integration', 'Integration', 17),
    ('Mathematics', 0.5, 'Analytic Geometry (Lines)', 'Analytic Geometry (Lines)', 18),
    ('Mathematics', 0.5, 'Linear Inequalities and Linear Programming', 'Linear Inequalities and Linear Programming', 19),
    ('Mathematics', 0.5, 'Conic Sections', 'Conic Sections', 20),
    ('Mathematics', 0.5, 'Vectors', 'Vectors', 21),
    ('Physics', 0.3, 'Measurements', 'Measurements', 1),
    ('Physics', 0.3, 'Vectors and Equilibrium', 'Vectors and Equilibrium', 2),
    ('Physics', 0.3, 'Motion and Force', 'Motion and Force', 3),
    ('Physics', 0.3, 'Work and Energy', 'Work and Energy', 4),
    ('Physics', 0.3, 'Circular and Rotational Motion', 'Circular and Rotational Motion', 5),
    ('Physics', 0.3, 'Fluid Dynamics', 'Fluid Dynamics', 6),
    ('Physics', 0.3, 'Oscillations', 'Oscillations', 7),
    ('Physics', 0.3, 'Waves', 'Waves', 8),
    ('Physics', 0.3, 'Physical Optics', 'Physical Optics', 9),
    ('Physics', 0.3, 'Optical Instruments', 'Optical Instruments', 10),
    ('Physics', 0.3, 'Heat and Thermodynamics', 'Heat and Thermodynamics', 11),
    ('Physics', 0.3, 'Electrostatics', 'Electrostatics', 12),
    ('Physics', 0.3, 'Current Electricity', 'Current Electricity', 13),
    ('Physics', 0.3, 'Electromagnetism', 'Electromagnetism', 14),
    ('Physics', 0.3, 'Electromagnetic Induction', 'Electromagnetic Induction', 15),
    ('Physics', 0.3, 'Alternating Current', 'Alternating Current', 16),
    ('Physics', 0.3, 'Physics of Solids', 'Physics of Solids', 17),
    ('Physics', 0.3, 'Electronics', 'Electronics', 18),
    ('Physics', 0.3, 'Dawn of Modern Physics', 'Dawn of Modern Physics', 19),
    ('Physics', 0.3, 'Atomic Spectra', 'Atomic Spectra', 20),
    ('Physics', 0.3, 'Nuclear Physics', 'Nuclear Physics', 21),
    ('English', 0.2, 'Vocabulary', 'Synonyms', 1),
    ('English', 0.2, 'Vocabulary', 'Antonyms', 2),
    ('English', 0.2, 'Vocabulary', 'Analogies', 3),
    ('English', 0.2, 'Grammar', 'Sentence Completion', 4),
    ('English', 0.2, 'Grammar', 'Error Identification', 5),
    ('English', 0.2, 'Reading', 'Comprehension', 6)
)
insert into public.topics (exam_id, subject, chapter, topic, weight, sort)
select exam.id, r.subject, r.chapter, r.topic,
       round(r.share / count(*) over (partition by r.subject), 4),
       r.sort
from rows r cross join exam
on conflict (exam_id, subject, chapter, topic) do nothing;
