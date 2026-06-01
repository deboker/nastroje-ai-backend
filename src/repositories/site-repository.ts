import { supabase } from '../lib/supabase.js';
import type { SiteContext, SiteRecord, SiteSettingsRecord } from '../types/site-context.js';

type SiteRow = SiteRecord & {
  api_key_hash?: string;
  site_settings?: SiteSettingsRecord | SiteSettingsRecord[] | null;
};

type SiteCreateInput = {
  name: string;
  domain: string;
  wp_url: string;
  language: string;
  api_key_hash: string;
  public_site_key: string;
  plan?: string;
  status?: string;
};

type RecentLeadRow = {
  id: string;
  contact_name?: string | null;
  contact_email?: string | null;
  company_name?: string | null;
  summary?: string | null;
  answers?: unknown;
  status?: string | null;
  source_page_url?: string | null;
  created_at: string;
};

type RecentConversationRow = {
  id: string;
  created_at: string;
};

type RecentUserMessageRow = {
  id: string;
  content: string;
  created_at: string;
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

  async createSite(input: SiteCreateInput): Promise<SiteRecord> {
    const { data, error } = await supabase
      .from('sites')
      .insert({
        name: input.name,
        domain: input.domain,
        wp_url: input.wp_url,
        language: input.language,
        api_key_hash: input.api_key_hash,
        public_site_key: input.public_site_key,
        plan: input.plan ?? 'mvp',
        status: input.status ?? 'active',
      })
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
    const [documentsCount, conversationsCount, messagesCount, leadsCount, lastSyncResult, siteResult, recentLeadsResult] =
      await Promise.all([
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
        supabase
          .from('lead_submissions')
          .select('id,contact_name,contact_email,company_name,status,summary,created_at')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false })
          .limit(5),
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
    if (recentLeadsResult.error) {
      throw recentLeadsResult.error;
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
      recentLeads: recentLeadsResult.data ?? [],
    };
  }

  async getAnalyticsSummary(siteId: string) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 29);
    since.setUTCHours(0, 0, 0, 0);
    const sinceIso = since.toISOString();

    const [recentChatsResult, recentLeadsResult, recentUserMessagesResult, chatMessagesCountResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('id,created_at')
        .eq('site_id', siteId)
        .eq('mode', 'chat')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('lead_submissions')
        .select('id,contact_name,contact_email,company_name,summary,answers,status,source_page_url,created_at')
        .eq('site_id', siteId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('messages')
        .select('id,content,created_at,conversations!inner(site_id,mode)')
        .eq('role', 'user')
        .eq('conversations.site_id', siteId)
        .eq('conversations.mode', 'chat')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('messages')
        .select('id, conversations!inner(site_id,mode)', { count: 'exact', head: true })
        .eq('conversations.site_id', siteId)
        .eq('conversations.mode', 'chat')
        .gte('created_at', sinceIso),
    ]);

    if (recentChatsResult.error) {
      throw recentChatsResult.error;
    }
    if (recentLeadsResult.error) {
      throw recentLeadsResult.error;
    }
    if (recentUserMessagesResult.error) {
      throw recentUserMessagesResult.error;
    }
    if (chatMessagesCountResult.error) {
      throw chatMessagesCountResult.error;
    }

    const recentChats = (recentChatsResult.data ?? []) as RecentConversationRow[];
    const recentLeads = (recentLeadsResult.data ?? []) as RecentLeadRow[];
    const recentUserMessages = (recentUserMessagesResult.data ?? []) as RecentUserMessageRow[];

    return {
      periodDays: 30,
      totals: {
        chats: recentChats.length,
        leadSubmissions: recentLeads.length,
        chatMessages: chatMessagesCountResult.count ?? 0,
      },
      topTopics: this.extractTopTopics(recentLeads, recentUserMessages),
      dailyActivity: this.buildDailyActivity(since, recentChats, recentLeads),
      recentLeadSignals: recentLeads.slice(0, 5).map((lead) => ({
        id: lead.id,
        contact: lead.contact_email || lead.contact_name || lead.company_name || lead.id,
        company_name: lead.company_name || null,
        summary: lead.summary || '',
        answers_text: this.stringifyAnswers(lead.answers),
        source_page_url: lead.source_page_url || null,
        created_at: lead.created_at,
        status: lead.status || 'new',
      })),
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

  private buildDailyActivity(since: Date, chats: RecentConversationRow[], leads: RecentLeadRow[]) {
    const chatCounts = new Map<string, number>();
    const leadCounts = new Map<string, number>();

    chats.forEach((entry) => {
      const key = entry.created_at.slice(0, 10);
      chatCounts.set(key, (chatCounts.get(key) ?? 0) + 1);
    });

    leads.forEach((entry) => {
      const key = entry.created_at.slice(0, 10);
      leadCounts.set(key, (leadCounts.get(key) ?? 0) + 1);
    });

    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(since);
      date.setUTCDate(since.getUTCDate() + index);
      const isoDate = date.toISOString().slice(0, 10);

      return {
        date: isoDate,
        label: this.formatDayMonth(isoDate),
        chats: chatCounts.get(isoDate) ?? 0,
        leads: leadCounts.get(isoDate) ?? 0,
      };
    });
  }

  private extractTopTopics(leads: RecentLeadRow[], messages: RecentUserMessageRow[]) {
    const topicMap = new Map<string, number>();
    const groups = [
      { label: 'Web asistent', patterns: ['web asistent', 'chatbot', 'chat bot', 'ai chat', 'chat na web'] },
      { label: 'Preklad textu', patterns: ['preklad', 'translation', 'translate'] },
      { label: 'Prepis reči', patterns: ['prepis', 'transkrip', 'transcript', 'audio do textu', 'video do textu'] },
      { label: 'Generátor obsahu', patterns: ['obsah', 'copy', 'clanok', 'článok', 'email', 'posty', 'reklamy'] },
      { label: 'Analytika dát', patterns: ['analytika', 'data', 'dáta', 'reporting', 'grafy'] },
      { label: 'AI na mieru', patterns: ['na mieru', 'automatiz', 'workflow', 'procesov'] },
      { label: 'SEO', patterns: ['seo'] },
      { label: 'Google Ads', patterns: ['google ads', 'ads'] },
      { label: 'E-shop', patterns: ['eshop', 'e-shop', 'woo', 'woocommerce', 'shop'] },
      { label: 'Webstránka', patterns: ['webstrank', 'web stránk', 'sajt', 'site', 'landing page'] },
      { label: 'Podpora', patterns: ['support', 'podpora', 'helpdesk'] },
    ];

    const pushText = (value: unknown, weight = 1) => {
      const normalized = this.normalizeText(value);
      if (!normalized) {
        return;
      }

      groups.forEach((group) => {
        if (group.patterns.some((pattern) => normalized.includes(this.normalizeText(pattern)))) {
          topicMap.set(group.label, (topicMap.get(group.label) ?? 0) + weight);
        }
      });
    };

    leads.forEach((lead) => {
      pushText(lead.summary, 2);
      pushText(lead.answers, 2);
      pushText(lead.source_page_url, 1);
    });

    messages.forEach((message) => {
      pushText(message.content, 1);
    });

    return Array.from(topicMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);
  }

  private stringifyAnswers(value: unknown) {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private normalizeText(value: unknown) {
    return this.stringifyAnswers(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private formatDayMonth(isoDate: string) {
    const [year, month, day] = isoDate.split('-');
    return `${day}.${month}.`;
  }
}
