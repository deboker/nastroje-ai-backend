import { env } from '../lib/env.js';
import { HttpError } from '../lib/http-error.js';
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
      throw new HttpError(403, 'Site registration is disabled.');
    }

    const existingSite = await this.siteRepository.findByDomain(input.domain);
    if (existingSite) {
      throw new HttpError(409, 'Site is already registered.');
    }

    const siteToken = TokenService.generateSiteToken();
    const publicSiteKey = TokenService.generatePublicSiteKey();
    let site;
    try {
      site = await this.siteRepository.createSite({
        name: input.name,
        domain: input.domain,
        wp_url: input.wp_url,
        language: input.language || env.DEFAULT_LANGUAGE,
        api_key_hash: TokenService.hashToken(siteToken),
        public_site_key: publicSiteKey,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'Site is already registered.');
      }

      throw error;
    }

    const settings = await this.siteRepository.upsertSiteSettings(site.id, {
      assistant_name: input.site_settings?.assistant_name ?? 'Produktový poradce Colourbond.cz',
      welcome_message:
        input.site_settings?.welcome_message ?? 'Dobrý den, pomohu vám s výběrem produktů Colourbond.cz.',
      tone: input.site_settings?.tone ?? 'professional',
      theme: input.site_settings?.theme ?? 'teal',
      widget_enabled: input.site_settings?.widget_enabled ?? true,
      shortcode_enabled: input.site_settings?.shortcode_enabled ?? true,
      lead_capture_enabled: input.site_settings?.lead_capture_enabled ?? true,
      lead_flow_config: input.site_settings?.lead_flow_config ?? {
        form_name: 'Produktový dotaz',
        intro_message: 'Položte prosím dotaz k produktu Colourbond.cz.',
        success_message: 'Děkujeme za dotaz. Prodejce vás bude kontaktovat.',
        cta_label: 'Odeslat dotaz',
        questions: [
          { id: 'name', label: 'Jak se jmenujete?', type: 'text', required: true },
          { id: 'email', label: 'Jaký je váš e-mail?', type: 'email', required: true },
          { id: 'goal', label: 'S čím potřebujete poradit?', type: 'textarea', required: true },
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

function isUniqueViolation(error: unknown): error is { code: string } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}
