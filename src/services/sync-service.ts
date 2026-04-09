import { DocumentRepository, type SyncDocumentInput } from '../repositories/document-repository.js';
import { OpsRepository } from '../repositories/ops-repository.js';
import type { SiteContext } from '../types/site-context.js';

type SyncBatchInput = {
  sync_type: string;
  documents: SyncDocumentInput[];
};

export class SyncService {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly opsRepository: OpsRepository,
  ) {}

  async ingestBatch(siteContext: SiteContext, payload: SyncBatchInput) {
    const syncLog = await this.opsRepository.createSyncLog(siteContext.site.id, payload.sync_type || 'manual');

    try {
      const documents = await this.documentRepository.upsertDocuments(siteContext.site.id, payload.documents || []);
      const documentMap = new Map<string, { id: string; title: string; url: string; slug: string; type: string }>();

      for (const document of documents) {
        documentMap.set(`${document.type}:${document.wp_object_id}`, document);
      }

      const chunks: Array<{
        site_id: string;
        document_id: string;
        chunk_index: number;
        content: string;
        metadata: {
          title: string;
          url: string;
          slug: string;
          type: string;
          wp_object_id: number;
        };
      }> = [];

      for (const document of payload.documents || []) {
        const saved = documentMap.get(`${document.type}:${document.wp_object_id}`);
        if (!saved) {
          continue;
        }

        const text = document.content_clean || document.excerpt || document.title;
        const chunkParts = this.chunkText(text);

        chunkParts.forEach((chunk, index) => {
          chunks.push({
            site_id: siteContext.site.id,
            document_id: saved.id,
            chunk_index: index,
            content: chunk,
            metadata: {
              title: document.title,
              url: document.url,
              slug: document.slug,
              type: document.type,
              wp_object_id: document.wp_object_id,
            },
          });
        });
      }

      await this.documentRepository.deleteChunks(
        siteContext.site.id,
        documents.map((document) => document.id),
      );
      await this.documentRepository.insertChunks(chunks);
      await this.opsRepository.finishSyncLog(syncLog.id, {
        status: 'success',
        items_processed: documents.length,
      });
      await this.opsRepository.logUsage(siteContext.site.id, 'sync_batch_received', {
        items_processed: documents.length,
        chunk_count: chunks.length,
      });

      return {
        status: 'success',
        items_processed: documents.length,
        chunks_created: chunks.length,
      };
    } catch (error) {
      await this.opsRepository.finishSyncLog(syncLog.id, {
        status: 'error',
        items_processed: 0,
        error_message: error instanceof Error ? error.message : 'Unknown sync error',
      });
      throw error;
    }
  }

  private chunkText(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return [];
    }

    const paragraphs = normalized.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let buffer = '';

    for (const paragraph of paragraphs) {
      if ((buffer + ' ' + paragraph).trim().length > 900) {
        if (buffer) {
          chunks.push(buffer.trim());
        }
        buffer = paragraph;
      } else {
        buffer = `${buffer} ${paragraph}`.trim();
      }
    }

    if (buffer) {
      chunks.push(buffer.trim());
    }

    return chunks.length ? chunks : [normalized.slice(0, 900)];
  }
}
