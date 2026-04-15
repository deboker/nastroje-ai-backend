import { env } from '../lib/env.js';
import type { AIProvider, GenerateReplyInput, GenerateReplyResult } from './ai-provider.js';

type AssistantIntent = {
  greeting: boolean;
  availability: boolean;
  capability: boolean;
  brief: boolean;
  contact: boolean;
  offerings: boolean;
  translation: boolean;
  transcription: boolean;
  contentGeneration: boolean;
  analytics: boolean;
  webAssistant: boolean;
  latestBlog: boolean;
  blog: boolean;
};

type ServiceOffer = {
  key: string;
  title: string;
  url: string;
  description: string;
};

type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const OFFERING_CATALOG: Array<{
  key: string;
  title: string;
  descriptionSk: string;
  descriptionEn: string;
  patterns: string[];
}> = [
    {
      key: 'translation',
      title: 'Preklad textu',
      descriptionSk: 'rýchly a presný preklad so zachovaním významu aj tónu',
      descriptionEn: 'fast and accurate text translation while preserving meaning and tone',
      patterns: ['preklad textu', 'preklad-textu', 'preklad', 'translate', 'translator'],
    },
    {
      key: 'transcription',
      title: 'Automatické prepisovanie textu',
      descriptionSk: 'prepis audio alebo videa do textu vrátane zhrnutia a ďalšieho spracovania',
      descriptionEn: 'audio and video transcription into text including summary and follow-up processing',
      patterns: ['prepis reci', 'prepis-reci', 'prepisovanie textu', 'prepis', 'transkript', 'audio', 'video'],
    },
    {
      key: 'content',
      title: 'Generátor obsahu',
      descriptionSk: 'tvorba textov v štýle značky pre posty, články, emaily, reklamy a popisy produktov',
      descriptionEn: 'brand-aligned content creation for posts, articles, emails, ads, and product copy',
      patterns: ['generator obsahu', 'generator-obsahu', 'obsah', 'copy', 'texty', 'emaily', 'reklamy'],
    },
    {
      key: 'analytics',
      title: 'Pokročilá analýza dát',
      descriptionSk: 'grafy, zhrnutia a odporúčania z dát pre reporting a rýchle rozhodovanie',
      descriptionEn: 'charts, summaries, and recommendations from data for reporting and faster decisions',
      patterns: ['analyza dat', 'analytika dat', 'analytika', 'analyza', 'data', 'reporting'],
    },
    {
      key: 'assistant',
      title: 'Web asistent',
      descriptionSk: 'okamžité odpovede a pomoc s navigáciou pre návštevníkov webu, služieb aj produktov',
      descriptionEn: 'instant answers and navigation help for visitors across the website, services, and products',
      patterns: ['web asistent', 'web-asistent', 'asistent', 'chatbot'],
    },
    {
      key: 'custom-ai',
      title: 'AI na mieru',
      descriptionSk: 'prispôsobenie AI nástrojov podľa procesov, tónu komunikácie a šablón značky',
      descriptionEn: 'tailored AI setup based on business processes, tone of voice, and brand templates',
      patterns: ['ai na mieru', 'podla vasich procesov', 'podľa vašich procesov'],
    },
    {
      key: 'setup',
      title: 'Odporúčanie + nastavenie',
      descriptionSk: 'výber vhodného riešenia a nastavenie workflow, promptov a pravidiel kvality',
      descriptionEn: 'choosing the right solution and setting up workflows, prompts, and quality rules',
      patterns: ['odporucanie + nastavenie', 'odporúčanie + nastavenie', 'workflow', 'prompty', 'sablony', 'šablóny'],
    },
  ];

