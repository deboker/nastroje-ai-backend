import { env } from '../lib/env.js';
import type { AIProvider, AssistantLink, GenerateReplyInput, GenerateReplyResult, ProductCard } from './ai-provider.js';
import { constraintsForQuestion, findUniqueProductReference, followsUsageProductClarification, isProductSelectionRequest, isProductTechnicalInformationRequest, isProductUsageRequest, MISSING_LOCATION_REPLIES, MISSING_USAGE_PRODUCT_REPLIES, partitionProducts, resolveProductQuestionContext, truncateAtSentence, type GroundedProduct, type RejectedProduct } from './product-grounding.js';

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

    const candidates = this.collectProducts(input);
    const usageIntent = isProductUsageRequest(input.question) || followsUsageProductClarification(input.conversationHistory);
    const informationIntent = isProductTechnicalInformationRequest(input.question);
    if (usageIntent) return this.usageReply(input.question, candidates, english, links);
    if (informationIntent) return this.informationReply(input.question, candidates, english, links);

    const questionContext = resolveProductQuestionContext(input.question, input.conversationHistory);
    const requiresSelectionDetails = (
      isProductSelectionRequest(input.question)
      || questionContext.relevantHistory.length > 0
      || questionContext.hasMaterial
      || questionContext.hasLocation
    );
    if (requiresSelectionDetails && !questionContext.hasMaterial) return this.missingMaterialReply(english);
    if (requiresSelectionDetails && !questionContext.hasLocation) return this.missingLocationReply(english);
    if (!requiresSelectionDetails) return this.productIntentClarificationReply(english);

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
    const safeProducts = this.withSafeSelectionReasons(selectedEligible, questionContext.question, english);
    return this.buildDeterministicSelectionReply(safeProducts, this.collectSources(safeProducts), english);
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
      'explicitly confirmed indoor use': ['použití v interiéru', 'indoor use'],
      'explicitly confirmed outdoor use': ['použití v exteriéru', 'outdoor use'],
      'ceramic or gres': ['vhodnost pro keramiku nebo gres', 'compatibility with ceramic or gres'],
      'natural stone': ['vhodnost pro přírodní kámen', 'compatibility with natural stone'],
      'artificial stone': ['vhodnost pro umělý kámen', 'compatibility with artificial stone'],
      marble: ['vhodnost pro mramor', 'compatibility with marble'],
      granite: ['vhodnost pro žulu', 'compatibility with granite'],
      glass: ['vhodnost pro sklo', 'compatibility with glass'],
      wood: ['vhodnost pro dřevo', 'compatibility with wood'],
      metal: ['vhodnost pro kov', 'compatibility with metal'],
    };
    const translated = reasons.map((reason) => translations[reason]?.[english ? 1 : 0] || reason);
    if (translated.length < 2) return translated.join('');
    return `${translated.slice(0, -1).join(', ')} ${english ? 'and' : 'a'} ${translated.at(-1)}`;
  }

  private noContextReply(english: boolean, links: AssistantLink[]): GenerateReplyResult {
    return {
      text: english
        ? 'I do not have enough reliable catalogue information to recommend a specific product. Please email info@colourbond.cz or use the contact form.'
        : 'V dostupných podkladech nemám dost spolehlivých informací k doporučení konkrétního produktu. Napište na info@colourbond.cz nebo použijte kontaktní formulář.',
      sources: [], products: [], links, provider: 'deterministic:grounded-no-context',
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
}
