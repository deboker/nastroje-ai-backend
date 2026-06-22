import { randomUUID } from 'node:crypto';
import { HttpError } from '../lib/http-error.js';
import { ConversationRepository } from '../repositories/conversation-repository.js';
import { OpsRepository } from '../repositories/ops-repository.js';
import type { SiteContext } from '../types/site-context.js';
import type { AIProvider } from './ai-provider.js';
import { RetrievalService } from './retrieval-service.js';
import { resolveSiteAiConfig } from './site-ai-config.js';

type ChatInput = {
  conversation_id?: string;
  session_id?: string;
  message: string;
  language?: string;
  tone?: string;
  assistant_name?: string;
  source_page_url?: string;
  user_identifier?: string;
};

const MAX_CONVERSATION_MESSAGES = 60;
const COLOURBOND_PUBLIC_SITE_KEY = 'colourbond-cz';

export class ChatService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly retrievalService: RetrievalService,
    private readonly opsRepository: OpsRepository,
    private readonly aiProvider: AIProvider,
  ) {}

  async createConversation(siteContext: SiteContext, input: Omit<ChatInput, 'message'>) {
    return this.conversationRepository.createConversation({
      site_id: siteContext.site.id,
      session_id: input.session_id || randomUUID(),
      user_identifier: input.user_identifier || null,
      source_page_url: input.source_page_url || null,
      mode: 'chat',
    });
  }

  async sendMessage(siteContext: SiteContext, input: ChatInput) {
    const conversation = await this.resolveConversation(siteContext, input);
    const messageCount = await this.conversationRepository.countMessages(conversation.id);

    if (messageCount >= MAX_CONVERSATION_MESSAGES - 1) {
      throw new HttpError(
        409,
        'Conversation limit reached. Please start a new conversation to continue.',
      );
    }

    await this.conversationRepository.createMessage(conversation.id, 'user', input.message, {
      source_page_url: input.source_page_url || null,
    });

    const recentMessages = await this.conversationRepository.listRecentMessages(conversation.id, 8);
    const isColourbond = siteContext.site.public_site_key === COLOURBOND_PUBLIC_SITE_KEY;
    let retrievedChunks = await this.retrievalService.searchRelevantContent(siteContext.site.id, input.message, 5);
    if (isColourbond && isColourbondProductRecommendationQuestion(input.message)) {
      const productChunks = await this.retrievalService.searchColourbondProductFallback(siteContext.site.id, input.message, 5);
      if (productChunks.length > 0) {
        retrievedChunks = productChunks;
      }
    } else if (isColourbond && retrievedChunks.length === 0) {
      retrievedChunks = await this.retrievalService.searchColourbondProductFallback(siteContext.site.id, input.message, 5);
    }
    if (isColourbond) {
      console.info({
        type: 'colourbond_retrieval',
        sitePublicKey: siteContext.site.public_site_key,
        siteId: siteContext.site.id,
        retrievedChunkCount: retrievedChunks.length,
        retrievedDocumentTitles: Array.from(
          new Set(retrievedChunks.map((chunk) => chunk.metadata?.title).filter((title): title is string => Boolean(title))),
        ),
      });
    }
    const assistantName = input.assistant_name || siteContext.settings?.assistant_name || 'Nastroje AI Assistant';
    const language = input.language || siteContext.site.language || 'sk';
    const tone = input.tone || siteContext.settings?.tone || 'professional';
    const aiConfig = resolveSiteAiConfig(siteContext.settings?.sync_config?.ai_config);
    const reply = await this.aiProvider.generateReply({
      assistantName,
      language,
      tone,
      aiConfig,
      strictProductGrounding: isColourbond,
      question: input.message,
      retrievedChunks,
      conversationHistory: recentMessages.map((message) => ({
        role: (message.role === 'assistant' || message.role === 'system' || message.role === 'user' ? message.role : 'user'),
        content: message.content,
      })),
    });

    await this.conversationRepository.createMessage(conversation.id, 'assistant', reply.text, {
      sources: reply.sources,
      provider: reply.provider,
    });
    await this.conversationRepository.touchConversation(conversation.id);
    await this.opsRepository.logUsage(siteContext.site.id, 'chat_message', {
      conversation_id: conversation.id,
      source_count: reply.sources.length,
      provider: reply.provider,
    });

    return {
      conversation_id: conversation.id,
      reply: reply.text,
      sources: reply.sources,
      provider: reply.provider,
    };
  }

  async getConversation(siteContext: SiteContext, conversationId: string) {
    const conversation = await this.conversationRepository.findConversation(siteContext.site.id, conversationId);
    if (!conversation) {
      throw new Error('Conversation not found for this site.');
    }

    const messages = await this.conversationRepository.listMessages(conversationId);
    return {
      conversation,
      messages,
    };
  }

  async listConversations(siteContext: SiteContext, page: number, perPage: number) {
    const conversations = await this.conversationRepository.listConversations(siteContext.site.id, page, perPage);
    return {
      conversations,
    };
  }

  async deleteConversation(siteContext: SiteContext, conversationId: string) {
    const deleted = await this.conversationRepository.deleteConversation(siteContext.site.id, conversationId);
    if (!deleted) {
      throw new Error('Conversation not found for this site.');
    }

    await this.opsRepository.logUsage(siteContext.site.id, 'conversation_deleted', {
      conversation_id: conversationId,
    });

    return {
      deleted: true,
      conversation_id: conversationId,
    };
  }

  private async resolveConversation(siteContext: SiteContext, input: ChatInput) {
    if (input.conversation_id) {
      const existing = await this.conversationRepository.findConversation(siteContext.site.id, input.conversation_id);
      if (existing) {
        return existing;
      }
    }

    if (input.session_id) {
      const existingSessionConversation = await this.conversationRepository.findLatestConversationBySession(
        siteContext.site.id,
        input.session_id,
        'chat',
      );
      if (existingSessionConversation) {
        return existingSessionConversation;
      }
    }

    return this.conversationRepository.createConversation({
      site_id: siteContext.site.id,
      session_id: input.session_id || randomUUID(),
      user_identifier: input.user_identifier || null,
      source_page_url: input.source_page_url || null,
      mode: 'chat',
    });
  }
}

function isColourbondProductRecommendationQuestion(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const productTerms = /\b(lepidl\w*|tmel\w*|impregna\w*|cistic\w*|cisteni|pigment\w*|akepox|platinum|produkt\w*)\b/u;
  const recommendationTerms = /\b(potrebuji|potrebuju|doporuc\w*|jak\w*|vhodn\w*|vybrat|pouzit|na kamen)\b/u;
  return productTerms.test(normalized) && recommendationTerms.test(normalized);
}