export class GroqProvider implements AIProvider {
  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is missing.');
    }

    const sources = this.collectSources(input);
    const localReply = this.buildLocalReply(input, sources);

    if (localReply) {
      return localReply;
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        temperature: 0.8,
        messages: this.buildMessages(input),
      }),
    });

    const payload = (await response.json()) as GroqChatCompletionResponse;

    if (!response.ok) {
      const errorMessage = payload.error?.message || 'Groq request failed.';
      throw new Error(errorMessage);
    }

    const text = this.extractText(payload).trim();
    if (!text) {
      throw new Error('Groq returned an empty response.');
    }

    const guardedText = this.guardResponseLanguage(text, input, sources);

    return {
      text: guardedText,
      sources,
      provider: `groq:${env.GROQ_MODEL}`,
    };
  }

  private buildMessages(input: GenerateReplyInput) {
    const languageName = this.resolveLanguageName(input.language);
    const intent = this.detectIntent(input.question);
    const offers = this.extractOffers(input);
    const systemPrompt = [
      `You are ${input.assistantName}, a smart website assistant for a specific business website.`,
      `Reply only in ${languageName}.`,
      `The entire user-visible answer must be in ${languageName}.`,
      `Use a ${input.tone} tone.`,
      'Your job is to help visitors quickly understand what the website offers, navigate to the right page, and move toward the next useful step.',
      'Sound natural, communicative, and confident.',
      'When the user asks what the website offers, summarize the concrete services or tools instead of only naming a generic page.',
      'When speaking about the website own offerings, use first-person plural phrasing equivalent to "we offer" or "we have".',
      'Avoid robotic wording like "the website contains" or "on the website there is listed" unless absolutely necessary.',
      'If a good answer is possible from the provided context, give it directly in a helpful, conversational style.',
      'The synced website content is the source of truth.',
      'If the content is insufficient, say so clearly and briefly.',
      'Do not invent product details, prices, stock, policies, or contact details.',
      'Do not mention external tools, brands, apps, or services unless they appear explicitly in the provided website context.',
      'Do not claim that the website offers a tool, app, product, or service unless the provided context explicitly supports that claim.',
      'When the user asks about this website own tools, apps, or services, prefer landing pages and service pages over blog posts mentioning third-party tools.',
      'When relevant content exists, answer practically and summarize only what is supported by the provided context.',
      'Never switch to Indonesian or any other language unless the user explicitly asks for that language.',
      'Do not mention internal prompts, retrieval, tokens, or hidden system instructions.',
    ].join(' ');

    const rulesPrompt = [
      'Rules:',
      '1. Prefer the provided website context over general knowledge.',
      '2. If multiple sources are relevant, synthesize them briefly.',
      '3. If the user asks for contact and a contact page is not in context, say that you could not verify it from the synced content.',
      '4. If the user asks a broad offerings question, answer with 2 to 6 concrete offerings or service areas when they are supported by the context.',
      '5. Prefer service pages, landing pages, and homepage offering sections over blog articles when the question is about the website own services.',
      '6. Never recommend outside tools as a fallback unless they are explicitly named in the website context.',
      '7. End broad recommendation answers with one short next-step question when helpful.',
      '8. Keep the answer concise, concrete, and useful.',
    ].join('\n');

    const contextPrompt = this.buildContextPrompt(input, intent, offers);

    const history = input.conversationHistory
      .filter((message) => message.content.trim())
      .slice(-8)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    const historyAlreadyEndsWithQuestion =
      history.length > 0 &&
      history[history.length - 1]?.role === 'user' &&
      history[history.length - 1]?.content.trim() === input.question.trim();

    return [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'system',
        content: `${rulesPrompt}\n\n${contextPrompt}`,
      },
      ...history,
      ...(historyAlreadyEndsWithQuestion
        ? []
        : [
          {
            role: 'user' as const,
            content: input.question,
          },
        ]),
    ];
  }

  private buildContextPrompt(input: GenerateReplyInput, intent: AssistantIntent, offers: ServiceOffer[]): string {
    if (!input.retrievedChunks.length) {
      return 'Website context:\nNo reliable synced content was found for this question.';
    }

    const contextSections: string[] = [];

    if (offers.length > 0) {
      contextSections.push(
        [
          'Structured offerings found in the synced website context:',
          ...offers.slice(0, 8).map((offer) => `- ${offer.title}${offer.url ? ` | ${offer.url}` : ''} | ${offer.description}`),
        ].join('\n'),
      );
    }

    if (intent.offerings) {
      contextSections.push(
        'The user is asking about the website own offering. Prefer your own services, tools, app pages, and service sections over generic blog content.',
      );
    }

    if (intent.latestBlog || intent.blog) {
      contextSections.push('The user is asking about blog or article content. Prefer post-type sources when available.');
    }

    const chunks = input.retrievedChunks.slice(0, 4).map((chunk, index) => {
      const title = chunk.metadata?.title || 'Untitled';
      const url = chunk.metadata?.url || '';
      const type = chunk.metadata?.type || '';
      const content = chunk.content.replace(/\s+/g, ' ').trim();

      return [`Source ${index + 1}: ${title}`, type ? `Type: ${type}` : '', url ? `URL: ${url}` : '', `Content: ${content}`]
        .filter(Boolean)
        .join('\n');
    });

    contextSections.push(`Website context:\n${chunks.join('\n\n')}`);
    return contextSections.join('\n\n');
  }

  private collectSources(input: GenerateReplyInput): Array<{ title: string; url: string }> {
    const seen = new Set<string>();
    const sources: Array<{ title: string; url: string }> = [];
    const deferredSources: Array<{ title: string; url: string }> = [];

    for (const chunk of input.retrievedChunks) {
      const url = chunk.metadata?.url?.trim();
      if (!url || seen.has(url)) {
        continue;
      }

      seen.add(url);
      const nextSource = {
        title: chunk.metadata?.title?.trim() || 'Zdroj',
        url,
      };

      if (this.isLowValueSource(nextSource.title, nextSource.url)) {
        deferredSources.push(nextSource);
      } else {
        sources.push(nextSource);
      }

      if (sources.length >= 3) {
        break;
      }
    }

    if (!sources.length) {
      return deferredSources.slice(0, 3);
    }

    return sources;
  }

  private extractText(payload: GroqChatCompletionResponse): string {
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => part.text || '')
        .join('')
        .trim();
    }

    return '';
  }

  private buildLocalReply(
    input: GenerateReplyInput,
    sources: Array<{ title: string; url: string }>,
  ): GenerateReplyResult | null {
    const question = this.normalizeQuestion(input.question);
    const slovak = this.isSlovak(input.language);
    const intent = this.detectIntent(input.question);
    const offers = this.extractOffers(input);
    const offerSources = offers.map((offer) => ({ title: offer.title, url: offer.url })).filter((offer) => offer.url);

    if (intent.greeting || intent.availability) {
      return {
        text: slovak
          ? 'Dobrý deň, rád pomôžem. Viem vás rýchlo nasmerovať na služby, vlastné AI riešenia, články alebo stručný brief.'
          : 'Hello, I am here to help. I can quickly guide you to the right service, tool, article, or a short brief.',
        sources: [],
        provider: `groq:${env.GROQ_MODEL}:local`,
      };
    }

    if (intent.capability) {
      return {
        text: slovak
          ? 'Viem pomôcť s orientáciou na webe, odporučiť vhodnú službu alebo článok a v prípade záujmu vás nasmerovať aj na stručný brief.'
          : 'I can help you navigate the website, suggest a relevant service or article, and guide you to a short brief if needed.',
        sources: [],
        provider: `groq:${env.GROQ_MODEL}:local`,
      };
    }

    if (intent.brief) {
      return {
        text: slovak
          ? 'Jasné. Ak chcete poslať dopyt alebo zadanie, otvorte kartu Stručný brief. Hneď sa spustí krátka séria otázok.'
          : 'Sure. If you want to send an inquiry or request, open the Short Brief tab and a short question flow will start immediately.',
        sources: [
          {
            title: slovak ? 'Otvoriť stručný brief' : 'Open short brief',
            url: '#brief',
          },
        ],
        provider: `groq:${env.GROQ_MODEL}:local`,
      };
    }

    if (intent.offerings && offers.length > 0) {
      const topOffers = offers.slice(0, 6);
      const offerList = this.joinLabels(topOffers.map((offer) => offer.title), slovak);
      const summary = topOffers
        .slice(0, 3)
        .map((offer) => `${offer.title} (${offer.description})`)
        .join(slovak ? ', ' : ', ');

      return {
        text: slovak
          ? `Máme tu vlastné AI riešenia a služby. Konkrétne napríklad ${offerList}. Stručne: ${summary}. Ak chcete, poviem vám viac o konkrétnej službe alebo vás rovno nasmerujem na správnu stránku.`
          : `We offer our own AI services and solutions here. For example: ${offerList}. In short: ${summary}. If you want, I can explain a specific service or point you to the right page.`,
        sources: offerSources.slice(0, 4),
        provider: `groq:${env.GROQ_MODEL}:local`,
      };
    }

    if (intent.translation) {
      const translationPage = offers.find((page) => page.key === 'translation') || offerSources[0] || sources[0];
      const offer = offers.find((page) => page.key === 'translation');
      if (translationPage) {
        return {
          text: slovak
            ? `Áno, máme tu ${translationPage.title}. Je to služba zameraná na ${offer?.description || 'rýchly a presný preklad textu so zachovaním významu aj tónu'}.`
            : `Yes, we offer ${translationPage.title}. It is focused on ${offer?.description || 'fast and accurate text translation while preserving meaning and tone'}.`,
          sources: [translationPage],
          provider: `groq:${env.GROQ_MODEL}:local`,
        };
      }
    }

    if (intent.transcription) {
      const transcriptionPage = offers.find((page) => page.key === 'transcription') || sources[0];
      if (transcriptionPage) {
        return {
          text: slovak
            ? `Áno, máme tu ${transcriptionPage.title}. Táto služba je určená na prepis audio alebo videa do textu vrátane ďalšieho spracovania.`
            : `Yes, we offer ${transcriptionPage.title}. This service is meant for turning audio or video into text with follow-up processing.`,
          sources: [{ title: transcriptionPage.title, url: transcriptionPage.url }],
          provider: `groq:${env.GROQ_MODEL}:local`,
        };
      }
    }

    if (intent.analytics) {
      const analyticsPage = offers.find((page) => page.key === 'analytics') || sources[0];
      if (analyticsPage) {
        return {
          text: slovak
            ? `Áno, máme tu ${analyticsPage.title}. Je zameraná na grafy, zhrnutia a odporúčania z vašich dát pre reporting a rozhodovanie.`
            : `Yes, we offer ${analyticsPage.title}. It focuses on charts, summaries, and recommendations from your data.`,
          sources: [{ title: analyticsPage.title, url: analyticsPage.url }],
          provider: `groq:${env.GROQ_MODEL}:local`,
        };
      }
    }

    if (intent.contentGeneration) {
      const contentPage = offers.find((page) => page.key === 'content') || sources[0];
      if (contentPage) {
        return {
          text: slovak
            ? `Áno, máme tu ${contentPage.title}. Pomáha tvoriť texty v štýle značky, napríklad posty, články, emaily, reklamy alebo popisy produktov.`
            : `Yes, we offer ${contentPage.title}. It helps create brand-aligned posts, articles, emails, ads, and product descriptions.`,
          sources: [{ title: contentPage.title, url: contentPage.url }],
          provider: `groq:${env.GROQ_MODEL}:local`,
        };
      }
    }

    if (intent.webAssistant) {
      const assistantPage = offers.find((page) => page.key === 'assistant') || sources[0];
      if (assistantPage) {
        return {
          text: slovak
            ? `Áno, máme tu ${assistantPage.title}. Slúži na okamžité odpovede a pomoc s navigáciou pre návštevníkov webu, služieb aj produktov.`
            : `Yes, we offer ${assistantPage.title}. It provides instant answers and navigation help for website visitors.`,
          sources: [{ title: assistantPage.title, url: assistantPage.url }],
          provider: `groq:${env.GROQ_MODEL}:local`,
        };
      }
    }

    if (intent.latestBlog || intent.blog) {
      const blogSource = this.pickBlogSource(input);
      if (blogSource) {
        return {
          text: slovak
            ? `Najrelevantnejší článok, ktorý som k tomu našiel, je ${blogSource.title}. Ak chcete, môžem zhrnúť, o čom je, alebo vás naň rovno nasmerovať.`
            : `The most relevant article I found is ${blogSource.title}. If you want, I can summarize it or point you to it directly.`,
          sources: [blogSource],
          provider: `groq:${env.GROQ_MODEL}:local`,
        };
      }
    }

    if (input.retrievedChunks.length && sources.length > 0 && intent.contact) {
      return {
        text: slovak
          ? `Relevantnú kontaktnú alebo súvisiacu stránku som našiel. Najrýchlejšie bude otvoriť: ${sources[0].title}.`
          : `I found a relevant contact-related page. The fastest next step is to open: ${sources[0].title}.`,
        sources,
        provider: `groq:${env.GROQ_MODEL}:local`,
      };
    }

    if (!input.retrievedChunks.length) {
      return {
        text: slovak
          ? 'Toto som v zosynchronizovanom obsahu webu nevedel spoľahlivo overiť. Skúste sa spýtať na konkrétnu službu, appku, stránku alebo článok.'
          : 'I could not reliably verify this from the synced website content. Please ask about a specific service, tool, page, or article.',
        sources: [],
        provider: `groq:${env.GROQ_MODEL}:local`,
      };
    }

    return null;
  }

  private resolveLanguageName(language: string): string {
    const normalized = language.trim().toLowerCase();

    switch (normalized) {
      case 'sk':
      case 'slovak':
      case 'slovenčina':
      case 'slovencina':
        return 'Slovak';
      case 'cs':
      case 'czech':
        return 'Czech';
      case 'de':
      case 'german':
        return 'German';
      case 'en':
      case 'english':
        return 'English';
      default:
        return normalized || 'English';
    }
  }

  private guardResponseLanguage(
    text: string,
    input: GenerateReplyInput,
    sources: Array<{ title: string; url: string }>,
  ): string {
    if (!this.isSlovak(input.language)) {
      return text;
    }

    const normalized = this.normalizeQuestion(text);
    if (!this.looksIndonesian(normalized)) {
      return text;
    }

    const question = this.normalizeQuestion(input.question);

    if (this.isContactQuestion(question) && sources.length > 0) {
      return `Kontakt alebo súvisiacu stránku som našiel v obsahu webu. Odporúčam otvoriť: ${sources[0].title}.`;
    }

    if (sources.length > 0) {
      return `Na webe som našiel relevantný obsah. Odporúčam otvoriť: ${sources[0].title}. Ak chcete presnejšiu odpoveď, spýtajte sa na konkrétnu službu, appku alebo článok.`;
    }

    return 'V zosynchronizovanom obsahu webu som nenašiel spoľahlivú odpoveď. Skúste otázku spresniť, spýtať sa na konkrétnu stránku, službu alebo článok.';
  }

  private isSlovak(language: string): boolean {
    return language.trim().toLowerCase().startsWith('sk');
  }

  private normalizeQuestion(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isLowValueSource(title: string, url: string): boolean {
    const normalized = this.normalizeQuestion(`${title} ${url}`);
    return /\b(privacy|cookie|cookies|gdpr|ochrany osobnych udajov|zasady ochrany|zasady pouzivania|podmienky)\b/u.test(
      normalized,
    );
  }

  private looksIndonesian(value: string): boolean {
    return /\b(saya|adalah|maaf|anda|tidak|dapat|menemukan|konteks|relevan|menjawab|pertanyaan)\b/u.test(
      value,
    );
  }

  private isGreeting(question: string): boolean {
    return /^(ahoj+|cau+|dobry den|dobry vecer|hello+|hi+|hey+)$/u.test(question);
  }

  private isAvailabilityQuestion(question: string): boolean {
    return [
      'tu si',
      'si tu',
      'si tam',
      'si online',
      'are you there',
      'are you here',
      'you there',
    ].includes(question);
  }

  private isCapabilityQuestion(question: string): boolean {
    return [
      'co vies',
      'ako vies pomoct',
      'help',
      'pomoc',
      'what can you do',
      'what do you do',
      'what',
    ].includes(question);
  }

  private isBriefQuestion(question: string): boolean {
    return /\b(brief|brif|dopyt|zadanie|konzultaci|konzultaciu|konzultaciu|strucny brief|strucni brief)\b/u.test(
      question,
    );
  }

  private isContactQuestion(question: string): boolean {
    return [
      'mate kontakt',
      'kontakt',
      'contact',
      'ako vas kontaktovat',
    ].includes(question);
  }

  private isOwnOfferingsQuestion(question: string): boolean {
    return /\b(vase|mate|ponukate|sluzby|nastroje|nastroj|app|aplikaci)\b/u.test(question);
  }

  private isTranslationQuestion(question: string): boolean {
    return /\b(preklad|prelozit|preklad textu|translator)\b/u.test(question);
  }

  private isTranscriptionQuestion(question: string): boolean {
    return /\b(prepis|prepisovanie|transkript|audio|video)\b/u.test(question);
  }

  private isContentGenerationQuestion(question: string): boolean {
    return /\b(generator obsahu|obsah|texty|copy|emaily|reklamy)\b/u.test(question);
  }

  private isAnalyticsQuestion(question: string): boolean {
    return /\b(analytika|analyza|data|reporting)\b/u.test(question);
  }

  private isWebAssistantQuestion(question: string): boolean {
    return /\b(web asistent|asistent|chatbot)\b/u.test(question);
  }

  private detectIntent(questionInput: string): AssistantIntent {
    const question = this.normalizeQuestion(questionInput);
    const blog = /\b(blog|clanok|clanky|článok|články|article|post)\b/u.test(question);
    return {
      greeting: this.isGreeting(question),
      availability: this.isAvailabilityQuestion(question),
      capability: this.isCapabilityQuestion(question),
      brief: this.isBriefQuestion(question),
      contact: this.isContactQuestion(question),
      offerings: this.isOwnOfferingsQuestion(question),
      translation: this.isTranslationQuestion(question),
      transcription: this.isTranscriptionQuestion(question),
      contentGeneration: this.isContentGenerationQuestion(question),
      analytics: this.isAnalyticsQuestion(question),
      webAssistant: this.isWebAssistantQuestion(question),
      latestBlog: blog && /\b(najnovsi|najnovsie|latest|novy|novsi)\b/u.test(question),
      blog,
    };
  }

  private extractOffers(input: GenerateReplyInput): ServiceOffer[] {
    const offers = new Map<string, ServiceOffer>();

    for (const chunk of input.retrievedChunks) {
      const title = chunk.metadata?.title?.trim() || '';
      const url = chunk.metadata?.url?.trim() || '';
      const slug = chunk.metadata?.slug?.trim() || '';
      const haystack = this.normalizeQuestion(`${title} ${url} ${slug} ${chunk.content}`);

      for (const definition of OFFERING_CATALOG) {
        const matches = definition.patterns.some((pattern) => haystack.includes(this.normalizeQuestion(pattern)));
        if (!matches) {
          continue;
        }

        const existing = offers.get(definition.key);
        const nextTitle = title && title.length <= 120 ? title : definition.title;
        const nextUrl = url || existing?.url || '';

        offers.set(definition.key, {
          key: definition.key,
          title: nextTitle || existing?.title || definition.title,
          url: nextUrl,
          description: this.isSlovak(input.language) ? definition.descriptionSk : definition.descriptionEn,
        });
      }
    }

    return Array.from(offers.values()).sort((left, right) => {
      if (left.url && !right.url) {
        return -1;
      }
      if (!left.url && right.url) {
        return 1;
      }
      return left.title.localeCompare(right.title);
    });
  }

  private pickBlogSource(input: GenerateReplyInput): { title: string; url: string } | null {
    for (const chunk of input.retrievedChunks) {
      const type = this.normalizeQuestion(chunk.metadata?.type || '');
      const title = chunk.metadata?.title?.trim() || '';
      const url = chunk.metadata?.url?.trim() || '';

      if (!url) {
        continue;
      }

      if (type === 'post' || type === 'article') {
        return { title: title || 'Článok', url };
      }
    }

    return null;
  }

  private joinLabels(values: string[], slovak: boolean) {
    if (values.length <= 1) {
      return values[0] || '';
    }

    if (values.length === 2) {
      return slovak ? `${values[0]} a ${values[1]}` : `${values[0]} and ${values[1]}`;
    }

    const last = values[values.length - 1];
    const rest = values.slice(0, -1).join(', ');
    return slovak ? `${rest} a ${last}` : `${rest}, and ${last}`;
  }
}
