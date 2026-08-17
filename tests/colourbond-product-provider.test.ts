import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../src/lib/env.js';
import { ColourbondProductProvider } from '../src/services/colourbond-product-provider.js';
import { AIProviderRegistry, COLOURBOND_PRODUCTS_PROFILE } from '../src/services/ai-provider-registry.js';
import { ChatService } from '../src/services/chat-service.js';
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
    question: 'Potřebuji lepidlo na keramický stůl v interiéru.',
    retrievedChunks: [
      chunk('Colour Bond P+ 6min', 'Keramika a gres pro lepení viditelných spojů.', 78),
      chunk('EVERCLEAR 510', 'Techno keramika pro exteriér, odolná cyklům mrazu.', 83),
    ],
    conversationHistory: [],
    ...overrides,
  };
}

function groqSuccess(reply: string) {
  return async () => new Response(
    JSON.stringify({ choices: [{ message: { content: reply } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function chatHarness(language: string, retrievedChunks: RetrievedChunk[]) {
  const messages: Array<{ role: string; content: string }> = [];
  const service = new ChatService(
    {
      countMessages: async () => messages.length,
      createMessage: async (_id: string, role: string, content: string) => {
        messages.push({ role, content });
        return {};
      },
      listRecentMessages: async (_id: string, limit: number) => messages.slice(-limit),
      findConversation: async () => ({ id: 'conversation-quick', session_id: 'session-quick' }),
      touchConversation: async () => undefined,
    } as never,
    { searchRelevantContent: async () => retrievedChunks } as never,
    { logUsage: async () => undefined } as never,
    new AIProviderRegistry(new Map([[COLOURBOND_PRODUCTS_PROFILE, new ColourbondProductProvider()]])),
  );
  const send = (message: string) => service.sendMessage({
    site: { id: 'site-quick', language },
    settings: { sync_config: { ai_config: { assistant_profile: COLOURBOND_PRODUCTS_PROFILE } } },
  } as never, { conversation_id: 'conversation-quick', language, message });
  return { messages, send };
}

// --- Required regression: selection three-turn flow does not fall into a
// deterministic missing-material / missing-location loop, and indoor use is
// never rejected just because the textual catalogue lacks a literal marker.
test('selection three turns never trigger the formulaic material/location gate or reject all ceramic products for missing indoor marker', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  env.GROQ_API_KEY = 'test-key';
  globalThis.fetch = groqSuccess('EVERCLEAR 510 je vhodná volba.');
  try {
    const harness = chatHarness('cs', [
      chunk('EVERCLEAR 510', 'Keramika pro exteriér, odolná cyklům mrazu.', 83),
      chunk('Colour Bond P+ 6min', 'Keramika a gres. Rychle tvrdnoucí.', 78),
    ]);
    const first = await harness.send('Pomozte mi vybrat vhodný produkt COLOUR BOND.');
    assert.doesNotMatch(first.provider, /^deterministic:(missing-material|missing-location|constraint-filtered|product-intent-clarification)$/);

    const second = await harness.send('potrebuju keramiku lepit');
    assert.doesNotMatch(second.provider, /^deterministic:(missing-material|missing-location|constraint-filtered)$/);

    const third = await harness.send('v interieru');
    assert.doesNotMatch(third.provider, /^deterministic:(missing-material|missing-location)$/);
    // Indoor-only requests must not be rejected only because the catalogue text
    // does not carry a literal "interier" marker. The textual export from
    // PrestaShop does not have that structured field.
    assert.doesNotMatch(third.reply, /nemohu.*bezpe.n.*doporu/iu);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

// --- Required regression: a single complete indoor question does not
// short-circuit into missing-material, missing-location, or a blanket rejection.
test('a direct indoor ceramic question does not ask for material/location and is not rejected for a missing indoor marker', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  env.GROQ_API_KEY = 'test-key';
  globalThis.fetch = groqSuccess('Doporučuji Colour Bond P+ 6min.');
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Potřebuji lepidlo na keramický stůl v interiéru.',
      retrievedChunks: [chunk('Colour Bond P+ 6min', 'Keramika a gres. Rychle tvrdnoucí.', 78)],
    }));
    assert.doesNotMatch(reply.provider, /^deterministic:(missing-material|missing-location|constraint-filtered)$/);
    assert.doesNotMatch(reply.text, /Jaký materiál|interiéru, nebo v exteriéru|nemohu.*bezpe.n.*doporu/iu);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

// --- Required regression: outdoor safety must reject Colour Bond P+ 6min
// when its catalogue text lacks any outdoor confirmation.
test('outdoor ceramic question never recommends Colour Bond P+ 6min when outdoor use is not confirmed', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  env.GROQ_API_KEY = 'test-key';
  globalThis.fetch = groqSuccess('Colour Bond P+ 6min je vhodný na venkovní keramiku.');
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Hodí se Colour Bond P+ 6min na keramický stůl venku, na dešti a v mrazu?',
      retrievedChunks: [
        chunk('Colour Bond P+ 6min', 'Keramika a gres pro rychlé lepení viditelných spojů.', 78),
        chunk('EVERCLEAR 510', 'Techno keramika pro exteriér, odolná cyklům mrazu.', 83),
      ],
    }));
    const titles = (reply.products || []).map((product) => product.title);
    assert.ok(!titles.includes('Colour Bond P+ 6min'), `Colour Bond P+ 6min was recommended as an outdoor product; got: ${titles.join(', ')}`);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

// --- Required regression: usage safety, no Groq, no fabricated procedure.
test('direct usage question is deterministic, never calls Groq, and excludes fabricated procedure details', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('Usage must not call Groq.'); };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Jak se používá Colour Bond P+ 6min?',
      retrievedChunks: [
        chunk('Colour Bond P+ 6min', 'Použijte Čistič I 45015. Pracovní čas 5–7 minut. Plná pevnost za 24 h. Kladivo. Certifikováno pro potraviny.', 78),
        chunk('Čistič I', 'Doporučené příslušenství pro čištění.', 79),
      ],
    }));
    assert.equal(fetchCalls, 0);
    assert.equal(reply.provider, 'deterministic:product-usage-limited');
    assert.deepEqual(reply.products?.map((product) => product.title), ['Colour Bond P+ 6min']);
    assert.deepEqual(reply.sources.map((source) => source.title), ['Colour Bond P+ 6min']);
    assert.match(reply.text, /návodu výrobce|technického listu/u);
    assert.doesNotMatch(reply.text, /Čistič I|45015|5–7|24\s*h|potravin|kladivo/iu);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

// --- Required regression: real widget usage-quick-action payload asks for a
// specific product, does not ask for material/location, and does not call Groq.
test('the CZ widget usage-quick-action payload asks for a specific product without calling Groq', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('Usage quick action must not call Groq.'); };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Potřebuji poradit s použitím produktu.',
      retrievedChunks: [chunk('Colour Bond P+ 6min', 'Keramika a gres.', 78)],
    }));
    assert.equal(fetchCalls, 0);
    assert.equal(reply.provider, 'deterministic:missing-usage-product');
    assert.equal(reply.text, 'Který konkrétní produkt chcete použít? Napište jeho název.');
    assert.deepEqual(reply.products, []);
    assert.deepEqual(reply.sources, []);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

