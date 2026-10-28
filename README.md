# Study Brain

Upload your test papers, log every mistake and why it happened, and see which topics cost you the most marks.
Built first for NUST NET, but works for any MCQ test.

Plan: see the Study Brain build plan doc.

## Stack

Next.js (App Router) + TypeScript + Tailwind · Supabase (auth, Postgres, storage) · Gemini Flash for reading papers · KaTeX for maths.

## Setup on your PC

1. Install [Node.js 20+](https://nodejs.org) and Git.
2. Clone and install:
   ```
   git clone https://github.com/xytherall/studybrain.git
   cd studybrain
   npm install
   ```
3. **Database:** open your Supabase project > SQL Editor, paste all of [`supabase/setup.sql`](supabase/setup.sql) and click Run.
4. **Keys:** copy `.env.example` to `.env.local` and fill it in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase > Project Settings > API
   - `SUPABASE_SERVICE_ROLE_KEY`: same page, the secret key. Keep it private.
   - `GEMINI_API_KEY`: free from [Google AI Studio](https://aistudio.google.com/apikey)
5. Run it: `npm run dev`, then open http://localhost:3000

### Optional: Google sign-in

Supabase > Authentication > Providers > Google. It needs a Google Cloud OAuth client; email + password works without it.
Add `http://localhost:3000/auth/callback` (and your live URL later) under Authentication > URL Configuration > Redirect URLs.

## Scripts

- `npm run dev`: start locally
- `npm test`: unit tests
- `npm run typecheck`, `npm run lint`
- `npm run build`: production build

## How it works (Phase 1)

1. **Upload** a PDF or photo. The file is fingerprinted (SHA-256); the same file is never sent to AI twice.
2. **Extraction:** PDFs are split into 4-page chunks and sent to Gemini, which returns questions, options, the answer (only if the paper shows it) and a topic from the exam's topic list.
3. **Review:** fix text, answer and topic, then approve. Only approved questions appear in tests.
4. **Test:** timed at real exam pace, time recorded per question.
5. **Results:** each wrong or skipped question gets a suggested reason (concept gap, silly error, time pressure, didn't attempt) that you confirm with one tap. Rules are in `src/lib/mistakes.ts`.
