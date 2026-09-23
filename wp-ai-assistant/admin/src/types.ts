export type PluginSettings = {
  site_id: string;
  backend_url: string;
  site_token: string;
  public_site_key: string;
  assistant_name: string;
  welcome_message: string;
  language: string;
  tone: string;
  theme: string;
  ui_primary_color: string;
  ui_surface_color: string;
  ui_text_color: string;
  ui_border_color: string;
  ui_border_radius: number;
  widget_enabled: boolean;
  shortcode_enabled: boolean;
  lead_capture_enabled: boolean;
  lead_form_name: string;
  lead_intro_message: string;
  lead_success_message: string;
  lead_cta_label: string;
  lead_questions: Array<{
    id: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
    options?: string[];
  }>;
  allowed_post_types: string[];
  include_woocommerce_products: boolean;
  sync_frequency: string;
  privacy_notice: string;
  connection_status: string;
  connection_validated_at: string;
  last_backend_error: string;
};

export type DashboardResponse = {
  connectionStatus: string;
  siteStatus: string;
  siteId: string;
  widgetEnabled: boolean;
  lastSyncAt: string;
  stats: {
    totalDocuments: number;
    totalConversations: number;
    totalMessages: number;
    totalLeads: number;
  };
  syncState: {
    last_sync_at: string;
    last_sync_status: string;
    last_items_synced: number;
    logs: Array<Record<string, unknown>>;
  };
  logs: Array<Record<string, unknown>>;
};
