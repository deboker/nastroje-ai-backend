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

type ConversationTurn = {
  role: 'system' | 'assistant' | 'user';
  content: string;
};

export type ProductQuestionContext = {
  question: string;
  relevantHistory: ConversationTurn[];
  hasMaterial: boolean;
  hasLocation: boolean;
};

export const MISSING_LOCATION_REPLIES = {
  cs: 'Bude stůl v interiéru, nebo v exteriéru?',
  en: 'Will the table be indoors or outdoors?',
} as const;

export function normalizeGroundingText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function constraintsForQuestion(question: string): ProductConstraint[] {
  const normalized = normalizeGroundingText(question);
  const constraints: ProductConstraint[] = [];
  const wantsOutdoor = /\b(venku|venkovn\w*|exterier\w*|outdoor\w*|outside|dest\w*|rain\w*|mraz\w*|frost\w*|prim\w* slunc\w*|direct sunlight)\b/u.test(normalized);
  if (wantsOutdoor) {
    constraints.push({
      label: 'explicitly confirmed outdoor use',
      matches: (text) => /\b(exterier\w*|venku|venkovn\w*|outdoor\w*|mraz\w*|frost\w*|povetrnost\w* vliv\w*|weather\w* resist\w*)\b/u.test(text),
    });
  }
  for (const candidate of MATERIAL_CONSTRAINTS) {
    if (candidate.question.test(normalized)) constraints.push(candidate.constraint);
  }
  return constraints;
}

export function resolveProductQuestionContext(
  question: string,
  conversationHistory: ConversationTurn[] = [],
): ProductQuestionContext {
  const currentHasMaterial = hasMaterialRequirement(question);
  const currentHasLocation = hasLocationRequirement(question);
  let relevantHistory: ConversationTurn[] = [];
  let resolvedQuestion = question;

  if (isShortLocationClarification(question, currentHasMaterial, currentHasLocation)) {
    const precedingTurns = [...conversationHistory];
    const lastTurn = precedingTurns.at(-1);
    if (lastTurn?.role === 'user' && normalizeGroundingText(lastTurn.content) === normalizeGroundingText(question)) {
      precedingTurns.pop();
    }
    const clarificationTurn = precedingTurns.at(-1);
    const previousUserTurn = precedingTurns.at(-2);
    if (
      clarificationTurn?.role === 'assistant'
      && isMissingLocationClarification(clarificationTurn.content)
      && previousUserTurn?.role === 'user'
      && isProductSelectionRequest(previousUserTurn.content)
      && hasMaterialRequirement(previousUserTurn.content)
      && !hasLocationRequirement(previousUserTurn.content)
    ) {
      relevantHistory = [previousUserTurn];
      resolvedQuestion = `${previousUserTurn.content}\n${question}`;
    }
  }

  return {
    question: resolvedQuestion,
    relevantHistory,
    hasMaterial: hasMaterialRequirement(resolvedQuestion),
    hasLocation: hasLocationRequirement(resolvedQuestion),
  };
}

export function isProductSelectionRequest(question: string): boolean {
  const normalized = normalizeGroundingText(question);
  const asksForInformation = isGroqCatalogueInformationRequest(question);
  const explicitSelection = /\b(vybrat|vyber\w*|doporuc\w*|vhodn\w*|kompatib\w*|co pouzit|mohu pouzit|lze pouzit|jake lepidlo|recommend\w*|suitab\w*|compatib\w*|can i use|choose|which adhesive|which product)\b/u.test(normalized);
  if (asksForInformation && !explicitSelection) {
    return false;
  }
  if (explicitSelection) return true;
  const hasNeedVerb = /\b(potrebuji|potreboval\w*|hledam|need|looking for)\b/u.test(normalized);
  const hasProductCategory = /\b(lepidl\w*|tmel\w*|cistic\w*|produkt\w*|adhesive\w*|glue\w*|sealant\w*|cleaner\w*|product\w*)\b/u.test(normalized);
  return hasNeedVerb && hasProductCategory;
}

export function isGroqCatalogueInformationRequest(question: string): boolean {
  const normalized = normalizeGroundingText(question);
  return /\b(jak se pouziva|jak pouzit|jak aplikovat|zpusob pouziti|navod k pouziti|bezpecnostn\w* list\w*|technick\w* list\w*|technick\w* udaj\w*|technick\w* informac\w*|doba vytvr\w*|informac\w* o (?:dobe )?vytvr\w*|doba zpracovani|how (?:do i|to) (?:use|apply)|usage instructions?|safety data sheet|technical data sheet|technical information|curing information|curing time|handling information|processing time)\b/u.test(normalized);
}

function isShortLocationClarification(question: string, hasMaterial: boolean, hasLocation: boolean): boolean {
  const normalized = normalizeGroundingText(question);
  const wordCount = normalized ? normalized.split(' ').length : 0;
  return !hasMaterial
    && hasLocation
    && wordCount <= 18
    && !isProductSelectionRequest(question)
    && !/\b(colour bond|color bond|everclear|akenova|akepox|platinum|cistic|cleaner|produkt\w*|product\w*)\b/u.test(normalized)
    && !/\b(neco jineho|jiny produkt|jine lepidlo|odlisny produkt|novy produkt|novy pozadavek|hledam (?:jiny|novy) produkt|something else|different product|another product|new product|new request|looking for (?:a )?(?:different|new) product)\b/u.test(normalized);
}

function isMissingLocationClarification(content: string): boolean {
  const normalized = normalizeGroundingText(content);
  return Object.values(MISSING_LOCATION_REPLIES)
    .some((reply) => normalizeGroundingText(reply) === normalized);
}

function hasMaterialRequirement(question: string): boolean {
  const normalized = normalizeGroundingText(question);
  return MATERIAL_CONSTRAINTS.some((candidate) => candidate.question.test(normalized));
}

function hasLocationRequirement(question: string): boolean {
  const normalized = normalizeGroundingText(question);
  return /\b(interier\w*|indoor\w*|inside|uvnitr\w*|vnitrni\w*|venku|venkovn\w*|exterier\w*|outdoor\w*|outside|dest\w*|rain\w*|mraz\w*|frost\w*|prim\w* slunc\w*|direct sunlight)\b/u.test(normalized);
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
