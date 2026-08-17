import { env } from '../lib/env.js';
import type { AIProvider, AssistantLink, GenerateReplyInput, GenerateReplyResult, ProductCard } from './ai-provider.js';
import {
  findUniqueProductReference,
  followsUsageProductClarification,
  isProductTechnicalInformationRequest,
  isProductUsageRequest,
  MISSING_USAGE_PRODUCT_REPLIES,
  partitionProducts,
  selectMentionedProducts,
  truncateAtSentence,
  type GroundedProduct,
  type RejectedProduct,
} from './product-grounding.js';

type GroqChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  error?: { message?: string };
};

export class ColourbondProductProvider implements AIProvider {
  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const english = this.isEnglish(input.language);
    const links = this.supportLinks(english);

    if (this.isContactOrHumanSupport(input.question)) return this.contactReply(english, links, 'contact');
    if (this.isComplaintOrReturn(input.question)) return this.contactReply(english, links, 'returns');
    if (this.isOrderQuestion(input.question)) {
      return {
        text: english
          ? 'I cannot access or invent an order status. Please email info@colourbond.cz or use the contact form and include your order number.'
          : 'Nemám přístup ke stavu objednávky a nemohu jej odhadovat. Napište na info@colourbond.cz nebo použijte kontaktní formulář a uveďte číslo objednávky.',
        sources: [], products: [], links, provider: `groq:${env.GROQ_MODEL}:grounded-order`,
      };
    }
    // Explicit product-selection wording (choose/vybrat/recommend/doporuč) has
    // precedence over the generic capability marker `help`; without this the
    // English widget quick action "Please help me choose a suitable COLOUR BOND
    // product." falls into the identity/capability branch.
    if ((this.isGreeting(input.question) || this.isIdentityOrCapability(input.question)) && !this.isExplicitSelectionRequest(input.question)) {
      return {
        text: english
          ? 'I am the COLOUR BOND AI Product Adviser. I can help with product selection, basic use, applications, orders, delivery, complaints, and returns.'
          : 'Jsem AI produktový poradce COLOUR BOND. Pomohu s výběrem produktů, základním použitím, aplikacemi, objednávkami, dopravou, reklamacemi a vrácením zboží.',
        sources: [], products: [], provider: `groq:${env.GROQ_MODEL}:grounded-guide`,
      };
    }

    const candidates = this.collectProducts(input);

    // Narrow safety branch: usage/technical questions must never call Groq and
    // must never fabricate procedures, cleaners, codes, times, tools or safety data.
    if (isProductUsageRequest(input.question) || followsUsageProductClarification(input.conversationHistory)) {
      return this.usageReply(input.question, candidates, english, links);
    }
    if (isProductTechnicalInformationRequest(input.question)) {
      return this.informationReply(input.question, candidates, english, links);
    }