// --- Preserved safety: guarded Groq fallback when the model text mentions an
// off-brand product; falls back to the deterministic reply that only lists
// the retrieved eligible products.
test('guarded fallback replaces Groq text that mentions non-retrieved brands', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  env.GROQ_API_KEY = 'test-key';
  globalThis.fetch = groqSuccess('Doporučuji **SikaBond** pro venkovní keramiku.');
  try {
    const reply = await new ColourbondProductProvider().generateReply(input());
    assert.doesNotMatch(reply.text, /SikaBond/u);
    assert.match(reply.provider, /:groq-guarded-fallback$/);
    assert.ok((reply.products || []).length <= 3);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

// --- Preserved safety: rejected products never become product cards.
test('a directly asked rejected product produces a deterministic explanation and no product cards', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  env.GROQ_API_KEY = undefined;
  globalThis.fetch = async () => { throw new Error('No Groq for a single-candidate rejected question.'); };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Mohu použít Colour Bond P+ 6min na keramický stůl v exteriéru?',
      retrievedChunks: [chunk('Colour Bond P+ 6min', 'Keramika a gres. Rychle tvrdnoucí.', 78)],
    }));
    assert.match(reply.text, /Colour Bond P\+ 6min/u);
    assert.deepEqual(reply.products, []);
    assert.deepEqual(reply.sources, []);
    assert.match(reply.provider, /:constraint-filtered$/);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

