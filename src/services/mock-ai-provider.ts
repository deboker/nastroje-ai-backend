import type { AIProvider, GenerateReplyInput, GenerateReplyResult } from './ai-provider.js';

export class MockAIProvider implements AIProvider {
  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const normalizedQuestion = input.question.trim().toLowerCase();
    const sources = input.retrievedChunks
      .filter((chunk) => chunk.metadata?.url)
      .slice(0, 3)
      .map((chunk) => ({
        title: chunk.metadata?.title || 'Zdroj',
        url: chunk.metadata?.url || '',
      }));

    if (this.isGreeting(normalizedQuestion)) {
      return {
        text: input.language.startsWith('sk')
          ? `Dobrý deň, som ${input.assistantName}. Môžem pomôcť s otázkami o obsahu tohto webu alebo vás nasmerovať na stručný brief.`
          : `Hello, I am ${input.assistantName}. I can help with questions about this website or guide you through a brief.`,
        sources: [],
        provider: 'mock',
      };
    }

    if (this.isCapabilityQuestion(normalizedQuestion)) {
      return {
        text: input.language.startsWith('sk')
          ? 'Viem odpovedať na otázky podľa zosynchronizovaného obsahu webu. Ak potrebujete dopyt alebo zadanie, môžete vyplniť aj stručný brief v karte Predajný brief.'
          : 'I can answer questions from the synced website content. If you want to send an inquiry or project request, you can also complete the brief flow.',
        sources: [],
        provider: 'mock',
      };
    }

    if (!input.retrievedChunks.length) {
      return {
        text: input.language.startsWith('sk')
          ? 'V zosynchronizovanom obsahu webu som nenašiel spoľahlivú odpoveď. Skúste otázku spresniť, spýtať sa na konkrétny článok alebo produkt, prípadne kontaktujte tím priamo.'
          : 'I could not find a reliable answer in the synced website content. Please ask about a specific page, article, or product, or contact the team directly.',
        sources: [],
        provider: 'mock',
      };
    }

    if (this.isRecommendationQuestion(normalizedQuestion)) {
      const titles = Array.from(
        new Set(
          input.retrievedChunks
            .map((chunk) => chunk.metadata?.title?.trim())
            .filter((title): title is string => Boolean(title)),
        ),
      ).slice(0, 4);

      if (titles.length > 0) {
        return {
          text: input.language.startsWith('sk')
            ? `Na webe máte napríklad tieto relevantné články alebo nástroje: ${titles.join(', ')}.`
            : `These are some relevant articles or tools on the website: ${titles.join(', ')}.`,
          sources,
          provider: 'mock',
        };
      }
    }

    if (this.isContactQuestion(normalizedQuestion) && sources.length > 0) {
      return {
        text: input.language.startsWith('sk')
          ? `Kontakt alebo súvisiacu stránku som našiel v obsahu webu. Odporúčam otvoriť: ${sources[0].title}.`
          : `I found a relevant contact-related page on the website. Open: ${sources[0].title}.`,
        sources,
        provider: 'mock',
      };
    }

    const topTitle = input.retrievedChunks[0]?.metadata?.title?.trim();
    const summary = input.retrievedChunks
      .slice(0, 2)
      .map((chunk) => chunk.content.replace(/\s+/g, ' ').trim())
      .join(' ');

    return {
      text: input.language.startsWith('sk')
        ? `${topTitle ? `Na webe máte k tomu článok alebo stránku „${topTitle}“. ` : ''}${summary.slice(0, 540)}${summary.length > 540 ? '…' : ''}`
        : `${topTitle ? `The website has a relevant page or article titled "${topTitle}". ` : ''}${summary.slice(0, 540)}${summary.length > 540 ? '…' : ''}`,
      sources,
      provider: 'mock',
    };
  }

  private isGreeting(question: string): boolean {
    return [
      'ahoj',
      'cau',
      'čau',
      'dobry den',
      'dobrý deň',
      'dobry vecer',
      'dobrý večer',
      'hello',
      'hi',
      'hey',
    ].includes(question);
  }

  private isCapabilityQuestion(question: string): boolean {
    return [
      'co vies',
      'čo vieš',
      'ako vies pomoct',
      'ako vieš pomôcť',
      'help',
      'pomoc',
      'pomoc?',
      'what can you do',
      'what do you do',
    ].includes(question);
  }

  private isRecommendationQuestion(question: string): boolean {
    return [
      'ake ai tools tu odporucate',
      'aké ai tools tu odporúčate',
      'co tu mate',
      'čo tu máte',
      'what tools do you recommend',
      'what do you have here',
    ].includes(question);
  }

  private isContactQuestion(question: string): boolean {
    return [
      'mate kontakt',
      'máte kontakt',
      'kontakt',
      'contact',
      'kontakt?',
      'mate kontakt?',
      'máte kontakt?',
      'ako vas kontaktovat',
      'ako vás kontaktovať',
    ].includes(question);
  }
}
