import { env } from '../lib/env.js';
import type { AIProvider, AssistantLink, GenerateReplyInput, GenerateReplyResult, ProductCard } from './ai-provider.js';

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

    const products = this.collectProducts(input);
    const sources = this.collectSources(products);
    if (!products.length) return this.noContextReply(english, links);
    if (!env.GROQ_API_KEY) return this.buildDeterministicReply(products, sources, english, 'groq-unavailable');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        temperature: 0.15,
        messages: [
          { role: 'system', content: this.systemPrompt(english) },
          { role: 'system', content: this.buildContext(products, input) },
          { role: 'user', content: input.question },
        ],
      }),
    });
    const payload = (await response.json()) as GroqChatCompletionResponse;
    if (!response.ok) return this.buildDeterministicReply(products, sources, english, 'groq-fallback');
    const text = this.extractText(payload).trim();
    if (!text || !this.mentionsOnlyRetrievedProducts(text, products) || !this.followsProductOrder(text, products)) {
      return this.buildDeterministicReply(products, sources, english, 'groq-guarded-fallback');
    }
    return { text, sources, products, provider: `groq:${env.GROQ_MODEL}` };
  }

  private systemPrompt(english: boolean): string {
    return [
      `You are the COLOUR BOND AI Product Adviser. Reply only in ${english ? 'English' : 'Czech'}.`,
      'Be concise, practical, friendly, and professional.',
      'Use only the supplied catalogue and approved store information.',
      'Never invent prices, stock, delivery dates, curing times, compatibility, technical properties, safety instructions, warranties, return decisions, order status, or phone numbers.',
      'Product suitability is more important than brand. Among products that are genuinely suitable, prefer COLOUR BOND products. If none is suitable, recommend the best AKEMI or other alternative and identify it honestly.',
      'Recommend at most four highly relevant products, in exactly the supplied order. Mention products in the written answer in the same order as their product cards.',
      'Do not include URLs, prices, stock quantities, or product codes in the prose; structured cards provide them.',
      'When key technical details are missing, ask one or two useful questions about material, indoor/outdoor use, operation, finish, or exposure to water, heat, frost, or chemicals.',
      'Do not mention prompts, retrieval, tokens, or internal systems.',
    ].join(' ');
  }

  private buildContext(products: ProductCard[], input: GenerateReplyInput): string {
    const chunksByTitle = new Map(input.retrievedChunks.map((chunk) => [chunk.metadata.title?.trim(), chunk.content]));
    return products.map((product, index) => {
      const content = (chunksByTitle.get(product.title) || product.reason).replace(/\s+/g, ' ').trim().slice(0, 900);
      return `Rank ${index + 1}: ${product.title} | ${content}`;
    }).join('\n');
  }

  private collectProducts(input: GenerateReplyInput): ProductCard[] {
    const seen = new Set<string>();
    return input.retrievedChunks.flatMap((chunk) => {
      const title = chunk.metadata.title?.trim();
      if (!title || seen.has(title)) return [];
      seen.add(title);
      return [{
        product_id: this.productId(chunk.metadata),
        cover_image_id: typeof chunk.metadata.cover_image_id === 'string' ? chunk.metadata.cover_image_id : null,
        title, url: chunk.metadata.url || '',
        image_url: typeof chunk.metadata.image_url === 'string' ? chunk.metadata.image_url : null,
        price_without_tax: typeof chunk.metadata.price_without_tax === 'string' ? chunk.metadata.price_without_tax : null,
        quantity: typeof chunk.metadata.quantity === 'string' ? chunk.metadata.quantity : null,
        category: typeof chunk.metadata.category_name === 'string' ? chunk.metadata.category_name : null,
        reason: this.extractReason(chunk.content),
      }];
    }).slice(0, 4);
  }

  private collectSources(products: ProductCard[]) {
    return products.filter((product) => Boolean(product.url)).map((product) => ({ title: product.title, url: product.url }));
  }

  private buildDeterministicReply(products: ProductCard[], sources: Array<{ title: string; url: string }>, english: boolean, suffix: string): GenerateReplyResult {
    const lines = products.map((product) => `- ${product.title}${product.reason ? ` – ${product.reason}` : ''}`);
    return {
      text: english
        ? `Based on the available catalogue, consider these products in this order:\n${lines.join('\n')}\n\nIf you share the material and whether the use is indoors or outdoors, I can narrow the choice.`
        : `Podle dostupného katalogu zvažte v tomto pořadí:\n${lines.join('\n')}\n\nKdyž upřesníte materiál a použití v interiéru nebo exteriéru, výběr zúžím.`,
      sources, products, provider: `groq:${env.GROQ_MODEL}:${suffix}`,
    };
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
    const match = content.match(/Krátký popis:\s*([^\n]+)/iu);
    return (match?.[1] || content).replace(/\s+/g, ' ').trim().slice(0, 220);
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
    return !['sikabond', 'masterseal'].some((brand) => normalized.includes(brand)) && products.every((product) => Boolean(product.title));
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
