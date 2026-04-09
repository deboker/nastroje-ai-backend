# Nastroje AI Backend

Express + Supabase starter backend for the WordPress plugin.

## Responsibilities

- register WordPress sites and issue site tokens
- validate site-scoped plugin requests
- ingest synced WordPress content into `documents` and `document_chunks`
- handle AI chat requests against synced site content
- handle conversational brief / lead capture submissions
- expose dashboard, conversations, and lead submission data to the plugin admin

## API Surface

- `POST /api/sites/register`
- `POST /api/sites/validate`
- `POST /api/sites/settings`
- `POST /api/sync/batch`
- `GET /api/dashboard/summary`
- `GET /api/conversations`
- `GET /api/conversations/:conversationId`
- `POST /api/conversations`
- `POST /api/chat/message`
- `GET /api/leads/form`
- `POST /api/leads/submit`
- `GET /api/leads/submissions`
- `GET /api/leads/submissions/:submissionId`

## Run

1. Copy `.env.example` to `.env`.
2. Create the Supabase project and run `backend/supabase/migrations/202604080001_init.sql`.
3. Install dependencies with `npm install`.
4. Start the API with `npm run dev`.

## Security Notes

- WordPress never gets the Supabase service role key.
- WordPress stores only the per-site token issued by the backend.
- Every backend route except `/api/sites/register` is authenticated by `X-Site-Token`.
- All records are written with `site_id`, and reads always filter by that `site_id`.
- Open registration is intended only for controlled onboarding. Disable `OPEN_SITE_REGISTRATION` in production SaaS flows and issue tokens from your backend admin flow instead.
