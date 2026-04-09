import type { Request } from 'express';

export type LeadQuestion = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
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
  sync_config: Record<string, unknown>;
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
