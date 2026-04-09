import { randomUUID } from 'node:crypto';
import { ConversationRepository } from '../repositories/conversation-repository.js';
import { OpsRepository } from '../repositories/ops-repository.js';
import type { SiteContext } from '../types/site-context.js';
import type { AIProvider } from './ai-provider.js';
import { RetrievalService } from './retrieval-service.js';

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

    await this.conversationRepository.createMessage(conversation.id, 'user', input.message, {
      source_page_url: input.source_page_url || null,
    });

    const retrievedChunks = await this.retrievalService.searchRelevantContent(siteContext.site.id, input.message, 5);
    const assistantName = input.assistant_name || siteContext.settings?.assistant_name || 'Nastroje AI Assistant';
    const language = input.language || siteContext.site.language || 'sk';
    const tone = input.tone || siteContext.settings?.tone || 'professional';
    const reply = await this.aiProvider.generateReply({
      assistantName,
      language,
      tone,
      question: input.message,
      retrievedChunks,
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

  private async resolveConversation(siteContext: SiteContext, input: ChatInput) {
    if (input.conversation_id) {
      const existing = await this.conversationRepository.findConversation(siteContext.site.id, input.conversation_id);
      if (existing) {
        return existing;
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
