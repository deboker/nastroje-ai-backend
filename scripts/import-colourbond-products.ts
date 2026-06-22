/**
 * Developer-only importer for a phpMyAdmin Colourbond product export.
 *
 * Run with: npm run import:colourbond-products
 * Requires backend/.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DocumentRepository, type ChunkInsert, type SyncDocumentInput } from '../src/repositories/document-repository.js';
import { supabase } from '../src/lib/supabase.js';

const COLOURBOND_PUBLIC_SITE_KEY = 'colourbond-cz';
const PRODUCT_EXPORT_PATH = fileURLToPath(new URL('../data/colourbond-products.json', import.meta.url));
const PRODUCT_URL_PREFIX = 'https://colourbond.abcdizajn.sk/cs/';

type ProductRow = {
  id_product: string;
  product_code?: string;
  product_name?: string;
  link_rewrite?: string;
  category_name?: string;
  price_without_tax?: string;
  quantity?: string;
  active?: string;
  shop_active?: string;
  description_short?: string;
  description?: string;
  product_url_fallback?: string;
  cover_image_id?: string;
  [key: string]: unknown;
};

type PhpMyAdminTable = {
  type?: string;
  data?: unknown;
};

async function main() {
  const siteId = await findColourbondSiteId();
  const productRows = await loadActiveProducts();
  const documents = productRows.map(toDocument);
  const documentRepository = new DocumentRepository();
  const savedDocuments = await documentRepository.upsertDocuments(siteId, documents);
  const savedDocumentByObjectId = new Map(savedDocuments.map((document) => [document.wp_object_id, document]));
  const chunks: ChunkInsert[] = [];

  for (const document of documents) {
    const savedDocument = savedDocumentByObjectId.get(document.wp_object_id);
    if (!savedDocument) {
      throw new Error(`Document upsert did not return product ${document.wp_object_id}.`);
    }

    chunkText(document.content_clean).forEach((content, chunkIndex) => {
      chunks.push({
        site_id: siteId,
        document_id: savedDocument.id,
        chunk_index: chunkIndex,
        content,
        metadata: {
          title: document.title,
          url: document.url,
          slug: document.slug,
          type: document.type,
          wp_object_id: document.wp_object_id,
          product_code: document.metadata?.product_code ?? null,
          category_name: document.metadata?.category_name ?? null,
        },
      });
    });
  }

  // This deletes chunks only for the newly upserted Colourbond product documents.
  await documentRepository.deleteChunks(siteId, savedDocuments.map((document) => document.id));
  await documentRepository.insertChunks(chunks);

  console.log(`Imported ${documents.length} active Colourbond products.`);
  console.log(`Recreated ${chunks.length} document chunks.`);
}

async function findColourbondSiteId(): Promise<string> {
  const { data, error } = await supabase
    .from('sites')
    .select('id')
    .eq('public_site_key', COLOURBOND_PUBLIC_SITE_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(`No site exists with public_site_key ${COLOURBOND_PUBLIC_SITE_KEY}. Run onboarding first.`);
  }

  return data.id;
}

async function loadActiveProducts(): Promise<ProductRow[]> {
  const fileContents = await readFile(PRODUCT_EXPORT_PATH, 'utf8');
  const exportData: unknown = JSON.parse(fileContents);

  if (!Array.isArray(exportData)) {
    throw new Error('Expected the phpMyAdmin export root to be an array.');
  }

  const productTable = exportData.find(
    (entry): entry is PhpMyAdminTable =>
      isRecord(entry) && entry.type === 'table' && Array.isArray(entry.data) && entry.data.some(hasProductId),
  );

  if (!productTable || !Array.isArray(productTable.data)) {
    throw new Error('No phpMyAdmin table containing product rows was found.');
  }

  const activeProducts: ProductRow[] = [];
  for (const row of productTable.data) {
    if (!hasProductId(row)) continue;
    if (String(row.active) !== '1' || String(row.shop_active) !== '1') continue;

    const productId = Number(row.id_product);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw new Error(`Invalid id_product in the export: ${String(row.id_product)}.`);
    }

    activeProducts.push(row);
  }

  return activeProducts;
}

function toDocument(product: ProductRow): SyncDocumentInput {
  const productId = Number(product.id_product);
  const slug = text(product.link_rewrite) || `product-${productId}`;
  const fallbackUrl = text(product.product_url_fallback);
  const url = text(product.link_rewrite) ? `${PRODUCT_URL_PREFIX}${text(product.link_rewrite)}` : fallbackUrl;
  const shortDescription = stripHtml(text(product.description_short));
  const longDescription = stripHtml(text(product.description));
  const title = text(product.product_name) || `Produkt ${productId}`;
  const contentClean = [
    `Produkt: ${title}`,
    `Kód produktu: ${valueOrUnknown(product.product_code)}`,
    `Kategorie: ${valueOrUnknown(product.category_name)}`,
    `Cena bez DPH: ${valueOrUnknown(product.price_without_tax)}`,
    `Skladové množství: ${valueOrUnknown(product.quantity)}`,
    `Krátký popis: ${shortDescription || 'Neuvedeno'}`,
    `Dlouhý popis: ${longDescription || 'Neuvedeno'}`,
    `URL produktu: ${url || 'Neuvedeno'}`,
    `ID titulního obrázku: ${valueOrUnknown(product.cover_image_id)}`,
  ].join('\n');

  return {
    wp_object_id: productId,
    type: 'product',
    title,
    slug,
    url,
    excerpt: shortDescription,
    content_raw: [text(product.description_short), text(product.description)].filter(Boolean).join('\n\n'),
    content_clean: contentClean,
    status: 'publish',
    metadata: {
      ...product,
      product_code: text(product.product_code) || null,
      category_name: text(product.category_name) || null,
      source: 'colourbond-products.json',
    },
  };
}

// Matches the existing SyncService chunking behavior: sentence-aware chunks of roughly 900 characters.
function chunkText(textToChunk: string): string[] {
  const normalized = textToChunk.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buffer = '';

  for (const paragraph of paragraphs) {
    if ((buffer + ' ' + paragraph).trim().length > 900) {
      if (buffer) chunks.push(buffer.trim());
      buffer = paragraph;
    } else {
      buffer = `${buffer} ${paragraph}`.trim();
    }
  }

  if (buffer) chunks.push(buffer.trim());
  return chunks.length ? chunks : [normalized.slice(0, 900)];
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function hasProductId(value: unknown): value is ProductRow {
  return isRecord(value) && typeof value.id_product === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function valueOrUnknown(value: unknown): string {
  return text(value) || 'Neuvedeno';
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
