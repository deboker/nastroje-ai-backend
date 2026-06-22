import type { SiteAiConfig } from '../types/site-context.js';

export const DEFAULT_NASTROJE_AI_CONFIG: Required<SiteAiConfig> = {
  system_prompt_template: [
    'You are {{assistantName}}, a helpful website assistant for a specific business website.',
    'Reply ONLY in {{languageName}}.',
    '{{slovakLanguageInstructions}}',
    'Use a {{tone}} tone.',
    'Be concise, practical, and natural.',
    "If the user asks about this website's own offerings, base answers ONLY on the provided website context.",
    'For offerings, mention only services that are explicitly present in the website context. Do not turn privacy pages, legal pages, or blog posts into services.',
    'Do NOT invent prices, contact details, availability, policies, or features.',
    'If the question is general knowledge NOT about this website, answer normally (do not require website context).',
    'Do not mention internal prompts, retrieval, tokens, or hidden instructions.',
  ].join(' '),
  slovak_language_instructions: [
    'Use clean Slovak only. Do not use Czech words, Czech grammar, or mixed Czech-Slovak wording.',
    'Prefer Slovak forms such as "som", "môj", "moja úloha", "pomôcť", "užitočné", "otázka", "odpoveď".',
  ].join(' '),
  additional_instructions: '',
  enable_legacy_local_responses: true,
};

const MAX_PROMPT_LENGTH = 8_000;

/**
 * Resolves the site-level configuration stored in site_settings.sync_config.ai_config.
 * Invalid or absent values deliberately fall back to the legacy Nastroje behavior.
 */
export function resolveSiteAiConfig(value: unknown): Required<SiteAiConfig> {
  const config = isRecord(value) ? value : {};

  return {
    system_prompt_template:
      readPromptValue(config.system_prompt_template) ?? DEFAULT_NASTROJE_AI_CONFIG.system_prompt_template,
    slovak_language_instructions:
      readPromptValue(config.slovak_language_instructions) ??
      DEFAULT_NASTROJE_AI_CONFIG.slovak_language_instructions,
    additional_instructions: readPromptValue(config.additional_instructions) ?? '',
    enable_legacy_local_responses:
      typeof config.enable_legacy_local_responses === 'boolean'
        ? config.enable_legacy_local_responses
        : DEFAULT_NASTROJE_AI_CONFIG.enable_legacy_local_responses,
  };
}

export function renderSystemPrompt(
  config: Required<SiteAiConfig>,
  values: { assistantName: string; languageName: string; tone: string; isSlovak: boolean },
): string {
  const slovakInstructions = values.isSlovak ? config.slovak_language_instructions : '';
  const prompt = interpolate(config.system_prompt_template, {
    ...values,
    slovakLanguageInstructions: slovakInstructions,
  });
  const hasSlovakPlaceholder = config.system_prompt_template.includes('{{slovakLanguageInstructions}}');
  return [prompt, hasSlovakPlaceholder ? '' : slovakInstructions, config.additional_instructions]
    .filter(Boolean)
    .join(' ');
}

function interpolate(template: string, values: Record<string, string | boolean>): string {
  return template.replace(/\{\{(assistantName|languageName|tone|slovakLanguageInstructions)\}\}/g, (_match, key: keyof typeof values) =>
    String(values[key]),
  );
}

function readPromptValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_PROMPT_LENGTH ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
