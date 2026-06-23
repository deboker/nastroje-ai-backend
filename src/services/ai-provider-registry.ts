import type { SiteContext } from '../types/site-context.js';
import type { AIProvider } from './ai-provider.js';

export const NASTROJE_WEBSITE_PROFILE = 'nastroje_website';
export const COLOURBOND_PRODUCTS_PROFILE = 'colourbond_products';

export class AIProviderRegistry {
  constructor(private readonly providers: ReadonlyMap<string, AIProvider>) {}

  forSite(siteContext: SiteContext): { profile: string; provider: AIProvider } {
    const profile = this.readProfile(siteContext);
    const provider = this.providers.get(profile);
    if (!provider) throw new Error(`No AI provider is configured for assistant profile "${profile}".`);
    return { profile, provider };
  }

  private readProfile(siteContext: SiteContext): string {
    const aiConfig = siteContext.settings?.sync_config.ai_config;
    if (aiConfig && typeof aiConfig === 'object' && !Array.isArray(aiConfig)) {
      const profile = (aiConfig as Record<string, unknown>).assistant_profile;
      if (typeof profile === 'string' && profile.trim()) return profile.trim();
    }

    throw new Error(`Site ${siteContext.site.id} has no ai_config.assistant_profile.`);
  }
}
