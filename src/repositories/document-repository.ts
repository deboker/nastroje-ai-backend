import { supabase } from '../lib/supabase.js';

export type SyncDocumentInput = {
  wp_object_id: number;
  type: string;
  title: string;
  slug: string;
  url: string;
  excerpt: string;
  content_raw: string;
  content_clean: string;
  status?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
};

export type ChunkInsert = {
  site_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
};

type ProductDocument = {
  id: string;
  title: string;
  slug: string;
  url: string;
  excerpt: string;
  content_clean: string;
  metadata: unknown;
};

type WebsiteDocument = {
  id: string;
  title: string;
  slug: string;
  url: string;
  excerpt: string;
  content_clean: string;
  type: string;
  metadata: unknown;
  last_synced_at: string | null;
};

const STOP_WORDS = new Set([
  'a', 'aby', 'ano', 'bych', 'co', 'do', 'i', 'jak', 'jaka', 'jake', 'jaky', 'je', 'jsou', 'k', 'mi', 'na',
  'nebo', 'o', 'od', 'potrebuji', 'potrebuju', 'pro', 's', 'se', 'si', 'to', 'v', 've', 'z',
]);

const TERM_ALIASES: Record<string, string[]> = {
  lepidlo: ['lepidlo', 'lepeni', 'lepenie'],
  lepeni: ['lepidlo', 'lepeni', 'lepenie'],
  lepenie: ['lepidlo', 'lepeni', 'lepenie'],
  tmel: ['tmel', 'tmeleni', 'tmelenie'],
  tmeleni: ['tmel', 'tmeleni', 'tmelenie'],
  tmelenie: ['tmel', 'tmeleni', 'tmelenie'],
  kamen: ['kamen', 'kamene', 'kamen'],
  cistic: ['cistic', 'cisteni', 'cistenie', 'cistit', 'odmasteni'],
  cisteni: ['cistic', 'cisteni', 'cistenie', 'cistit', 'odmasteni'],
  cistenie: ['cistic', 'cisteni', 'cistenie', 'cistit', 'odmasteni'],
  kartuse: ['kartuse', 'aplikace', 'pistole', 'tryska'],
  pistole: ['pistole', 'aplikace', 'kartuse', 'tryska'],
  tryska: ['tryska', 'pistole', 'kartuse', 'aplikace'],
  prislusenstvi: ['prislusenstvi', 'tryska', 'pistole', 'kartuse', 'aplikace'],
};

const EXTERNAL_BRANDS = ['sikabond', 'masterseal'];

