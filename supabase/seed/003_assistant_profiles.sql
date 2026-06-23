-- Assign the provider profile per site. Run this once in Supabase SQL Editor.
-- It is idempotent and changes no documents, conversations, or other sites.

update public.site_settings as settings
set sync_config = jsonb_set(
  coalesce(settings.sync_config, '{}'::jsonb),
  '{ai_config}',
  coalesce(settings.sync_config -> 'ai_config', '{}'::jsonb) || jsonb_build_object('assistant_profile', 'nastroje_website'),
  true
)
from public.sites as site
where settings.site_id = site.id
  and lower(site.domain) = 'nastroje-ai.sk';

update public.site_settings as settings
set sync_config = jsonb_set(
  coalesce(settings.sync_config, '{}'::jsonb),
  '{ai_config}',
  coalesce(settings.sync_config -> 'ai_config', '{}'::jsonb) || jsonb_build_object('assistant_profile', 'colourbond_products'),
  true
)
from public.sites as site
where settings.site_id = site.id
  and lower(site.domain) = 'colourbond.cz';
