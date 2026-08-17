import type { ProductCard } from './ai-provider.js';

export type ProductConstraint = {
  label: string;
  matches: (catalogueText: string) => boolean;
};

export type GroundedProduct = {
  product: ProductCard;
  catalogueText: string;
};

export type RejectedProduct = GroundedProduct & {
  reasons: string[];
};

type ConversationTurn = {
  role: 'system' | 'assistant' | 'user';
  content: string;
};

const MATERIAL_CONSTRAINTS: Array<{ question: RegExp; constraint: ProductConstraint }> = [
  { question: /\b(keram\w*|gres\w*|ceramic\w*|porcelain\w*)\b/u, constraint: { label: 'ceramic or gres', matches: (text) => /\b(keram\w*|gres\w*|ceramic\w*|porcelain\w*)\b/u.test(text) } },
  { question: /\b(prirodn\w* kamen\w*|natural stone)\b/u, constraint: { label: 'natural stone', matches: (text) => /\b(prirodn\w* kamen\w*|natural stone)\b/u.test(text) } },
  { question: /\b(umel\w* kamen\w*|artificial stone|engineered stone)\b/u, constraint: { label: 'artificial stone', matches: (text) => /\b(umel\w* kamen\w*|artificial stone|engineered stone)\b/u.test(text) } },
  { question: /\b(mramor\w*|marble)\b/u, constraint: { label: 'marble', matches: (text) => /\b(mramor\w*|marble)\b/u.test(text) } },
  { question: /\b(zul\w*|granit\w*|granite)\b/u, constraint: { label: 'granite', matches: (text) => /\b(zul\w*|granit\w*|granite)\b/u.test(text) } },
  { question: /\b(sklo|skla|glass)\b/u, constraint: { label: 'glass', matches: (text) => /\b(sklo|skla|glass)\b/u.test(text) } },
  { question: /\b(drev\w*|wood\w*)\b/u, constraint: { label: 'wood', matches: (text) => /\b(drev\w*|wood\w*)\b/u.test(text) } },
  { question: /\b(kov\w*|metal\w*)\b/u, constraint: { label: 'metal', matches: (text) => /\b(kov\w*|metal\w*)\b/u.test(text) } },
];

export const MISSING_USAGE_PRODUCT_REPLIES = {
  cs: 'Který konkrétní produkt chcete použít? Napište jeho název.',
  en: 'Which specific product would you like to use? Please enter its name.',
} as const;

export function normalizeGroundingText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function constraintsForQuestion(question: string): ProductConstraint[] {
  const normalized = normalizeGroundingText(question);
  const constraints: ProductConstraint[] = [];
  const wantsOutdoor = /\b(venkov\w*|exterier\w*|outdoor\w*|outside|dest\w*|rain\w*|mraz\w*|frost\w*|prim\w* slunc\w*|direct sunlight)\b/u.test(normalized);
  if (wantsOutdoor) {
    constraints.push({
      label: 'explicitly confirmed outdoor use',
      matches: (text) => /\b(exterier\w*|venkov\w*|outdoor\w*|mraz\w*|frost\w*|povetrnost\w* vliv\w*|weather\w* resist\w*)\b/u.test(text),
    });
  }
  for (const candidate of MATERIAL_CONSTRAINTS) {
    if (candidate.question.test(normalized)) constraints.push(candidate.constraint);
  }
  return constraints;
}

export function partitionProducts(products: GroundedProduct[], question: string): { eligible: GroundedProduct[]; rejected: RejectedProduct[] } {
  const constraints = constraintsForQuestion(question);
  if (!constraints.length) return { eligible: products, rejected: [] };
  const eligible: GroundedProduct[] = [];
  const rejected: RejectedProduct[] = [];
  for (const candidate of products) {
    const normalizedCatalogue = normalizeGroundingText(candidate.catalogueText);
    const reasons = constraints.filter((constraint) => !constraint.matches(normalizedCatalogue)).map((constraint) => constraint.label);
    if (reasons.length) rejected.push({ ...candidate, reasons });
    else eligible.push(candidate);
  }
  return { eligible, rejected };
}

export function truncateAtSentence(value: string, maxLength = 320): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, maxLength + 1);
  const sentenceEnds = [...candidate.matchAll(/[.!?](?=\s|$)/g)];
  const lastSentenceEnd = sentenceEnds.at(-1)?.index;
  if (typeof lastSentenceEnd === 'number' && lastSentenceEnd >= Math.min(80, maxLength / 2)) return candidate.slice(0, lastSentenceEnd + 1).trim();
  const lastSpace = candidate.lastIndexOf(' ', maxLength);
  return `${candidate.slice(0, lastSpace > 0 ? lastSpace : maxLength).trim()}…`;
}

