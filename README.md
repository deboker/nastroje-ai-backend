# Nastroje AI Backend

Express + Supabase starter backend for the WordPress plugin.

## WordPress Plugin

`wp-ai-assistant/` contains the installable WordPress plugin, including its runtime assets.
Version 0.1.16 fixes the Conversations panel to request the latest 30 conversations,
ordered by most recent activity. The REST proxy also defaults to 30 when no page size is supplied.

To package it, run from this repository:

```sh
zip -r /tmp/nastroje-ai-assistant-wordpress-0.1.16.zip wp-ai-assistant -x '*/node_modules/*' '*/.DS_Store'
```

Upload the ZIP through WordPress **Plugins > Add New > Upload Plugin** and replace
the installed version. Pushing this repository does not update the WordPress plugin.

The deployed admin implementation is `wp-ai-assistant/admin/build/admin.js`.
The React files in `admin/src/` are an older scaffold; do not rebuild the admin from
that scaffold, as it would overwrite the working runtime with incomplete functionality.

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
3. Add `GROQ_API_KEY` if you want live LLM responses. Without it, the backend falls back to `MockAIProvider`.
4. Install dependencies with `npm install`.
5. Start the API with `npm run dev`.

## LLM Provider

- `GROQ_API_KEY` enables the Groq-backed provider.
- `GROQ_MODEL` defaults to `openai/gpt-oss-20b`.
- Chat requests are still grounded in synced site content from Supabase before the model answers.
- The backend keeps one provider key server-side for all tenant sites. Tenant isolation still happens through `site_id` and `site_token`.

## Security Notes

- WordPress never gets the Supabase service role key.
- WordPress stores only the per-site token issued by the backend.
- Every backend route except `/api/sites/register` is authenticated by `X-Site-Token`.
- All records are written with `site_id`, and reads always filter by that `site_id`.
- Open registration is intended only for controlled onboarding. Disable `OPEN_SITE_REGISTRATION` in production SaaS flows and issue tokens from your backend admin flow instead.
