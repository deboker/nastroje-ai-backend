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
      metadata: {
        ...(document.metadata ?? {}),
        wp_updated_at: document.updated_at ?? null,
      },
      last_synced_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('documents')
      .upsert(payload, {
        onConflict: 'site_id,wp_object_id,type',
      })
      .select('id,site_id,wp_object_id,type,title,slug,url');

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async deleteChunks(siteId: string, documentIds: string[]) {
    if (!documentIds.length) {
      return;
    }

    const { error } = await supabase.from('document_chunks').delete().eq('site_id', siteId).in('document_id', documentIds);

    if (error) {
      throw error;
    }
  }

  async insertChunks(chunks: ChunkInsert[]) {
    if (!chunks.length) {
      return;
    }

    const { error } = await supabase.from('document_chunks').insert(chunks);

    if (error) {
      throw error;
    }
  }

  async searchChunks(siteId: string, query: string, limit = 5) {
    const searchIntent = this.detectSearchIntent(query);
    const searchTerms = this.expandSearchTerms(this.extractSearchTerms(query), searchIntent);

    const { data, error } = await supabase
      .from('document_chunks')
      .select('id,document_id,chunk_index,content,metadata')
      .eq('site_id', siteId)
      .textSearch('search_tsv', query, { type: 'websearch', config: 'simple' })
      .limit(limit);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      const rankedChunks = this.rankChunkResults(data, searchTerms, searchIntent, limit);
      if (rankedChunks.length > 0) {
        return rankedChunks;
      }
    }

    if (!searchTerms.length) {
      return [];
    }

    const filters: string[] = [];

    for (const term of searchTerms) {
      const escapedTerm = term.replace(/[%_,]/g, '');
      filters.push(`title.ilike.%${escapedTerm}%`);
      filters.push(`slug.ilike.%${escapedTerm}%`);
      filters.push(`excerpt.ilike.%${escapedTerm}%`);
      filters.push(`content_clean.ilike.%${escapedTerm}%`);
    }

    const { data: fallbackDocuments, error: fallbackError } = await supabase
      .from('documents')
      .select('id,title,slug,url,excerpt,content_clean,type')
      .eq('site_id', siteId)
      .or(filters.join(','))
      .limit(Math.max(limit * 5, 10));

    if (fallbackError) {
      throw fallbackError;
    }

    const mappedFallbackResults = (fallbackDocuments ?? []).map((document, index) => ({
      id: `document-${document.id}`,
      document_id: document.id,
      chunk_index: index,
      content: (document.excerpt || document.content_clean || document.title || '').slice(0, 900),
      metadata: {
        title: document.title,
        url: document.url,
        slug: document.slug,
        type: document.type,
      },
    }));

    return this.rankChunkResults(mappedFallbackResults, searchTerms, searchIntent, limit);
  }

  private extractSearchTerms(query: string): string[] {
    const normalized = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ');

    const stopWords = new Set([
      'a',
      'aj',
      'ako',
      'ak',
      'ake',
      'akej',
      'aky',
      'co',
      'čo',
      'do',
      'ho',
      'i',
      'ja',
      'je',
      'k',
      'ma',
      'mate',
      'mi',
      'na',
      'napis',
      'napíš',
      'o',
      'od',
      'pre',
      'sa',
      'si',
      'som',
      'su',
      'sú',
      'to',
      'tu',
      'v',
      'vo',
      'what',
      'about',
      'tell',
      'me',
      'the',
      'this',
      'you',
      'vi',
      'volake',
      'volaky',
      'vase',
      'vaše',
      'vas',
      'váš',
      'vlastne',
      'vlastné',
      'nejaky',
      'nejaké',
      'nejaky',
    ]);

    return Array.from(
      new Set(
        normalized
          .split(/\s+/)
          .map((term) => term.trim())
          .filter((term) => term.length >= 2 && !stopWords.has(term)),
      ),
    ).slice(0, 6);
  }

  private expandSearchTerms(terms: string[], intent: SearchIntent): string[] {
    const synonymMap: Record<string, string[]> = {
      kontakt: ['contact', 'kontakt', 'formular', 'form', 'email', 'mail'],
      contact: ['contact', 'kontakt', 'formular', 'form', 'email', 'mail'],
      formular: ['formular', 'form', 'contact'],
      form: ['form', 'formular', 'contact'],
      clanok: ['clanok', 'článok', 'article', 'post'],
      article: ['article', 'post', 'clanok'],
      odporucate: ['odporucate', 'recommended', 'best', 'top'],
      odporucit: ['odporucit', 'recommended', 'best', 'top'],
      best: ['best', 'top', 'recommended'],
      tools: ['tools', 'tool'],
      tool: ['tool', 'tools'],
      ai: ['ai'],
      nastroj: ['nastroj', 'nastroje', 'sluzby', 'app', 'aplikacia'],
      nastroje: ['nastroje', 'nastroj', 'sluzby', 'app', 'aplikacia'],
      app: ['app', 'aplikacia', 'aplikacie', 'sluzby'],
      aplikacia: ['aplikacia', 'aplikacie', 'app', 'sluzby'],
      aplikacie: ['aplikacie', 'aplikacia', 'app', 'sluzby'],
      sluzba: ['sluzba', 'sluzby', 'riesenie', 'app'],
      sluzby: ['sluzby', 'sluzba', 'riesenie', 'app'],
      preklad: ['preklad', 'preklad textu', 'textu', 'prekladatel'],
      textu: ['textu', 'preklad', 'obsah'],
      prepis: ['prepis', 'prepisovanie', 'transkript', 'audio', 'video'],
      prepisovanie: ['prepisovanie', 'prepis', 'transkript', 'audio', 'video'],
      obsah: ['obsah', 'generator', 'generator obsahu', 'copy', 'texty'],
      generator: ['generator', 'generator obsahu', 'obsah', 'texty'],
      analytika: ['analytika', 'analyza', 'data', 'reporting'],
      analyza: ['analyza', 'analytika', 'data', 'reporting'],
      data: ['data', 'analytika', 'analyza', 'reporting'],
      web: ['web', 'web asistent', 'asistent'],
      asistent: ['asistent', 'web asistent', 'chat', 'chatbot'],
    };

    const expanded = new Set<string>();

    for (const term of terms) {
      expanded.add(term);

      for (const synonym of synonymMap[term] ?? []) {
        expanded.add(synonym);
      }
    }

    if (intent.offerings) {
      ['sluzby', 'app', 'aplikacia', 'aplikacie', 'preklad', 'prepis', 'obsah', 'analytika', 'asistent'].forEach(
        (term) => expanded.add(term),
      );
    }

    if (intent.translation) {
      ['preklad', 'preklad textu', 'textu'].forEach((term) => expanded.add(term));
    }

    if (intent.transcription) {
      ['prepis', 'prepisovanie', 'audio', 'video'].forEach((term) => expanded.add(term));
    }

    if (intent.contentGeneration) {
      ['obsah', 'generator', 'generator obsahu', 'texty'].forEach((term) => expanded.add(term));
    }

    if (intent.analytics) {
      ['analytika', 'analyza', 'data', 'reporting'].forEach((term) => expanded.add(term));
    }

    if (intent.webAssistant) {
      ['web', 'asistent', 'web asistent', 'chatbot'].forEach((term) => expanded.add(term));
    }

    return Array.from(expanded).slice(0, 12);
  }

  private rankChunkResults<T extends { content: string; metadata?: { title?: string; slug?: string; url?: string; type?: string } }>(
    results: T[],
    terms: string[],
    intent: SearchIntent,
    limit: number,
  ): T[] {
    return results
      .map((result) => ({
        result,
        score: this.scoreChunkResult(result, terms, intent),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((entry) => entry.result);
  }

  private scoreChunkResult(
    result: { content: string; metadata?: { title?: string; slug?: string; url?: string; type?: string } },
    terms: string[],
    intent: SearchIntent,
  ): number {
    const title = this.normalizeSearchText(result.metadata?.title || '');
    const slug = this.normalizeSearchText(result.metadata?.slug || '');
    const type = this.normalizeSearchText(result.metadata?.type || '');
    const content = this.normalizeSearchText(result.content || '');
    const url = this.normalizeSearchText(result.metadata?.url || '');
    const genericTerms = new Set(['ai', 'tool', 'tools', 'best', 'top', 'recommended']);

    let score = 0;

    for (const term of terms) {
      const normalizedTerm = this.normalizeSearchText(term);
      if (!normalizedTerm) {
        continue;
      }

      const baseWeight = genericTerms.has(normalizedTerm) ? 1 : 4;

      if (title === normalizedTerm) {
        score += 30 * baseWeight;
      } else if (title.includes(normalizedTerm)) {
        score += 12 * baseWeight;
      }

      if (slug === normalizedTerm) {
        score += 24 * baseWeight;
      } else if (slug.includes(normalizedTerm)) {
        score += 10 * baseWeight;
      }

      if (type === normalizedTerm) {
        score += 8 * baseWeight;
      }

      if (content.includes(normalizedTerm)) {
        score += 3 * baseWeight;
      }

      if (url.includes(normalizedTerm)) {
        score += 6 * baseWeight;
      }
    }

    if (intent.offerings && type === 'page') {
      score += 18;
    }

    if (intent.offerings && this.matchesAnyKeyword([slug, title, url], ['sluzby', 'preklad', 'prepis', 'obsah', 'analytika', 'asistent'])) {
      score += 24;
    }

    if (intent.translation && this.matchesAnyKeyword([slug, title, url], ['preklad', 'textu'])) {
      score += 42;
    }

    if (intent.transcription && this.matchesAnyKeyword([slug, title, url], ['prepis', 'prepisovanie', 'audio', 'video'])) {
      score += 42;
    }

    if (intent.contentGeneration && this.matchesAnyKeyword([slug, title, url], ['generator', 'obsah', 'texty'])) {
      score += 42;
    }

    if (intent.analytics && this.matchesAnyKeyword([slug, title, url], ['analytika', 'analyza', 'data', 'reporting'])) {
      score += 42;
    }

    if (intent.webAssistant && this.matchesAnyKeyword([slug, title, url], ['web asistent', 'asistent', 'chatbot'])) {
      score += 42;
    }

    if (intent.offerings && this.matchesAnyKeyword([title, slug, url], ['chatgpt', 'midjourney', 'deepl', 'google translate'])) {
      score -= 24;
    }

    return score;
  }

  private matchesAnyKeyword(values: string[], keywords: string[]): boolean {
    return keywords.some((keyword) => {
      const normalizedKeyword = this.normalizeSearchText(keyword);
      return values.some((value) => value.includes(normalizedKeyword));
    });
  }

  private detectSearchIntent(query: string): SearchIntent {
    const normalized = this.normalizeSearchText(query);

    const includesAny = (terms: string[]) => terms.some((term) => normalized.includes(this.normalizeSearchText(term)));

    return {
      offerings: includesAny(['vase', 'vaše', 'vas', 'ponukate', 'ponúkate', 'mate', 'máte', 'sluzby', 'služby', 'app', 'aplikacia', 'aplikácie', 'nastroj', 'nástroj', 'nastroje', 'nástroje']),
      translation: includesAny(['preklad', 'preklad textu', 'translate', 'translator']),
      transcription: includesAny(['prepis', 'prepisovanie', 'transkript', 'audio', 'video']),
      contentGeneration: includesAny(['generator obsahu', 'obsah', 'copy', 'texty', 'clanky', 'články', 'emaily']),
      analytics: includesAny(['analytika', 'analyza', 'analýza', 'data', 'reporting']),
      webAssistant: includesAny(['web asistent', 'asistent', 'chatbot']),
    };
  }

  private normalizeSearchText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

type SearchIntent = {
  offerings: boolean;
  translation: boolean;
  transcription: boolean;
  contentGeneration: boolean;
  analytics: boolean;
  webAssistant: boolean;
};
