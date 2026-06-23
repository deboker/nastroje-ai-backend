import type { RetrievedChunk } from './retrieval-service.js';

export type ProductCard = {
  product_id: string | null;
  cover_image_id: string | null;
  title: string;
  url: string;
  image_url: string | null;
  price_without_tax: string | null;
  quantity: string | null;
  category: string | null;
  reason: string;
};

export type AssistantLink = {
  label: string;
  url: string;
};

export type GenerateReplyInput = {
  assistantName: string;
  language: string;
  tone: string;
  assistantProfile: string;
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
  products?: ProductCard[];
  links?: AssistantLink[];
  provider: string;
};

export interface AIProvider {
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}