// --- Return-related wording ("vrátit zboží", "vratit") must route to the
// complaint/return contact reply, not fall through to noContextReply.
test('return-related wording is routed to the complaint/return contact reply', async () => {
  const provider = new ColourbondProductProvider();
  for (const question of [
    'Chci vrátit zboží.',
    'Rád bych vratil zboží.',
    'How do I return this item?',
    'I want a refund.',
  ]) {
    const reply = await provider.generateReply(input({ question, retrievedChunks: [] }));
    assert.match(reply.provider, /:grounded-returns$/, question);
    assert.match(reply.text, /Napište nám na info@colourbond\.cz|Please email us at info@colourbond\.cz/u, question);
  }
});

// --- Preserved safety: greeting/order/contact intents remain deterministic and
// do not fall into any material/location question.
test('non-selection intents (greeting, contact, order) never ask for material or indoor/outdoor use', async () => {
  const provider = new ColourbondProductProvider();
  for (const question of ['Dobrý den', 'Kdo jsi?', 'Potřebuji kontakt na podporu.', 'Chci reklamovat zboží.', 'Jaký je stav objednávky?']) {
    const reply = await provider.generateReply(input({ question, retrievedChunks: [] }));
    assert.doesNotMatch(reply.text, /Jaký materiál|interiéru, nebo v exteriéru/, question);
  }
});

// --- ChatService boundary: recent-message limit is 8 for all profiles and the
// retrieval query is always the raw current message (the chain resolver was
// removed together with the formulaic gate that produced the loop).
test('ChatService uses limit 8 and current-message retrieval for the Colourbond profile', async () => {
  let recentMessageLimit = 0;
  let retrievalQuery = '';
  const service = new ChatService(
    {
      countMessages: async () => 0,
      createMessage: async () => ({}),
      listRecentMessages: async (_id: string, limit: number) => { recentMessageLimit = limit; return []; },
      findConversation: async () => ({ id: 'c', session_id: 's' }),
      touchConversation: async () => undefined,
    } as never,
    { searchRelevantContent: async (_siteId: string, query: string) => { retrievalQuery = query; return []; } } as never,
    { logUsage: async () => undefined } as never,
    new AIProviderRegistry(new Map([[COLOURBOND_PRODUCTS_PROFILE, { generateReply: async () => ({ text: 'ok', sources: [], products: [], provider: 'test' }) }]])),
  );
  await service.sendMessage({
    site: { id: 'site-1', language: 'cs' },
    settings: { sync_config: { ai_config: { assistant_profile: COLOURBOND_PRODUCTS_PROFILE } } },
  } as never, { conversation_id: 'c', message: 'Aktuální dotaz.' });

  assert.equal(recentMessageLimit, 8);
  assert.equal(retrievalQuery, 'Aktuální dotaz.');
});