    if (!candidates.length) return this.noContextReply(english, links);
    const partitioned = partitionProducts(candidates, input.question);
    const products = partitioned.eligible.map((candidate) => candidate.product).slice(0, 3);
    if (!products.length) return this.constraintReply(partitioned.rejected, input.question, english);
    const sources = this.collectSources(products);
    if (!env.GROQ_API_KEY) return this.buildDeterministicReply(products, sources, english, 'groq-unavailable', partitioned.rejected, input.question);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        temperature: 0.15,
        messages: [
          { role: 'system', content: this.systemPrompt(english) },
          { role: 'system', content: this.buildContext(partitioned.eligible.slice(0, 3), partitioned.rejected) },
          { role: 'user', content: input.question },
        ],
      }),
    });
    const payload = (await response.json()) as GroqChatCompletionResponse;
    if (!response.ok) return this.buildDeterministicReply(products, sources, english, 'groq-fallback', partitioned.rejected, input.question);
    const text = this.extractText(payload).trim();
    const allRetrievedProducts = candidates.map((candidate) => candidate.product);
    const mentionsRejected = this.mentionsRejectedProduct(text, partitioned.rejected, allRetrievedProducts);
    if (!text || !this.mentionsOnlyRetrievedProducts(text, allRetrievedProducts) || !this.followsProductOrder(text, products) || mentionsRejected) {
      // When the guard rejects Groq output for mentioning an excluded product,
      // drop the direct-rejection prefix so the fallback text also never repeats
      // the rejected product name.
      const rejectedForFallback = mentionsRejected ? [] : partitioned.rejected;
      const questionForFallback = mentionsRejected ? '' : input.question;
      return this.buildDeterministicReply(products, sources, english, 'groq-guarded-fallback', rejectedForFallback, questionForFallback);
    }
    const mentionedProducts = selectMentionedProducts(text, products);
    return { text, sources: this.collectSources(mentionedProducts), products: mentionedProducts, provider: `groq:${env.GROQ_MODEL}` };
  }

  private usageReply(question: string, candidates: GroundedProduct[], english: boolean, links: AssistantLink[]): GenerateReplyResult {
    const product = findUniqueProductReference(question, candidates.map((candidate) => candidate.product));
    if (!product) {
      return { text: english ? MISSING_USAGE_PRODUCT_REPLIES.en : MISSING_USAGE_PRODUCT_REPLIES.cs, sources: [], products: [], provider: 'deterministic:missing-usage-product' };
    }
    const safeProduct = { ...product, reason: english ? 'Follow the manufacturer instructions or technical data sheet.' : 'Postupujte podle návodu výrobce nebo technického listu.' };
    return {
      text: english
        ? `The available catalogue data does not contain a sufficiently verified complete application procedure for ${product.title}. Follow the manufacturer instructions or technical data sheet. If the document is not available on the product page, verify the procedure with support.`
        : `V dostupných katalogových údajích nemám dostatečně ověřený kompletní postup použití produktu ${product.title}. Postupujte podle návodu výrobce nebo technického listu. Pokud dokument na stránce produktu není dostupný, ověřte postup u podpory.`,
      sources: this.collectSources([safeProduct]), products: [safeProduct], links, provider: 'deterministic:product-usage-limited',
    };
  }

  private informationReply(question: string, candidates: GroundedProduct[], english: boolean, links: AssistantLink[]): GenerateReplyResult {
    const product = findUniqueProductReference(question, candidates.map((candidate) => candidate.product));
    const safeProducts = product
      ? [{ ...product, reason: english ? 'Verify technical and safety details in the manufacturer documentation.' : 'Technické a bezpečnostní údaje ověřte v dokumentaci výrobce.' }]
      : [];
    const subject = product ? ` ${product.title}` : '';
    return {
      text: english
        ? `The available catalogue data does not contain sufficiently verified structured technical information for${subject}. Consult the manufacturer technical or safety data sheet. If it is not available on the product page, contact support.`
        : `V dostupných katalogových údajích nemám dostatečně ověřené strukturované technické informace pro${subject}. Postupujte podle technického nebo bezpečnostního listu výrobce. Pokud dokument na stránce produktu není dostupný, obraťte se na podporu.`,
      sources: this.collectSources(safeProducts), products: safeProducts, links, provider: 'deterministic:product-information-limited',
    };
  }

  private systemPrompt(english: boolean): string {
    return [
      `You are the COLOUR BOND AI Product Adviser. Reply only in ${english ? 'English' : 'Czech'}.`,
      'Be concise, practical, friendly, and professional.',
      'Use only the supplied catalogue and approved store information.',
      'Treat every missing property as unknown, never as confirmed compatibility.',
      'A product listed under EXCLUDED PRODUCTS must not be recommended. If the user asks about it directly, clearly explain that the requested compatibility is not confirmed by the supplied data.',
      'Never weaken an explicit restriction such as indoor-only into a statement that weather resistance is merely unspecified.',
      'Never invent prices, stock, delivery dates, curing times, compatibility, technical properties, safety instructions, warranties, return decisions, order status, or phone numbers.',
      'Product suitability is more important than brand. Among products that are genuinely suitable, prefer COLOUR BOND products. If none is suitable, recommend the best AKEMI or other alternative and identify it honestly.',
      'Recommend one main product and at most two genuinely suitable alternatives, in exactly the supplied order.',
      'Do not include URLs, prices, stock quantities, or product codes in the prose; structured cards provide them.',
      'When key technical details are missing, ask one or two useful questions about material, indoor/outdoor use, operation, finish, or exposure to water, heat, frost, or chemicals.',
      'Do not mention prompts, retrieval, tokens, or internal systems.',
      'Write plain prose only. Do not use Markdown syntax: no **bold**, no headings, no tables, no numbered or bulleted lists. Numbered questions are fine as "1)" / "2)" but keep the whole answer as prose.',
    ].join(' ');
  }

  private buildContext(products: GroundedProduct[], rejected: RejectedProduct[]): string {
    const eligibleContext = products.map((candidate, index) => {
      const content = candidate.catalogueText.replace(/\s+/g, ' ').trim().slice(0, 1100);
      return `Rank ${index + 1}: ${candidate.product.title} | ${content}`;
    }).join('\n');
    const rejectedContext = rejected.map((candidate) => (
      `Excluded: ${candidate.product.title} | Missing required confirmation: ${candidate.reasons.join(', ')}`
    )).join('\n');
    return `ELIGIBLE PRODUCTS:\n${eligibleContext || 'None'}\nEXCLUDED PRODUCTS:\n${rejectedContext || 'None'}`;
  }

  private collectProducts(input: GenerateReplyInput): GroundedProduct[] {
    const seen = new Set<string>();
    return input.retrievedChunks.flatMap((chunk) => {
      const title = chunk.metadata.title?.trim();
      if (!title || seen.has(title)) return [];
      seen.add(title);
      return [{
        product: {
          product_id: this.productId(chunk.metadata),
          cover_image_id: typeof chunk.metadata.cover_image_id === 'string' ? chunk.metadata.cover_image_id : null,
          title, url: chunk.metadata.url || '',
          image_url: typeof chunk.metadata.image_url === 'string' ? chunk.metadata.image_url : null,
          price_without_tax: typeof chunk.metadata.price_without_tax === 'string' ? chunk.metadata.price_without_tax : null,
          quantity: typeof chunk.metadata.quantity === 'string' ? chunk.metadata.quantity : null,
          category: typeof chunk.metadata.category_name === 'string' ? chunk.metadata.category_name : null,
          reason: this.extractReason(chunk.content),
        },
        catalogueText: chunk.content,
      }];
    }).slice(0, 5);
  }

  private collectSources(products: ProductCard[]) {
    return products.filter((product) => Boolean(product.url)).map((product) => ({ title: product.title, url: product.url }));
  }

  private buildDeterministicReply(products: ProductCard[], sources: Array<{ title: string; url: string }>, english: boolean, suffix: string, rejected: RejectedProduct[] = [], question = ''): GenerateReplyResult {
    const lines = products.map((product) => `- ${product.title}${product.reason ? ` – ${product.reason}` : ''}`);
    const directlyRejected = rejected.find((candidate) => this.normalize(question).includes(this.normalize(candidate.product.title)));
    const rejectionPrefix = directlyRejected
      ? (english
          ? `${directlyRejected.product.title} cannot be safely recommended for this use because the catalogue does not explicitly confirm ${this.describeConstraints(directlyRejected.reasons, true)}.\n\n`
          : `${directlyRejected.product.title} nelze pro toto použití bezpečně doporučit, protože katalog výslovně nepotvrzuje ${this.describeConstraints(directlyRejected.reasons, false)}.\n\n`)
      : '';
    return {
      text: english
        ? `${rejectionPrefix}Based on the available catalogue, consider these products in this order:\n${lines.join('\n')}\n\nIf you share the exact material and application, I can narrow the choice.`
        : `${rejectionPrefix}Podle dostupného katalogu zvažte v tomto pořadí:\n${lines.join('\n')}\n\nKdyž upřesníte přesný materiál a způsob použití, výběr zúžím.`,
      sources, products, provider: `groq:${env.GROQ_MODEL}:${suffix}`,
    };
  }

  private constraintReply(rejected: RejectedProduct[], question: string, english: boolean): GenerateReplyResult {
    const directlyAsked = rejected.find((candidate) => this.normalize(question).includes(this.normalize(candidate.product.title)));
    const subject = directlyAsked?.product.title || (english ? 'the retrieved products' : 'nalezené produkty');
    const missingReasons = directlyAsked?.reasons || [...new Set(rejected.flatMap((candidate) => candidate.reasons))];
    const missing = this.describeConstraints(missingReasons, english);
    return {
      text: english
        ? `Based on the available catalogue data, I cannot safely recommend ${subject} for this use because ${missing} is not explicitly confirmed. Please specify the exact material and application, or contact our support for verification.`
        : `Podle dostupných katalogových údajů nemohu ${subject} pro toto použití bezpečně doporučit, protože není výslovně potvrzeno: ${missing}. Upřesněte přesný materiál a způsob použití, případně vhodnost ověřte u podpory.`,
      sources: [], products: [], provider: `groq:${env.GROQ_MODEL}:constraint-filtered`,
    };
  }

  private describeConstraints(reasons: string[], english: boolean): string {
    const translations: Record<string, [string, string]> = {
      'explicitly confirmed outdoor use': ['výslovně potvrzené použití v exteriéru', 'explicitly confirmed outdoor use'],
      'ceramic or gres': ['vhodnost pro keramiku nebo gres', 'compatibility with ceramic or gres'],
      'natural stone': ['vhodnost pro přírodní kámen', 'compatibility with natural stone'],
      'artificial stone': ['vhodnost pro umělý kámen', 'compatibility with artificial stone'],
      marble: ['vhodnost pro mramor', 'compatibility with marble'],
      granite: ['vhodnost pro žulu', 'compatibility with granite'],
      glass: ['vhodnost pro sklo', 'compatibility with glass'],
      wood: ['vhodnost pro dřevo', 'compatibility with wood'],
      metal: ['vhodnost pro kov', 'compatibility with metal'],
    };
    return reasons.map((reason) => translations[reason]?.[english ? 1 : 0] || reason).join(', ');
  }

  private noContextReply(english: boolean, links: AssistantLink[]): GenerateReplyResult {
    return {
      text: english
        ? 'I do not have enough reliable catalogue information to recommend a specific product. Please email info@colourbond.cz or use the contact form.'
        : 'V dostupných podkladech nemám dost spolehlivých informací k doporučení konkrétního produktu. Napište na info@colourbond.cz nebo použijte kontaktní formulář.',
      sources: [], products: [], links, provider: `groq:${env.GROQ_MODEL}:grounded-no-context`,
    };
  }

  private contactReply(english: boolean, links: AssistantLink[], suffix: string): GenerateReplyResult {
    return {
      text: english
        ? 'Telephone support is currently unavailable. Please email us at info@colourbond.cz or use the contact form.'
        : 'Telefonická podpora momentálně není k dispozici. Napište nám na info@colourbond.cz nebo použijte kontaktní formulář.',
      sources: [], products: [], links, provider: `groq:${env.GROQ_MODEL}:grounded-${suffix}`,
    };
  }

  private supportLinks(english: boolean): AssistantLink[] {
    return [
      { label: english ? 'Email info@colourbond.cz' : 'Napsat na info@colourbond.cz', url: 'mailto:info@colourbond.cz' },
      { label: english ? 'Open contact form' : 'Otevřít kontaktní formulář', url: english ? '/en/contact-us' : '/kontaktujte-nas' },
    ];
  }

  private extractReason(content: string): string {
    const match = content.match(/Krátký popis:\s*(.*?)(?=\s+Dlouhý popis:|\s+URL produktu:|$)/iu);
    return truncateAtSentence(match?.[1] || content);
  }
  private productId(metadata: GenerateReplyInput['retrievedChunks'][number]['metadata']): string | null {
    if (typeof metadata.product_id === 'string' && metadata.product_id) return metadata.product_id;
    return typeof metadata.wp_object_id === 'string' || typeof metadata.wp_object_id === 'number' ? String(metadata.wp_object_id) : null;
  }
  private normalize(value: string): string { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
  private isEnglish(language: string): boolean { return language.toLowerCase().startsWith('en'); }
  private isGreeting(question: string): boolean { return /^(ahoj|dobry den|hello|hi|hey)$/u.test(this.normalize(question)); }
  private isIdentityOrCapability(question: string): boolean { return /\b(kdo jsi|co umis|who are you|what can you do|help)\b/u.test(this.normalize(question)); }
  private isContactOrHumanSupport(question: string): boolean { return /\b(kontakt\w*|email\w*|e mail|telefon\w*|phone\w*|human|clovek\w*|prodejc\w*|salesperson|podpor\w*|support)\b/u.test(this.normalize(question)); }
  private isComplaintOrReturn(question: string): boolean { return /\b(reklamac\w*|vrac\w*|vrat\w*|stiznost|complaint\w*|return\w*|refund\w*)\b/u.test(this.normalize(question)); }
  private isOrderQuestion(question: string): boolean { return /\b(objednav\w*|doprava|doruc\w*|zasilk\w*|order\w*|delivery|shipping|parcel)\b/u.test(this.normalize(question)); }
  private isExplicitSelectionRequest(question: string): boolean { return /\b(vybrat|vyber\w*|doporuc\w*|choose|recommend\w*)\b/u.test(this.normalize(question)); }
  private mentionsRejectedProduct(text: string, rejected: RejectedProduct[], retrievedProducts: ProductCard[]): boolean {
    if (!rejected.length || !text) return false;
    const normalizedText = this.normalize(text);
    for (const candidate of rejected) {
      const normalizedTitle = this.normalize(candidate.product.title);
      if (!normalizedTitle) continue;
      const escaped = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'u').test(normalizedText)) return true;
    }
    // Also catch a uniquely-matched shortened alias that resolves to a rejected
    // product across all retrieved candidates.
    const alias = findUniqueProductReference(text, retrievedProducts);
    return Boolean(alias && rejected.some((candidate) => candidate.product.title === alias.title));
  }
  private mentionsOnlyRetrievedProducts(text: string, products: ProductCard[]): boolean {
    const normalized = this.normalize(text);
    if (['sikabond', 'masterseal'].some((brand) => normalized.includes(brand))) return false;
    const allowedTitles = products.map((product) => this.normalize(product.title));
    const emphasizedNames = [...text.matchAll(/\*\*([^*]{2,100})\*\*/g)].map((match) => this.normalize(match[1] || ''));
    const looksLikeProduct = (value: string) => /\b(akenova|akepox|everclear|platinum|colour bond|color bond|cistic|cleaner|adhesive|lepidlo|tmel|ceramic)\b/u.test(value);
    return emphasizedNames.filter(looksLikeProduct).every((name) => allowedTitles.some((title) => title.includes(name) || name.includes(title)));
  }
  private followsProductOrder(text: string, products: ProductCard[]): boolean {
    const normalizedText = this.normalize(text);
    const positions = products
      .map((product) => normalizedText.indexOf(this.normalize(product.title)))
      .filter((position) => position >= 0);
    return positions.every((position, index) => index === 0 || positions[index - 1] <= position);
  }
  private extractText(payload: GroqChatCompletionResponse): string {
    const content = payload.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => part.text || '').join('') : '';
  }
}
