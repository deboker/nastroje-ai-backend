import { DocumentRepository } from '../repositories/document-repository.js';

export type RetrievedChunk = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: {
    title?: string;
    url?: string;
    slug?: string;
    type?: string;
  };
};

export class RetrievalService {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async searchRelevantContent(siteId: string, query: string, limit = 5): Promise<RetrievedChunk[]> {
    if (!query.trim()) {
      return [];
    }

    const chunks = await this.documentRepository.searchChunks(siteId, query, limit);
    return chunks as RetrievedChunk[];
  }

  async searchColourbondProductFallback(siteId: string, query: string, limit = 5): Promise<RetrievedChunk[]> {
    const chunks = await this.documentRepository.searchColourbondProductChunks(siteId, query, limit);
    return chunks as RetrievedChunk[];
  }
}