// --- Fix 1: single-turn context helper. A location/exposure follow-up after a
// natural assistant reply must combine with the immediately prior material
// user turn for the retrieval query and provider question.
test('ChatService follow-up combines the immediate prior material user turn into the retrieval query and provider question', async () => {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'user', content: 'Potřebuji lepidlo na keramický stůl.' },
    { role: 'assistant', content: 'Rád pomůžu. Jaké má být použití?' },
  ];
  const retrievalQueries: string[] = [];
  const providerQuestions: string[] = [];
  const service = new ChatService(
    {
      countMessages: async () => messages.length,
      createMessage: async (_id: string, role: string, content: string) => { messages.push({ role, content }); return {}; },
      listRecentMessages: async (_id: string, limit: number) => messages.slice(-limit),
      findConversation: async () => ({ id: 'c', session_id: 's' }),
      touchConversation: async () => undefined,
    } as never,
    { searchRelevantContent: async (_siteId: string, query: string) => { retrievalQueries.push(query); return []; } } as never,
    { logUsage: async () => undefined } as never,
    new AIProviderRegistry(new Map([[COLOURBOND_PRODUCTS_PROFILE, {
      generateReply: async (providerInput: GenerateReplyInput) => {
        providerQuestions.push(providerInput.question);
        return { text: 'ok', sources: [], products: [], provider: 'test' };
      },
    }]])),
  );

  await service.sendMessage({
    site: { id: 'site-1', language: 'cs' },
    settings: { sync_config: { ai_config: { assistant_profile: COLOURBOND_PRODUCTS_PROFILE } } },
  } as never, { conversation_id: 'c', message: 'Bude venku, na dešti a v zimě také v mrazu.' });

  const retrievalQuery = retrievalQueries.at(-1) || '';
  assert.match(retrievalQuery, /keramick/u);
  assert.match(retrievalQuery, /venku|mrazu/u);
  const providerQuestion = providerQuestions.at(-1) || '';
  assert.match(providerQuestion, /keramick/u);
  assert.match(providerQuestion, /venku|mrazu/u);
});

// --- Fix 1: an explicit new-topic phrase never inherits the prior material.
test('ChatService follow-up does not inherit prior material when the current message is an explicit new-topic request', async () => {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'user', content: 'Potřebuji lepidlo na keramický stůl.' },
    { role: 'assistant', content: 'Doporučuji katalogový produkt.' },
  ];
  const retrievalQueries: string[] = [];
  const service = new ChatService(
    {
      countMessages: async () => messages.length,
      createMessage: async (_id: string, role: string, content: string) => { messages.push({ role, content }); return {}; },
      listRecentMessages: async (_id: string, limit: number) => messages.slice(-limit),
      findConversation: async () => ({ id: 'c', session_id: 's' }),
      touchConversation: async () => undefined,
    } as never,
    { searchRelevantContent: async (_siteId: string, query: string) => { retrievalQueries.push(query); return []; } } as never,
    { logUsage: async () => undefined } as never,
    new AIProviderRegistry(new Map([[COLOURBOND_PRODUCTS_PROFILE, {
      generateReply: async () => ({ text: 'ok', sources: [], products: [], provider: 'test' }),
    }]])),
  );

  await service.sendMessage({
    site: { id: 'site-1', language: 'cs' },
    settings: { sync_config: { ai_config: { assistant_profile: COLOURBOND_PRODUCTS_PROFILE } } },
  } as never, { conversation_id: 'c', message: 'Teď potřebuji něco jiného venku.' });

  const retrievalQuery = retrievalQueries.at(-1) || '';
  assert.doesNotMatch(retrievalQuery, /keramick/u);
  assert.match(retrievalQuery, /neco jineho|venku/u);
});

// --- Fix 2: Groq text that mentions a rejected product (full title or unique
// alias) is discarded; the deterministic fallback lists only eligible products
// and never repeats the rejected product name in text, cards, or sources.
test('Groq output that mentions a rejected product is discarded and the fallback contains only eligible products', async () => {
  for (const mockedText of [
    'Colour Bond P+ 6min doporučuji pro venkovní keramiku.',
    'Colour Bond P+ doporučuji pro venkovní keramiku.',
  ]) {
    const originalKey = env.GROQ_API_KEY;
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    env.GROQ_API_KEY = 'test-key';
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: mockedText } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
      const reply = await new ColourbondProductProvider().generateReply(input({
        question: 'Doporučte lepidlo na keramický stůl venku, na dešti a v mrazu.',
        retrievedChunks: [
          chunk('Colour Bond P+ 6min', 'Keramika a gres pro rychlé lepení viditelných spojů.', 78),
          chunk('EVERCLEAR 510', 'Techno keramika pro exteriér, odolná cyklům mrazu.', 83),
        ],
      }));
      assert.equal(fetchCalls, 1, `Groq must be called for ${mockedText}`);
      assert.match(reply.provider, /:groq-guarded-fallback$/, mockedText);
      assert.doesNotMatch(reply.text, /Colour Bond P\+ 6min|Colour Bond P\+/u, mockedText);
      const titles = (reply.products || []).map((product) => product.title);
      assert.ok(!titles.includes('Colour Bond P+ 6min'), `${mockedText}: cards contained rejected product; got ${titles.join(', ')}`);
      const sourceTitles = reply.sources.map((source) => source.title);
      assert.ok(!sourceTitles.includes('Colour Bond P+ 6min'), `${mockedText}: sources contained rejected product; got ${sourceTitles.join(', ')}`);
      assert.deepEqual(titles, ['EVERCLEAR 510'], mockedText);
    } finally {
      env.GROQ_API_KEY = originalKey;
      globalThis.fetch = originalFetch;
    }
  }
});

