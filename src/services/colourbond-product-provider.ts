import { env } from '../lib/env.js';
import type { AIProvider, AssistantLink, GenerateReplyInput, GenerateReplyResult, ProductCard } from './ai-provider.js';
import { constraintsForQuestion, findUniqueProductReference, isGroqCatalogueInformationRequest, isProductSelectionRequest, MISSING_LOCATION_REPLIES, partitionProducts, resolveProductQuestionContext, selectMentionedProducts, truncateAtSentence, type GroundedProduct, type RejectedProduct } from './product-grounding.js';

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
    if (this.isGreeting(input.question) || this.isIdentityOrCapability(input.question)) {
      return {
        text: english
          ? 'I am the COLOUR BOND AI Product Adviser. I can help with product selection, basic use, applications, orders, delivery, complaints, and returns.'
          : 'Jsem AI produktový poradce COLOUR BOND. Pomohu s výběrem produktů, základním použitím, aplikacemi, objednávkami, dopravou, reklamacemi a vrácením zboží.',
        sources: [], products: [], provider: `groq:${env.GROQ_MODEL}:grounded-guide`,
      };
    }

    const questionContext = resolveProductQuestionContext(input.question, input.conversationHistory);
    const allowsGroqInformation = isGroqCatalogueInformationRequest(input.question);
    const requiresSelectionDetails = !allowsGroqInformation && (
      isProductSelectionRequest(input.question)
      || questionContext.relevantHistory.length > 0
      || questionContext.hasMaterial
      || questionContext.hasLocation
    );
    if (requiresSelectionDetails && !questionContext.hasMaterial) return this.missingMaterialReply(english);
    if (requiresSelectionDetails && !questionContext.hasLocation) return this.missingLocationReply(english);
    if (!allowsGroqInformation && !requiresSelectionDetails) return this.productIntentClarificationReply(english);

    const candidates = this.collectProducts(input);
    if (!candidates.length) return this.noContextReply(english, links);
    const partitioned = partitionProducts(candidates, questionContext.question);
    const referencedProduct = findUniqueProductReference(
      questionContext.question,
      candidates.map((candidate) => candidate.product),
    );
    const directlyRejected = partitioned.rejected.find((candidate) => candidate.product.title === referencedProduct?.title);
    if (directlyRejected) return this.constraintReply([directlyRejected], questionContext.question, english, directlyRejected.product.title);
    const orderedEligible = referencedProduct
      ? [...partitioned.eligible.filter((candidate) => candidate.product.title === referencedProduct.title), ...partitioned.eligible.filter((candidate) => candidate.product.title !== referencedProduct.title)]
      : partitioned.eligible;
    const selectedEligible = orderedEligible.slice(0, 3);
    const products = selectedEligible.map((candidate) => candidate.product);
    if (!products.length) return this.constraintReply(partitioned.rejected, questionContext.question, english);
    if (requiresSelectionDetails) {
      const safeProducts = this.withSafeSelectionReasons(selectedEligible, questionContext.question, english);
      return this.buildDeterministicSelectionReply(safeProducts, this.collectSources(safeProducts), english);
    }
    if (!env.GROQ_API_KEY) return this.informationFallback(english, this.collectSources(products), 'groq-unavailable');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        temperature: 0.15,
        messages: [
          { role: 'system', content: this.systemPrompt(english) },
          { role: 'system', content: this.buildContext(partitioned.eligible.slice(0, 3), partitioned.rejected) },
          ...questionContext.relevantHistory.map((turn) => ({
            role: 'system',
            content: `Relevant customer context from the immediately previous turn: ${turn.content}`,
          })),
          { role: 'user', content: input.question },
        ],
      }),
    });
    const payload = (await response.json()) as GroqChatCompletionResponse;
    if (!response.ok) return this.informationFallback(english, this.collectSources(products), 'groq-fallback');
    const text = this.extractText(payload).trim();
    const rejectedProducts = partitioned.rejected.map((candidate) => candidate.product);
    if (
      !text
      || Boolean(findUniqueProductReference(text, rejectedProducts))
      || !this.mentionsOnlyRetrievedProducts(text, products)
      || !this.followsProductOrder(text, products)
    ) {
      return this.informationFallback(english, this.collectSources(products), 'groq-guarded-fallback');
    }
    const mentionedProducts = selectMentionedProducts(text, products);
    return { text, sources: this.collectSources(mentionedProducts), products: mentionedProducts, provider: `groq:${env.GROQ_MODEL}` };
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

  private buildDeterministicSelectionReply(products: ProductCard[], sources: Array<{ title: string; url: string }>, english: boolean): GenerateReplyResult {
    const [mainProduct, ...alternatives] = products;
    const describe = (product: ProductCard) => `${product.title}${product.reason ? ` – ${product.reason}` : ''}`;
    const mainLine = mainProduct ? describe(mainProduct) : '';
    const mainSentence = /[.!?]$/u.test(mainLine) ? mainLine : `${mainLine}.`;
    const alternativeLines = alternatives.map((product) => `- ${describe(product)}`).join('\n');
    return {
      text: english
        ? `Based on the available catalogue, the main suitable choice is ${mainSentence}${alternativeLines ? `\n\nSuitable alternatives:\n${alternativeLines}` : ''}`
        : `Podle dostupného katalogu je hlavní vhodnou volbou ${mainSentence}${alternativeLines ? `\n\nVhodné alternativy:\n${alternativeLines}` : ''}`,
      sources, products, provider: 'deterministic:grounded-selection',
    };
  }

  private withSafeSelectionReasons(products: GroundedProduct[], question: string, english: boolean): ProductCard[] {
    const labels = constraintsForQuestion(question).map((constraint) => constraint.label);
    const reason = english
      ? `The catalogue explicitly confirms ${this.describeConstraints(labels, true)}.`
      : `Katalog výslovně potvrzuje ${this.describeConstraints(labels, false)}.`;
    return products.map((candidate) => ({ ...candidate.product, reason }));
  }

  private constraintReply(rejected: RejectedProduct[], question: string, english: boolean, explicitSubject?: string): GenerateReplyResult {
    const directlyAsked = rejected.find((candidate) => this.normalize(question).includes(this.normalize(candidate.product.title)));
    const subject = explicitSubject || directlyAsked?.product.title || (english ? 'the retrieved products' : 'nalezené produkty');
    const missingReasons = (explicitSubject ? rejected[0]?.reasons : directlyAsked?.reasons) || [...new Set(rejected.flatMap((candidate) => candidate.reasons))];
    const missing = this.describeConstraints(missingReasons, english);
    return {
      text: english
        ? `Based on the available catalogue data, I cannot safely recommend ${subject} for this use because ${missing} is not explicitly confirmed. Please contact our support for verification.`
        : `Podle dostupných katalogových údajů nemohu ${subject} pro toto použití bezpečně doporučit, protože není výslovně potvrzeno: ${missing}. Vhodnost případně ověřte u podpory.`,
      sources: [], products: [], provider: 'deterministic:constraint-filtered',
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

  private missingMaterialReply(english: boolean): GenerateReplyResult {
    return {
      text: english ? 'What material or materials will be bonded?' : 'Jaký materiál nebo materiály budete lepit?',
      sources: [], products: [], provider: 'deterministic:missing-material',
    };
  }

  private missingLocationReply(english: boolean): GenerateReplyResult {
    return {
      text: english ? MISSING_LOCATION_REPLIES.en : MISSING_LOCATION_REPLIES.cs,
      sources: [], products: [], provider: 'deterministic:missing-location',
    };
  }

  private productIntentClarificationReply(english: boolean): GenerateReplyResult {
    return {
      text: english
        ? 'Would you like help selecting a product, or information about a specific product?'
        : 'Chcete pomoci s výběrem produktu, nebo potřebujete informace o konkrétním produktu?',
      sources: [], products: [], provider: 'deterministic:product-intent-clarification',
    };
  }

  private informationFallback(english: boolean, sources: Array<{ title: string; url: string }>, suffix: string): GenerateReplyResult {
    return {
      text: english
        ? 'I cannot provide reliable catalogue details right now. Please consult the listed product source or contact our support.'
        : 'Spolehlivé katalogové informace teď nemohu poskytnout. Podívejte se prosím do uvedeného zdroje produktu nebo kontaktujte podporu.',
      sources, products: [], provider: `groq:${env.GROQ_MODEL}:${suffix}`,
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
  private isComplaintOrReturn(question: string): boolean { return /\b(reklamac\w*|vrac\w*|stiznost|complaint\w*|return\w*|refund\w*)\b/u.test(this.normalize(question)); }
  private isOrderQuestion(question: string): boolean { return /\b(objednav\w*|doprava|doruc\w*|zasilk\w*|order\w*|delivery|shipping|parcel)\b/u.test(this.normalize(question)); }
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
