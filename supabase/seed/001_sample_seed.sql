insert into public.sites (
  id,
  name,
  domain,
  wp_url,
  api_key_hash,
  public_site_key,
  language,
  plan,
  status
) values (
  '11111111-1111-1111-1111-111111111111',
  'Ukážkový web',
  'example.sk',
  'https://example.sk',
  'sample_hash_replace_me',
  'nsa_pub_demo',
  'sk',
  'mvp',
  'active'
)
on conflict (domain) do nothing;

insert into public.site_settings (
  site_id,
  assistant_name,
  welcome_message,
  tone,
  theme,
  widget_enabled,
  shortcode_enabled,
  sync_config
) values (
  '11111111-1111-1111-1111-111111111111',
  'Nastroje AI Assistant',
  'Dobrý deň, som váš AI asistent. Ako vám môžem pomôcť?',
  'professional',
  'teal',
  true,
  true,
  '{"allowed_post_types":["post","page"],"include_woocommerce_products":true,"sync_frequency":"manual"}'::jsonb
)
on conflict (site_id) do nothing;