export class DocumentRepository {
  async upsertDocuments(siteId: string, documents: SyncDocumentInput[]) {
    const payload = documents.map((document) => ({
      site_id: siteId,
      wp_object_id: document.wp_object_id,
      type: document.type,
      title: document.title,
      slug: document.slug,
      url: document.url,
      excerpt: document.excerpt,
      content_raw: document.content_raw,
      content_clean: document.content_clean,
      status: document.status ?? 'publish',
      metadata: { ...(document.metadata ?? {}), wp_updated_at: document.updated_at ?? null },
      last_synced_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('documents')
      .upsert(payload, { onConflict: 'site_id,wp_object_id,type' })
      .select('id,site_id,wp_object_id,type,title,slug,url');
    if (error) throw error;
    return data ?? [];
  }

  async deleteChunks(siteId: string, documentIds: string[]) {
    if (!documentIds.length) return;
    const { error } = await supabase.from('document_chunks').delete().eq('site_id', siteId).in('document_id', documentIds);
    if (error) throw error;
  }

  async insertChunks(chunks: ChunkInsert[]) {
    if (!chunks.length) return;
    const { error } = await supabase.from('document_chunks').insert(chunks);
    if (error) throw error;
  }

  /**
   * Retrieval is profile-specific: product ranking protects Colourbond from unrelated
   * recommendations, while websites use their synced pages and articles.
   */
  async searchChunks(siteId: string, query: string, limit = 5, assistantProfile?: string) {
    if (assistantProfile === 'colourbond_products') {
      return this.searchProductKeywords(siteId, query, limit);
    }
    return this.searchWebsiteContent(siteId, query, limit);
  }

  private async searchWebsiteContent(siteId: string, query: string, limit: number) {
    const normalizedQuery = normalize(query);
    const asksLatestBlog = /\b(najnovsi|najnovsie|posledny|posledna|posledne|latest)\b/u.test(normalizedQuery) &&
      /\b(blog|clanok|clanky|article|post)\b/u.test(normalizedQuery);

    if (asksLatestBlog) {
      const { data, error } = await supabase
        .from('documents')
        .select('id,title,slug,url,excerpt,content_clean,type,metadata,last_synced_at')
        .eq('site_id', siteId)
        .eq('status', 'publish')
        .in('type', ['post', 'article'])
        .order('last_synced_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return this.toWebsiteResults((data ?? []) as WebsiteDocument[]);
    }

    const { data: fullTextChunks, error: fullTextError } = await supabase
      .from('document_chunks')
      .select('id,document_id,chunk_index,content,metadata')
      .eq('site_id', siteId)
      .textSearch('search_tsv', query, { type: 'websearch', config: 'simple' })
      .limit(limit);
    if (fullTextError) throw fullTextError;
    if (fullTextChunks?.length) return fullTextChunks;

    const terms = normalizedQuery
      .split(' ')
      .filter((term) => term.length >= 3 && !['ako', 'aky', 'co', 'mate', 'nase', 'nasi', 'pre', 'som', 'stranka', 'tu', 'vas'].includes(term));
    if (!terms.length) return [];

    const filters = terms.flatMap((term) => {
      const safe = term.replace(/[%_,]/g, '');
      return [`title.ilike.%${safe}%`, `slug.ilike.%${safe}%`, `excerpt.ilike.%${safe}%`, `content_clean.ilike.%${safe}%`];
    });
    const { data, error } = await supabase
      .from('documents')
      .select('id,title,slug,url,excerpt,content_clean,type,metadata,last_synced_at')
      .eq('site_id', siteId)
      .eq('status', 'publish')
      .or(filters.join(','))
      .limit(limit);
    if (error) throw error;
    return this.toWebsiteResults((data ?? []) as WebsiteDocument[]);
  }

  private toWebsiteResults(documents: WebsiteDocument[]) {
    return documents.map((document, index) => ({
      id: `document-${document.id}`,
      document_id: document.id,
      chunk_index: index,
      content: (document.excerpt || document.content_clean || document.title || '').slice(0, 900),
      metadata: {
        title: document.title,
        url: document.url,
        slug: document.slug,
        type: document.type,
        ...asRecord(document.metadata),
        last_synced_at: document.last_synced_at,
      },
    }));
  }

  private async searchProductKeywords(siteId: string, query: string, limit: number) {
    const queryInfo = this.parseQuery(query);
    if (
      !queryInfo.terms.length ||
      queryInfo.externalBrand ||
      (queryInfo.kitchen && !queryInfo.worktop && !queryInfo.adhesive)
    ) return [];

    const { data, error } = await supabase
      .from('documents')
      .select('id,title,slug,url,excerpt,content_clean,metadata')
      .eq('site_id', siteId)
      .eq('type', 'product')
      .eq('status', 'publish');
    if (error) throw error;

    const ranked = ((data ?? []) as ProductDocument[])
      .map((document) => ({ document, score: this.scoreProduct(document, queryInfo) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title))
      .slice(0, limit);
    if (!ranked.length) return [];

    const documentIds = ranked.map((entry) => entry.document.id);
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id,document_id,chunk_index,content,metadata')
      .eq('site_id', siteId)
      .in('document_id', documentIds);
    if (chunksError) throw chunksError;

    const byDocument = new Map<string, Array<Record<string, unknown>>>();
    for (const chunk of chunks ?? []) {
      const values = byDocument.get(chunk.document_id) ?? [];
      values.push(chunk as Record<string, unknown>);
      byDocument.set(chunk.document_id, values);
    }

    const results: Array<Record<string, unknown>> = [];
    for (const { document } of ranked) {
      const productMetadata = asRecord(document.metadata);
      const productChunks = (byDocument.get(document.id) ?? []).sort(
        (left, right) => Number(left.chunk_index) - Number(right.chunk_index),
      );
      // One representative chunk per product keeps category results diverse.
      // Without this, long product descriptions can consume the entire result
      // limit and hide other products in the same category.
      const chunk = productChunks[0];
      if (!chunk) continue;

      results.push({
        ...chunk,
        metadata: {
          ...asRecord(chunk.metadata),
          title: document.title,
          url: document.url,
          slug: document.slug,
          type: 'product',
          product_id: stringOrNull(productMetadata.id_product),
          cover_image_id: stringOrNull(productMetadata.cover_image_id),
          product_code: stringOrNull(productMetadata.product_code),
          price_without_tax: stringOrNull(productMetadata.price_without_tax),
          quantity: stringOrNull(productMetadata.quantity),
          category_name: stringOrNull(productMetadata.category_name),
          brand: stringOrNull(productMetadata.brand),
          manufacturer: stringOrNull(productMetadata.manufacturer),
          manufacturer_name: stringOrNull(productMetadata.manufacturer_name),
          image_url: null,
        },
      });
      if (results.length >= limit) return results;
    }
    return results;
  }

  private parseQuery(query: string) {
    const normalized = normalize(query);
    const rawTerms = normalized.split(' ').filter((term) => term.length >= 2 && !STOP_WORDS.has(term));
    const terms = new Set(rawTerms);
    for (const term of rawTerms) {
      for (const alias of TERM_ALIASES[term] ?? []) terms.add(alias);
    }
    const phrase = (value: string) => normalized.includes(value);
    return {
      terms: [...terms],
      adhesive: /\b(lepidl\w*|lepeni|lepenie|tmel\w*|tmeleni|tmelenie|jolly)\b/u.test(normalized),
      cleaning: /\b(cistic\w*|cisteni|cistenie|cistit|odmasteni|acryclean|acid)\b/u.test(normalized),
      accessory: /\b(trysk\w*|pistol\w*|kartus\w*|aplikac\w*|prislusenstv\w*)\b/u.test(normalized),
      kitchen: /\b(kuchyn\w*)\b/u.test(normalized),
      worktop: phrase('pracovni deska') || phrase('pracovna doska'),
      externalBrand: EXTERNAL_BRANDS.some((brand) => normalized.includes(brand)),
      directProduct: normalized,
    };
  }

  private scoreProduct(document: ProductDocument, query: ReturnType<DocumentRepository['parseQuery']>): number {
    const metadata = asRecord(document.metadata);
    const title = normalize(document.title);
    const category = normalize(stringOrNull(metadata.category_name) || '');
    const content = normalize(`${document.title} ${document.slug} ${document.excerpt} ${document.content_clean} ${category}`);
    let score = 0;

    for (const term of query.terms) {
      if (!content.includes(term)) continue;
      score += title.includes(term) ? 28 : 6;
    }

    if (query.adhesive) {
      if (category.includes('lepidla a tmely')) score += 60;
      score += phraseScore(content, 'lepidlo', 18);
      score += phraseScore(content, 'lepeni', 15);
      score += phraseScore(content, 'prirodni kamen', 16);
      score += phraseScore(content, 'umely kamen', 16);
      score += phraseScore(content, 'jolly hran', 20);
      score += phraseScore(content, 'viditelne spoje', 20);
    }

    if (query.cleaning) {
      if (category.includes('cisteni')) score += 60;
      score += phraseScore(content, 'cistic', 18);
      score += phraseScore(content, 'cisteni', 15);
      score += phraseScore(content, 'odmasteni', 15);
    }

    if (query.worktop) {
      score += phraseScore(content, 'pracovni des', 20);
      score += phraseScore(content, 'desek', 10);
    }

    if (query.accessory) {
      if (/\b(pistol\w*|trysk\w*|koncovka|kartus\w*|aplikac\w*)\b/u.test(title)) {
        score += 160;
      } else {
        score -= 100;
      }
    }

    if (title === query.directProduct || query.directProduct.includes(title)) score += 220;
    if (!query.accessory && /\b(pistol\w*|trysk\w*|koncovka|kartus\w*|aplikac\w*)\b/u.test(title)) score -= 120;

    if (score > 0 && isColourBondProduct(document, metadata)) score += 35;

    return score;
  }
}

function isColourBondProduct(document: ProductDocument, metadata: Record<string, unknown>): boolean {
  const structuredBrand = stringOrNull(metadata.manufacturer_name)
    || stringOrNull(metadata.manufacturer)
    || stringOrNull(metadata.brand);
  return /\b(colour|color) bond\b/u.test(normalize(structuredBrand || document.title));
}

function phraseScore(value: string, phrase: string, weight: number): number {
  let count = 0;
  let offset = 0;
  while (count < 3) {
    const index = value.indexOf(phrase, offset);
    if (index === -1) break;
    count += 1;
    offset = index + phrase.length;
  }
  return count * weight;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