export function selectMentionedProducts(text: string, products: ProductCard[], limit = 3): ProductCard[] {
  const normalizedText = normalizeGroundingText(text);
  return products.filter((product) => {
    const title = normalizeGroundingText(product.title);
    if (!title) return false;
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escapedTitle}(?=\\s|$)`, 'u').test(normalizedText);
  }).slice(0, limit);
}

const LOCATION_OR_EXPOSURE_PATTERN = /\b(interier\w*|indoor\w*|inside|uvnitr\w*|vnitrni\w*|venku|venkovn\w*|exterier\w*|outdoor\w*|outside|dest\w*|rain\w*|mraz\w*|frost\w*|prim\w* slunc\w*|direct sunlight)\b/u;

const NEW_TOPIC_PATTERN = /\b(neco jineho|jiny produkt|jine lepidlo|odlisny produkt|novy produkt|novy pozadavek|hledam (?:jiny|novy) produkt|different product|another product|new product|new request|looking for (?:a )?(?:different|new) product|now i need)\b/u;

// Narrow, single-turn context helper. If the current message adds location or
// exposure but no new material, and the immediately preceding user turn had a
// recognized material, produce a combined query for retrieval and grounding.
// The helper never issues clarifying prompts, never inspects assistant state,
// and never inherits across an explicit new-topic phrase.
export function resolveContextualQuery(question: string, conversationHistory: ConversationTurn[] = []): string {
  const normalizedCurrent = normalizeGroundingText(question);
  if (hasRecognizedMaterial(normalizedCurrent)) return question;
  if (!LOCATION_OR_EXPOSURE_PATTERN.test(normalizedCurrent)) return question;
  if (NEW_TOPIC_PATTERN.test(normalizedCurrent)) return question;

  for (let index = conversationHistory.length - 1; index >= 0; index -= 1) {
    const turn = conversationHistory[index];
    if (turn.role !== 'user') continue;
    const normalizedTurn = normalizeGroundingText(turn.content);
    if (normalizedTurn === normalizedCurrent) continue;
    if (hasRecognizedMaterial(normalizedTurn)) return `${turn.content}\n${question}`;
    return question;
  }
  return question;
}

function hasRecognizedMaterial(normalized: string): boolean {
  return MATERIAL_CONSTRAINTS.some((candidate) => candidate.question.test(normalized));
}

export function isProductUsageRequest(question: string): boolean {
  const normalized = normalizeGroundingText(question);
  return /\b(jak produkt pouzit|jak se pouziva|jak pouzit|jak aplikovat|zpusob pouziti|navod k pouziti|poradit s pouzitim|rada s pouzitim|jak spravne aplikovat|how (?:do i|to) (?:use|apply)|usage instructions?|how is .* (?:used|applied)|advice on how to use|help using)\b/u.test(normalized);
}

export function isProductTechnicalInformationRequest(question: string): boolean {
  const normalized = normalizeGroundingText(question);
  return /\b(bezpecnost\w*|bezpecnostn\w* list\w*|technick\w* list\w*|technick\w* udaj\w*|technick\w* informac\w*|vytvr\w*|doba zpracovani|zpracovatelsk\w* cas\w*|manipulac\w*|michan\w*|pomer\w* michan\w*|aplikacn\w* teplot\w*|certifik\w*|chemick\w* odolnost\w*|styk\w* s potravin\w*|safety|safety data sheet|technical data sheet|technical information|curing|processing time|working time|handling|mixing|mixing ratio|application temperature|certification|food contact|chemical resistance)\b/u.test(normalized);
}

export function followsUsageProductClarification(conversationHistory: ConversationTurn[] = []): boolean {
  const precedingTurns = [...conversationHistory];
  const lastTurn = precedingTurns.at(-1);
  if (lastTurn?.role === 'user') precedingTurns.pop();
  const assistantTurn = precedingTurns.at(-1);
  return assistantTurn?.role === 'assistant'
    && Object.values(MISSING_USAGE_PRODUCT_REPLIES).some((reply) => normalizeGroundingText(reply) === normalizeGroundingText(assistantTurn.content));
}

const GENERIC_PRODUCT_NAME_TOKENS = new Set([
  'adhesive', 'bond', 'cleaner', 'colour', 'color', 'glue', 'lepidlo', 'produkt', 'product', 'sealant', 'tmel',
]);

export function findUniqueProductReference(question: string, products: ProductCard[]): ProductCard | undefined {
  const normalizedQuestion = normalizeProductName(question);
  const fullMatches = products.filter((product) => containsProductAlias(normalizedQuestion, normalizeProductName(product.title)));
  if (fullMatches.length === 1) return fullMatches[0];
  if (fullMatches.length > 1) return undefined;

  const aliasMatches = products.filter((product) => productAliases(product.title).some((alias) => (
    containsProductAlias(normalizedQuestion, alias)
  )));
  return aliasMatches.length === 1 ? aliasMatches[0] : undefined;
}

function productAliases(title: string): string[] {
  const tokens = normalizeProductName(title).split(' ').filter(Boolean);
  const aliases: string[] = [];
  for (let length = tokens.length - 1; length >= 1; length -= 1) {
    const aliasTokens = tokens.slice(0, length);
    const meaningfulTokens = aliasTokens.filter((token) => !GENERIC_PRODUCT_NAME_TOKENS.has(token));
    if (!meaningfulTokens.some((token) => token.length >= 4 || /[+\d]/u.test(token))) continue;
    aliases.push(aliasTokens.join(' '));
  }
  return aliases;
}

function normalizeProductName(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}+\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function containsProductAlias(value: string, alias: string): boolean {
  if (!alias) return false;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'u').test(value);
}
