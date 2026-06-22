import type { Request } from 'express';

export type LeadQuestion = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

export type SiteAiConfig = {
  /** A server-side system-prompt template. Supports {{assistantName}}, {{languageName}}, and {{tone}}. */
  system_prompt_template?: string;
  /** Applied only when the resolved site language is Slovak. */
  slovak_language_instructions?: string;
  /** Additional server-side instructions appended to the system prompt. */
  additional_instructions?: string;
  /** Keeps the historical Nastroje-specific canned-answer routing enabled when true. */
  enable_legacy_local_responses?: boolean;
};

export type SiteSettingsRecord = {
  assistant_name: string;
  welcome_message: string;
  tone: string;
  theme: string;
  widget_enabled: boolean;
  shortcode_enabled: boolean;
  lead_capture_enabled: boolean;
  lead_flow_config: {
    form_name?: string;
    intro_message?: string;
    success_message?: string;
    cta_label?: string;
    questions?: LeadQuestion[];
  };
  sync_config: Record<string, unknown> & {
    ai_config?: SiteAiConfig;
  };
  language?: string;
};

export type SiteRecord = {
  id: string;
  name: string;
  domain: string;
  wp_url: string;
  language: string;
  plan: string;
  status: string;
  public_site_key: string | null;
};

export type SiteContext = {
  site: SiteRecord;
  settings: SiteSettingsRecord | null;
};

export type AuthedRequest = Request & {
  siteContext?: SiteContext;
};
