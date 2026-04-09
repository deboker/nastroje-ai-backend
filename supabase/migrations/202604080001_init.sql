create extension if not exists pgcrypto;
create extension if not exists vector;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null unique,
  wp_url text not null,
  api_key_hash text not null unique,
  public_site_key text unique,
  language text not null default 'sk',
  plan text not null default 'mvp',
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null unique references public.sites(id) on delete cascade,
  assistant_name text not null default 'Nastroje AI Assistant',
  welcome_message text not null default 'Dobrý deň, som váš AI asistent. Ako vám môžem pomôcť?',
  tone text not null default 'professional',
  theme text not null default 'teal',
  widget_enabled boolean not null default true,
  shortcode_enabled boolean not null default true,
  lead_capture_enabled boolean not null default true,
  lead_flow_config jsonb not null default '{}'::jsonb,
  sync_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  wp_object_id bigint not null,
  type text not null,
  title text not null default '',
  slug text not null default '',
  url text not null default '',
  excerpt text not null default '',
  content_raw text not null default '',
  content_clean text not null default '',
  status text not null default 'publish',
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  search_tsv tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(content_clean, '')
    )
  ) stored,
  unique(site_id, wp_object_id, type)
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default timezone('utc', now()),
  search_tsv tsvector generated always as (
    to_tsvector('simple', coalesce(content, ''))
  ) stored,
  unique(site_id, document_id, chunk_index)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  session_id text not null,
  user_identifier text,
  source_page_url text,
  mode text not null default 'chat',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.lead_forms (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null,
  slug text not null,
  mode text not null default 'brief',
  status text not null default 'active',
  intro_message text not null,
  success_message text not null,
  cta_label text not null default 'Vyplniť brief',
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(site_id, slug)
);

create table if not exists public.lead_submissions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  form_id uuid not null references public.lead_forms(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  session_id text not null,
  source_page_url text,
  contact_name text,
  contact_email text,
  company_name text,
  status text not null default 'new',
  answers jsonb not null default '[]'::jsonb,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('system', 'assistant', 'user')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  sync_type text not null,
  status text not null,
  items_processed integer not null default 0,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  error_message text
);

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_site_settings_site_id on public.site_settings(site_id);
create index if not exists idx_documents_site_id on public.documents(site_id);
create index if not exists idx_documents_type on public.documents(site_id, type);
create index if not exists idx_documents_last_synced_at on public.documents(site_id, last_synced_at desc);
create index if not exists idx_documents_search_tsv on public.documents using gin(search_tsv);
create index if not exists idx_document_chunks_site_id on public.document_chunks(site_id);
create index if not exists idx_document_chunks_document_id on public.document_chunks(document_id);
create index if not exists idx_document_chunks_search_tsv on public.document_chunks using gin(search_tsv);
create index if not exists idx_conversations_site_id on public.conversations(site_id);
create index if not exists idx_conversations_updated_at on public.conversations(site_id, updated_at desc);
create index if not exists idx_conversations_mode on public.conversations(site_id, mode);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id, created_at);
create index if not exists idx_lead_forms_site_id on public.lead_forms(site_id, status);
create index if not exists idx_lead_submissions_site_id on public.lead_submissions(site_id, created_at desc);
create index if not exists idx_lead_submissions_status on public.lead_submissions(site_id, status);
create index if not exists idx_sync_logs_site_id on public.sync_logs(site_id, started_at desc);
create index if not exists idx_usage_logs_site_id on public.usage_logs(site_id, created_at desc);

drop trigger if exists trg_sites_updated_at on public.sites;
create trigger trg_sites_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists trg_lead_forms_updated_at on public.lead_forms;
create trigger trg_lead_forms_updated_at
before update on public.lead_forms
for each row execute function public.set_updated_at();

drop trigger if exists trg_lead_submissions_updated_at on public.lead_submissions;
create trigger trg_lead_submissions_updated_at
before update on public.lead_submissions
for each row execute function public.set_updated_at();

alter table public.sites enable row level security;
alter table public.site_settings enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.lead_forms enable row level security;
alter table public.lead_submissions enable row level security;
alter table public.sync_logs enable row level security;
alter table public.usage_logs enable row level security;

comment on table public.document_chunks is 'Embedding column is nullable in the MVP and can be backfilled later when pgvector-based semantic search is enabled.';