// --- Fix 3: EN widget selection quick action payload contains the word
// `help` but must not be classified as an identity/capability question. A
// plain capability question without a selection verb must still be answered
// with the capability reply.
test('an English selection quick action containing the word "help" routes to selection, not to identity/capability', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  env.GROQ_API_KEY = undefined;
  globalThis.fetch = async () => { throw new Error('No Groq configured for this test.'); };
  try {
    const provider = new ColourbondProductProvider();
    const selection = await provider.generateReply(input({
      language: 'en',
      question: 'Please help me choose a suitable COLOUR BOND product.',
      retrievedChunks: [
        chunk('EVERCLEAR 510', 'Techno ceramic outdoor use, frost cycles.', 83),
      ],
    }));
    assert.ok(!/grounded-guide$/.test(selection.provider), `selection routed to capability: ${selection.provider}`);
    assert.doesNotMatch(selection.text, /I am the COLOUR BOND AI Product Adviser\./u);

    const capability = await provider.generateReply(input({
      language: 'en',
      question: 'What can you help me with?',
      retrievedChunks: [],
    }));
    assert.match(capability.provider, /grounded-guide$/);
    assert.match(capability.text, /I am the COLOUR BOND AI Product Adviser\./u);

    const czGreeting = await provider.generateReply(input({
      language: 'cs',
      question: 'Kdo jsi?',
      retrievedChunks: [],
    }));
    assert.match(czGreeting.provider, /grounded-guide$/);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

// --- A message that names a specific catalogue brand/product must not inherit
// a material from the previous user turn (regression: after a granite question,
// a follow-up "Colour Bond P+ outdoors" was inheriting the granite constraint).
test('ChatService follow-up does not inherit material when the current message names a specific catalogue product', async () => {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'user', content: 'Potřebuji lepidlo na žulu do exteriéru.' },
    { role: 'assistant', content: 'Doporučuji katalogový produkt.' },
  ];
  const retrievalQueries: string[] = [];
  const service = new ChatService(
    {
      countMessages: async () => messages.length,
      createMessage: async (_id: string, role: string, content: string) => { messages.push({ role, content }); return {}; },
      listRecentMessages: async (_id: string, limit: number) => messages.slice(-limit),
      findConversation: async () => ({ id: 'c', session_id: 's' }),
      touchConversation: async () => undefined,
    } as never,
    { searchRelevantContent: async (_siteId: string, query: string) => { retrievalQueries.push(query); return []; } } as never,
    { logUsage: async () => undefined } as never,
    new AIProviderRegistry(new Map([[COLOURBOND_PRODUCTS_PROFILE, {
      generateReply: async () => ({ text: 'ok', sources: [], products: [], provider: 'test' }),
    }]])),
  );

  await service.sendMessage({
    site: { id: 'site-1', language: 'cs' },
    settings: { sync_config: { ai_config: { assistant_profile: COLOURBOND_PRODUCTS_PROFILE } } },
  } as never, { conversation_id: 'c', message: 'Mohu použít Colour Bond P+ 6min venku na dešti?' });

  const retrievalQuery = retrievalQueries.at(-1) || '';
  assert.doesNotMatch(retrievalQuery, /\bžul[uae]\b/iu);
  assert.match(retrievalQuery, /Colour Bond P\+ 6min/u);
});
