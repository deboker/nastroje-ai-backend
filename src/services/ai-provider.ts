import type { RetrievedChunk } from './retrieval-service.js';

export type GenerateReplyInput = {
  assistantName: string;
  language: string;
  tone: string;
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
