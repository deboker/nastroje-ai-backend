import { supabase } from '../lib/supabase.js';
import type { SiteContext, SiteRecord, SiteSettingsRecord } from '../types/site-context.js';

type SiteRow = SiteRecord & {
  api_key_hash?: string;
  site_settings?: SiteSettingsRecord | SiteSettingsRecord[] | null;
};

type SiteUpsertInput = {
  name: string;
  domain: string;
  wp_url: string;
  language: string;
  api_key_hash: string;
  public_site_key: string;
  plan?: string;
  status?: string;
};

export class SiteRepository {
  async findByTokenHash(apiKeyHash: string): Promise<SiteContext | null> {
    const { data, error } = await supabase
      .from('sites')
      .select('id,name,domain,wp_url,language,plan,status,public_site_key,site_settings(*)')
      .eq('api_key_hash', apiKeyHash)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? this.mapSiteContext(data as SiteRow) : null;
  }

  async findByDomain(domain: string): Promise<SiteContext | null> {
    const { data, error } = await supabase
      .from('sites')
      .select('id,name,domain,wp_url,language,plan,status,public_site_key,site_settings(*)')
      .eq('domain', domain)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? this.mapSiteContext(data as SiteRow) : null;
  }

  async upsertSite(input: SiteUpsertInput): Promise<SiteRecord> {
    const { data, error } = await supabase
      .from('sites')
      .upsert(
        {
          name: input.name,
          domain: input.domain,
          wp_url: input.wp_url,
          language: input.language,
          api_key_hash: input.api_key_hash,
          public_site_key: input.public_site_key,
          plan: input.plan ?? 'mvp',
          status: input.status ?? 'active',
        },
        {
          onConflict: 'domain',
        },
      )
      .select('id,name,domain,wp_url,language,plan,status,public_site_key')
      .single();

    if (error) {
      throw error;
    }

    return data as SiteRecord;
  }

  async upsertSiteSettings(siteId: string, input: SiteSettingsRecord): Promise<SiteSettingsRecord> {
    const { data, error } = await supabase
      .from('site_settings')
      .upsert(
        {
          site_id: siteId,
          assistant_name: input.assistant_name,
          welcome_message: input.welcome_message,
          tone: input.tone,
          theme: input.theme,
          widget_enabled: input.widget_enabled,
          shortcode_enabled: input.shortcode_enabled,
          lead_capture_enabled: input.lead_capture_enabled,
          lead_flow_config: input.lead_flow_config,
          sync_config: input.sync_config,
        },
        {
          onConflict: 'site_id',
        },
      )
      .select(
        'assistant_name,welcome_message,tone,theme,widget_enabled,shortcode_enabled,lead_capture_enabled,lead_flow_config,sync_config',
      )
      .single();

    if (error) {
      throw error;
    }

    return data as SiteSettingsRecord;
  }

  async getDashboardSummary(siteId: string) {
    const [documentsCount, conversationsCount, messagesCount, leadsCount, lastSyncResult, siteResult] = await Promise.all([
      supabase.from('documents').select('id', { count: 'exact', head: true }).eq('site_id', siteId),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('site_id', siteId),
      supabase
        .from('messages')
        .select('id, conversations!inner(site_id)', { count: 'exact', head: true })
        .eq('conversations.site_id', siteId),
      supabase.from('lead_submissions').select('id', { count: 'exact', head: true }).eq('site_id', siteId),
      supabase
        .from('sync_logs')
        .select('id,status,finished_at,items_processed')
        .eq('site_id', siteId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('sites').select('id,name,domain,wp_url,language,plan,status,public_site_key').eq('id', siteId).single(),
    ]);

    if (documentsCount.error) {
      throw documentsCount.error;
    }
    if (conversationsCount.error) {
      throw conversationsCount.error;
    }
    if (messagesCount.error) {
      throw messagesCount.error;
    }
    if (leadsCount.error) {
      throw leadsCount.error;
    }
    if (lastSyncResult.error && lastSyncResult.error.code !== 'PGRST116') {
      throw lastSyncResult.error;
    }
    if (siteResult.error) {
      throw siteResult.error;
    }

    return {
      site: siteResult.data as SiteRecord,
      stats: {
        totalDocuments: documentsCount.count ?? 0,
        totalConversations: conversationsCount.count ?? 0,
        totalMessages: messagesCount.count ?? 0,
        totalLeads: leadsCount.count ?? 0,
      },
      lastSync: lastSyncResult.data,
    };
  }

  private mapSiteContext(row: SiteRow): SiteContext {
    const settings = Array.isArray(row.site_settings) ? row.site_settings[0] ?? null : row.site_settings ?? null;
    return {
      site: {
        id: row.id,
        name: row.name,
        domain: row.domain,
        wp_url: row.wp_url,
        language: row.language,
        plan: row.plan,
        status: row.status,
        public_site_key: row.public_site_key ?? null,
      },
      settings,
    };
  }
}
