import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../src/lib/env.js';
import { ColourbondProductProvider } from '../src/services/colourbond-product-provider.js';
import type { GenerateReplyInput } from '../src/services/ai-provider.js';
import type { RetrievedChunk } from '../src/services/retrieval-service.js';

function chunk(title: string, content: string, index: number): RetrievedChunk {
  return {
    id: `chunk-${index}`,
    document_id: `document-${index}`,
    chunk_index: 0,
    content: `Produkt: ${title} Krátký popis: ${content} URL produktu: https://example.test/${index}`,
    metadata: { title, url: `https://example.test/${index}`, product_id: String(index) },
  };
}

function input(overrides: Partial<GenerateReplyInput> = {}): GenerateReplyInput {
  return {
    assistantName: 'Produktový poradce COLOUR BOND',
    language: 'cs',
    tone: 'professional',
    assistantProfile: 'colourbond_products',
    question: 'Potřebuji lepidlo na venkovní keramický stůl.',
    retrievedChunks: [
      chunk('Colour Bond P+ 6min', 'Keramika a gres pro lepení v interiéru.', 78),
      chunk('EVERCLEAR 510', 'Techno keramika pro exteriér, odolná cyklům mrazu a rozmrazování.', 83),
    ],
    conversationHistory: [],
    ...overrides,
  };
}

test('missing Groq key returns a deterministic reply with eligible cards in answer order', async () => {
  const originalKey = env.GROQ_API_KEY;
  env.GROQ_API_KEY = undefined;
  try {
    const reply = await new ColourbondProductProvider().generateReply(input());
    assert.match(reply.provider, /:groq-unavailable$/);
    assert.deepEqual(reply.products?.map((product) => product.title), ['EVERCLEAR 510']);
    assert.match(reply.text, /EVERCLEAR 510/);
    assert.doesNotMatch(reply.text, /zvažte[^]*Colour Bond P\+ 6min/u);
    assert.deepEqual(reply.sources.map((source) => source.title), ['EVERCLEAR 510']);
  } finally {
    env.GROQ_API_KEY = originalKey;
  }
});

test('reproduction: an LLM answer may name a rejected retrieved product', { todo: 'Guard currently checks all retrieved products instead of eligible products only.' }, async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'Colour Bond P+ 6min doporučuji pro váš venkovní keramický stůl.' } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const reply = await new ColourbondProductProvider().generateReply(input());
    assert.doesNotMatch(reply.text, /Colour Bond P\+ 6min/);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('reproduction: provider includes relevant conversation history in the Groq request', { todo: 'ColourbondProductProvider currently ignores conversationHistory.' }, async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let requestBody: { messages?: Array<{ content?: string }> } = {};
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body || '{}')) as typeof requestBody;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Doporučuji EVERCLEAR 510.' } }] }), { status: 200 });
  };
  try {
    await new ColourbondProductProvider().generateReply(input({
      question: 'A bude to venku v dešti a mrazu.',
      conversationHistory: [
        { role: 'user', content: 'Potřebuji lepidlo na keramický stůl.' },
        { role: 'assistant', content: 'Bude stůl v interiéru, nebo exteriéru?' },
      ],
    }));
    assert.ok(requestBody.messages?.some((message) => message.content?.includes('keramický stůl')));
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});
