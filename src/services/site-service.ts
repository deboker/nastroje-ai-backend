import { env } from '../lib/env.js';
import { LeadRepository } from '../repositories/lead-repository.js';
import { SiteRepository } from '../repositories/site-repository.js';
import { TokenService } from './token-service.js';
import type { SiteSettingsRecord } from '../types/site-context.js';

type RegisterSiteInput = {
  name: string;
  domain: string;
  wp_url: string;
  language?: string;
  site_settings?: Partial<SiteSettingsRecord>;
};

export class SiteService {
  constructor(
    private readonly siteRepository: SiteRepository,
    private readonly leadRepository: LeadRepository,
  ) {}

  async registerSite(input: RegisterSiteInput) {
    if (env.OPEN_SITE_REGISTRATION !== 'true') {
      throw new Error('Open site registration is disabled. Issue the site token from your backend admin flow.');
    }

    const siteToken = TokenService.generateSiteToken();
    const publicSiteKey = TokenService.generatePublicSiteKey();
    const site = await this.siteRepository.upsertSite({
      name: input.name,
      domain: input.domain,
      wp_url: input.wp_url,
      language: input.language || env.DEFAULT_LANGUAGE,
      api_key_hash: TokenService.hashToken(siteToken),
      public_site_key: publicSiteKey,
    });

    const settings = await this.siteRepository.upsertSiteSettings(site.id, {
      assistant_name: input.site_settings?.assistant_name ?? 'Nastroje AI Assistant',
      welcome_message:
        input.site_settings?.welcome_message ?? 'Dobrý deň, som váš AI asistent. Ako vám môžem pomôcť?',
      tone: input.site_settings?.tone ?? 'professional',
      theme: input.site_settings?.theme ?? 'teal',
      widget_enabled: input.site_settings?.widget_enabled ?? true,
      shortcode_enabled: input.site_settings?.shortcode_enabled ?? true,
      lead_capture_enabled: input.site_settings?.lead_capture_enabled ?? true,
      lead_flow_config: input.site_settings?.lead_flow_config ?? {
        form_name: 'Predajný brief',
        intro_message: 'Pred tým, než pripravíme návrh, položím vám niekoľko stručných otázok.',
        success_message: 'Ďakujeme, brief sme prijali a ozveme sa vám.',
        cta_label: 'Spustiť brief',
        questions: [
          { id: 'name', label: 'Ako sa voláte?', type: 'text', required: true },
          { id: 'email', label: 'Aký je váš e-mail?', type: 'email', required: true },
          { id: 'company', label: 'Aká je vaša firma?', type: 'text', required: false },
          { id: 'goal', label: 'Čo potrebujete vyriešiť?', type: 'textarea', required: true },
          { id: 'timeline', label: 'Aký máte termín?', type: 'text', required: false },
        ],
      },
      sync_config: input.site_settings?.sync_config ?? {},
    });
    await this.leadRepository.upsertDefaultForm(
      site.id,
      settings.lead_capture_enabled,
      settings.lead_flow_config,
    );

    return {
      site,
      site_token: siteToken,
      public_site_key: publicSiteKey,
      settings,
    };
  }

  async updateSiteSettings(siteId: string, settings: SiteSettingsRecord) {
    const saved = await this.siteRepository.upsertSiteSettings(siteId, settings);
    await this.leadRepository.upsertDefaultForm(siteId, saved.lead_capture_enabled, saved.lead_flow_config);
    return saved;
  }

  async getDashboardSummary(siteId: string) {
    return this.siteRepository.getDashboardSummary(siteId);
  }

  async getAnalyticsSummary(siteId: string) {
    return this.siteRepository.getAnalyticsSummary(siteId);
  }
}
