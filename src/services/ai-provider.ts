import type { RetrievedChunk } from './retrieval-service.js';
import type { SiteAiConfig } from '../types/site-context.js';

export type GenerateReplyInput = {
  assistantName: string;
  language: string;
  tone: string;
  aiConfig: Required<SiteAiConfig>;
  strictSiteGrounding: boolean;
  question: string;
  retrievedChunks: RetrievedChunk[];
  conversationHistory: Array<{
    role: 'system' | 'assistant' | 'user';
    content: string;
  }>;
};

export type GenerateReplyResult = {
  text: string;
  sources: Array<{ title: string; url: string }>;
  provider: string;
};

export interface AIProvider {
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}
