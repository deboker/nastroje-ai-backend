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
    image_url?: string | null;
    price_without_tax?: string | null;
    quantity?: string | null;
    category_name?: string | null;
  };
};

export class RetrievalService {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async searchRelevantContent(siteId: string, query: string, limit = 5, assistantProfile?: string): Promise<RetrievedChunk[]> {
    if (!query.trim()) {
      return [];
    }

    const chunks = await this.documentRepository.searchChunks(siteId, query, limit, assistantProfile);
    return chunks as RetrievedChunk[];
  }

}
