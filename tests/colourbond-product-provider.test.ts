import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../src/lib/env.js';
import { ColourbondProductProvider } from '../src/services/colourbond-product-provider.js';
import { AIProviderRegistry, COLOURBOND_PRODUCTS_PROFILE, NASTROJE_WEBSITE_PROFILE } from '../src/services/ai-provider-registry.js';
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
    question: 'Potřebuji lepidlo na venkovní keramický stůl.',
    retrievedChunks: [
      chunk('Colour Bond P+ 6min', 'Keramika a gres pro lepení v interiéru.', 78),
      chunk('EVERCLEAR 510', 'Techno keramika pro exteriér, odolná cyklům mrazu a rozmrazování.', 83),
    ],
    conversationHistory: [],
    ...overrides,
  };
}

test('product selection returns a deterministic reply with eligible cards in answer order', async () => {
  const originalKey = env.GROQ_API_KEY;
  env.GROQ_API_KEY = undefined;
  try {
    const reply = await new ColourbondProductProvider().generateReply(input());
    assert.match(reply.provider, /:grounded-selection$/);
    assert.deepEqual(reply.products?.map((product) => product.title), ['EVERCLEAR 510']);
    assert.match(reply.text, /EVERCLEAR 510/);
    assert.doesNotMatch(reply.text, /zvažte[^]*Colour Bond P\+ 6min/u);
    assert.deepEqual(reply.sources.map((source) => source.title), ['EVERCLEAR 510']);
  } finally {
    env.GROQ_API_KEY = originalKey;
  }
});

test('CB-MT-001 first turn asks only for indoor or outdoor use and returns no cards', async () => {
  const originalKey = env.GROQ_API_KEY;
  env.GROQ_API_KEY = undefined;
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Dobrý den, potřebuji lepidlo na keramický stůl.',
      conversationHistory: [
        { role: 'user', content: 'Dobrý den, potřebuji lepidlo na keramický stůl.' },
      ],
    }));
    assert.equal(reply.text, 'Bude stůl v interiéru, nebo v exteriéru?');
    assert.deepEqual(reply.products, []);
    assert.deepEqual(reply.sources, []);
  } finally {
    env.GROQ_API_KEY = originalKey;
  }
});

test('missing technical data returns empty grounding and never calls Groq even when a key exists', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Groq must not be called for a clarification.');
  };
  try {
    const missingMaterial = await new ColourbondProductProvider().generateReply(input({
      question: 'Potřebuji lepidlo venku, na dešti a v mrazu.',
      conversationHistory: [],
    }));
    assert.match(missingMaterial.text, /Jaký materiál/);
    assert.deepEqual(missingMaterial.products, []);
    assert.deepEqual(missingMaterial.sources, []);

    const missingLocation = await new ColourbondProductProvider().generateReply(input({
      language: 'en',
      question: 'I need an adhesive for a ceramic table.',
      conversationHistory: [],
    }));
    assert.match(missingLocation.text, /indoors or outdoors/);
    assert.deepEqual(missingLocation.products, []);
    assert.deepEqual(missingLocation.sources, []);
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('complete product selection and suitability are deterministic and never call Groq', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Groq must not generate product selections.');
  };
  try {
    const selection = await new ColourbondProductProvider().generateReply(input());
    assert.deepEqual(selection.products?.map((product) => product.title), ['EVERCLEAR 510']);
    assert.match(selection.provider, /:grounded-selection$/);

    const suitability = await new ColourbondProductProvider().generateReply(input({
      question: 'Je EVERCLEAR 510 vhodný pro keramický stůl v exteriéru?',
    }));
    assert.deepEqual(suitability.products?.map((product) => product.title), ['EVERCLEAR 510']);
    assert.match(suitability.provider, /:grounded-selection$/);
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('direct product usage and shipping questions are not intercepted by the selection gate', async () => {
  const originalKey = env.GROQ_API_KEY;
  env.GROQ_API_KEY = undefined;
  try {
    const usageReply = await new ColourbondProductProvider().generateReply(input({
      question: 'Jak se používá Colour Bond P+ 6min?',
      retrievedChunks: [chunk('Colour Bond P+ 6min', 'Keramika a gres pro lepení v interiéru.', 78)],
    }));
    assert.doesNotMatch(usageReply.text, /Jaký materiál|interiéru, nebo v exteriéru/);

    const shippingReply = await new ColourbondProductProvider().generateReply(input({ question: 'Jak funguje doprava?' }));
    assert.match(shippingReply.provider, /:grounded-order$/);
    assert.doesNotMatch(shippingReply.text, /Jaký materiál|interiéru, nebo v exteriéru/);
  } finally {
    env.GROQ_API_KEY = originalKey;
  }
});

test('allowed direct usage question can still use the grounded Groq path', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Použití produktu Colour Bond P+ 6min ověřte podle dodaných katalogových údajů.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Jak se používá Colour Bond P+ 6min?',
      retrievedChunks: [chunk('Colour Bond P+ 6min', 'Keramika a gres pro lepení v interiéru.', 78)],
    }));
    assert.equal(fetchCalls, 1);
    assert.equal(reply.provider, `groq:${env.GROQ_MODEL}`);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('information requests containing need verbs are not treated as product selection', async () => {
  const provider = new ColourbondProductProvider();
  for (const [language, question] of [
    ['cs', 'Potřebuji bezpečnostní list k produktu.'],
    ['cs', 'Potřebuji technický list.'],
    ['cs', 'Potřebuji informace o vytvrzení produktu.'],
    ['en', 'I need curing information about this product.'],
    ['en', 'I need the safety data sheet.'],
  ] as const) {
    const reply = await provider.generateReply(input({ language, question, retrievedChunks: [] }));
    assert.doesNotMatch(reply.provider, /:missing-(material|location)$/u, question);
  }
});

test('non-selection intents continue to bypass the required-information gate', async () => {
  const provider = new ColourbondProductProvider();
  for (const question of [
    'Dobrý den',
    'Kdo jsi?',
    'Potřebuji kontakt na podporu.',
    'Chci reklamovat nebo vrátit zboží.',
    'Jaký je stav objednávky?',
  ]) {
    const reply = await provider.generateReply(input({ question }));
    assert.doesNotMatch(reply.text, /Jaký materiál|interiéru, nebo v exteriéru/, question);
  }
});

test('CB-MT-001 follow-up preserves ceramic and recommends only explicitly outdoor ceramic products', async () => {
  const originalKey = env.GROQ_API_KEY;
  env.GROQ_API_KEY = undefined;
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Bude venku, na dešti a v zimě také v mrazu.',
      retrievedChunks: [
        chunk('AKENOVA® ELASTIC 100', 'Přírodní a umělý kámen pro vnitřní i venkovní použití.', 118),
        chunk('AKENOVA® ROCKET 200', 'Přírodní kámen, kov a dřevo pro vnitřní i venkovní použití.', 121),
        chunk('Akepox 5010', 'Přírodní a umělý kámen, odolné vůči povětrnostním vlivům.', 64),
        chunk('EVERCLEAR 510', 'Techno keramika pro exteriér, odolná cyklům mrazu a rozmrazování.', 83),
      ],
      conversationHistory: [
        { role: 'user', content: 'Dobrý den, potřebuji lepidlo na keramický stůl.' },
        { role: 'assistant', content: 'Bude stůl v interiéru, nebo v exteriéru?' },
        { role: 'user', content: 'Bude venku, na dešti a v zimě také v mrazu.' },
      ],
    }));
    assert.deepEqual(reply.products?.map((product) => product.title), ['EVERCLEAR 510']);
    assert.match(reply.text, /EVERCLEAR 510/);
    assert.doesNotMatch(reply.text, /AKENOVA|Akepox 5010/);
    assert.doesNotMatch(reply.text, /upřesníte přesný materiál|jaký materiál/iu);
  } finally {
    env.GROQ_API_KEY = originalKey;
  }
});

test('CB-MT-001 follow-up returns no cards when no retrieved product confirms ceramic and outdoor use', async () => {
  const originalKey = env.GROQ_API_KEY;
  env.GROQ_API_KEY = undefined;
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Bude venku, na dešti a v zimě také v mrazu.',
      retrievedChunks: [
        chunk('AKENOVA® ELASTIC 100', 'Přírodní a umělý kámen pro vnitřní i venkovní použití.', 118),
        chunk('Akepox 5010', 'Přírodní a umělý kámen, odolné vůči povětrnostním vlivům.', 64),
      ],
      conversationHistory: [
        { role: 'user', content: 'Dobrý den, potřebuji lepidlo na keramický stůl.' },
        { role: 'assistant', content: 'Bude stůl v interiéru, nebo v exteriéru?' },
        { role: 'user', content: 'Bude venku, na dešti a v zimě také v mrazu.' },
      ],
    }));
    assert.deepEqual(reply.products, []);
    assert.deepEqual(reply.sources, []);
    assert.doesNotMatch(reply.text, /AKENOVA|Akepox 5010/);
    assert.doesNotMatch(reply.text, /upřesněte přesný materiál|jaký materiál/iu);
  } finally {
    env.GROQ_API_KEY = originalKey;
  }
});

test('CB-MT-001 ChatService retrieval query includes material from the immediate prior user turn', async () => {
  const messages = [
    { role: 'user', content: 'Dobrý den, potřebuji lepidlo na keramický stůl.' },
    { role: 'assistant', content: 'Bude stůl v interiéru, nebo v exteriéru?' },
  ];
  let retrievalQuery = '';
  const conversationRepository = {
    countMessages: async () => messages.length,
    createMessage: async (_id: string, role: string, content: string) => {
      messages.push({ role, content });
      return {};
    },
    listRecentMessages: async () => messages.map((message, index) => ({ ...message, id: String(index) })),
    findConversation: async () => ({ id: 'conversation-1', session_id: 'session-1' }),
    touchConversation: async () => undefined,
  };
  const retrievalService = {
    searchRelevantContent: async (_siteId: string, query: string) => {
      retrievalQuery = query;
      return [];
    },
  };
  const provider = {
    generateReply: async () => ({ text: 'Bez doporučení.', sources: [], products: [], provider: 'test' }),
  };
  const service = new ChatService(
    conversationRepository as never,
    retrievalService as never,
    { logUsage: async () => undefined } as never,
    new AIProviderRegistry(new Map([[COLOURBOND_PRODUCTS_PROFILE, provider]])),
  );

  await service.sendMessage({
    site: { id: 'site-1', language: 'cs' },
    settings: { sync_config: { ai_config: { assistant_profile: COLOURBOND_PRODUCTS_PROFILE } } },
  } as never, {
    conversation_id: 'conversation-1',
    message: 'Bude venku, na dešti a v zimě také v mrazu.',
  });

  assert.match(retrievalQuery, /keramický stůl/);
  assert.match(retrievalQuery, /venku, na dešti/);
  assert.doesNotMatch(retrievalQuery, /Bude stůl v interiéru/);
  assert.equal(retrievalQuery.split('\n').length, 2);
});

test('ChatService sends only the current query for completed context and leaves other profiles unchanged', async () => {
  const run = async (profile: string, assistantReply: string) => {
    const current = 'Bude nový projekt venku?';
    const messages = [
      { role: 'user', content: 'Potřebuji lepidlo na keramiku.' },
      { role: 'assistant', content: assistantReply },
    ];
    let retrievalQuery = '';
    const service = new ChatService(
      {
        countMessages: async () => messages.length,
        createMessage: async (_id: string, role: string, content: string) => { messages.push({ role, content }); return {}; },
        listRecentMessages: async () => messages,
        findConversation: async () => ({ id: 'conversation-1', session_id: 'session-1' }),
        touchConversation: async () => undefined,
      } as never,
      { searchRelevantContent: async (_siteId: string, query: string) => { retrievalQuery = query; return []; } } as never,
      { logUsage: async () => undefined } as never,
      new AIProviderRegistry(new Map([[profile, { generateReply: async () => ({ text: 'Test.', sources: [], provider: 'test' }) }]])),
    );
    await service.sendMessage({
      site: { id: 'site-1', language: 'cs' },
      settings: { sync_config: { ai_config: { assistant_profile: profile } } },
    } as never, { conversation_id: 'conversation-1', message: current });
    return retrievalQuery;
  };

  assert.equal(await run(COLOURBOND_PRODUCTS_PROFILE, 'Doporučuji katalogový produkt.'), 'Bude nový projekt venku?');
  assert.equal(await run(NASTROJE_WEBSITE_PROFILE, 'Libovolná odpověď.'), 'Bude nový projekt venku?');
});

test('product selection never calls mocked Groq and returns eligible-only deterministic output', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Colour Bond P+ 6min doporučuji pro váš venkovní keramický stůl.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input());
    assert.doesNotMatch(reply.text, /Colour Bond P\+ 6min/);
    assert.deepEqual(reply.products?.map((product) => product.title), ['EVERCLEAR 510']);
    assert.deepEqual(reply.sources.map((source) => source.title), ['EVERCLEAR 510']);
    assert.match(reply.provider, /:grounded-selection$/);
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('an explicitly requested rejected product uses deterministic rejection without Groq or cards', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Groq must not phrase an explicit rejected-product restriction.');
  };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Mohu použít Colour Bond P+ 6min na keramický stůl v exteriéru?',
    }));
    assert.match(reply.text, /Colour Bond P\+ 6min/);
    assert.match(reply.provider, /:constraint-filtered$/);
    assert.deepEqual(reply.products, []);
    assert.deepEqual(reply.sources, []);
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('a unique shortened rejected product name uses deterministic rejection without Groq or cards', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Groq must not handle a uniquely matched rejected alias.');
  };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Mohu použít Colour Bond P+ na keramický stůl v exteriéru?',
    }));
    assert.match(reply.text, /Colour Bond P\+ 6min/);
    assert.match(reply.provider, /:constraint-filtered$/);
    assert.deepEqual(reply.products, []);
    assert.deepEqual(reply.sources, []);
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('CB-MT-001 follow-up selection uses relevant history without calling Groq', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Groq must not generate follow-up selections.');
  };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'A bude to venku v dešti a mrazu.',
      conversationHistory: [
        { role: 'user', content: 'Potřebuji lepidlo na keramický stůl.' },
        { role: 'assistant', content: 'Bude stůl v interiéru, nebo v exteriéru?' },
      ],
    }));
    assert.deepEqual(reply.products?.map((product) => product.title), ['EVERCLEAR 510']);
    assert.match(reply.provider, /:grounded-selection$/);
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('CZ and EN suitability variants fail closed to deterministic selection without Groq', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Product advice must not reach Groq.');
  };
  try {
    for (const [language, question] of [
      ['cs', 'Hodí se tento produkt na keramiku venku?'],
      ['cs', 'Co byste použil na keramický stůl venku?'],
      ['cs', 'Můžu to použít na keramiku v exteriéru?'],
      ['cs', 'Je to dobré na venkovní keramický stůl?'],
      ['en', 'Does this work for ceramic outdoors?'],
      ['en', 'Is this okay for outdoor ceramic?'],
      ['en', 'What would you use for a ceramic table outdoors?'],
      ['en', 'Can I use this on outdoor ceramic?'],
      ['en', 'Would this be a sensible choice for a ceramic table outdoors?'],
    ] as const) {
      const reply = await new ColourbondProductProvider().generateReply(input({ language, question }));
      assert.equal(reply.provider, 'deterministic:grounded-selection', question);
      assert.deepEqual(reply.products?.map((product) => product.title), ['EVERCLEAR 510'], question);
    }
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('vague product-domain wording asks for intent clarification without Groq', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Vague wording must not reach Groq.');
  };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({ question: 'Mám dotaz k produktu.' }));
    assert.match(reply.text, /výběrem produktu.*informace o konkrétním produktu/u);
    assert.equal(reply.provider, 'deterministic:product-intent-clarification');
    assert.deepEqual(reply.products, []);
    assert.deepEqual(reply.sources, []);
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('only explicit catalogue information intents are allowlisted to grounded Groq', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'The requested catalogue information is available for this product.' } }] }), { status: 200 });
  };
  try {
    const questions = [
      ['cs', 'Jak se používá Colour Bond P+ 6min?'],
      ['cs', 'Potřebuji bezpečnostní list k tomuto produktu.'],
      ['cs', 'Potřebuji informace o době vytvrzení tohoto produktu.'],
      ['en', 'How do I apply this product?'],
      ['en', 'I need the safety data sheet for this product.'],
      ['en', 'I need curing information about this product.'],
    ] as const;
    for (const [language, question] of questions) {
      const reply = await new ColourbondProductProvider().generateReply(input({ language, question }));
      assert.equal(reply.provider, `groq:${env.GROQ_MODEL}`, question);
      assert.doesNotMatch(reply.text, /What material|Jaký materiál|indoors or outdoors|interiéru, nebo v exteriéru/u, question);
    }
    assert.equal(fetchCalls, questions.length);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('deterministic selection never leaks raw catalogue descriptions or unselected product names', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('Selection must not reach Groq.'); };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Potřebuji lepidlo na keramiku do exteriéru.',
      retrievedChunks: [
        chunk('Eligible Alpha 100', 'Keramika pro exteriér. Porovnejte s Rejected Beta 200 a Unselected Delta 400.', 1),
        chunk('Rejected Beta 200', 'Pouze dřevo pro exteriér.', 2),
        chunk('Unselected Delta 400', 'Pouze kov pro exteriér.', 4),
      ],
    }));
    assert.deepEqual(reply.products?.map((product) => product.title), ['Eligible Alpha 100']);
    assert.deepEqual(reply.sources.map((source) => source.title), ['Eligible Alpha 100']);
    assert.doesNotMatch(reply.text, /Rejected Beta 200|Unselected Delta 400|Porovnejte/u);
    assert.doesNotMatch(reply.products?.[0]?.reason || '', /Rejected Beta 200|Unselected Delta 400|Porovnejte/u);
    assert.match(reply.products?.[0]?.reason || '', /keramiku nebo gres.*exteriéru|exteriéru.*keramiku nebo gres/u);
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('provider returns one main product and two ordered alternatives from four eligible products', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('Selection must not reach Groq.'); };
  try {
    const titles = ['Alpha 100', 'Beta 200', 'Gamma 300', 'Delta 400'];
    const reply = await new ColourbondProductProvider().generateReply(input({
      question: 'Potřebuji lepidlo na keramiku do exteriéru.',
      retrievedChunks: titles.map((title, index) => chunk(
        title,
        `${index === 0 ? 'Raw reason mentions Delta 400.' : `Raw reason ${index + 1}.`} Keramika pro exteriér.`,
        index + 1,
      )),
    }));
    assert.deepEqual(reply.products?.map((product) => product.title), titles.slice(0, 3));
    assert.deepEqual(reply.sources.map((source) => source.title), titles.slice(0, 3));
    assert.match(reply.text, /hlavní vhodnou volbou Alpha 100/u);
    assert.ok(reply.text.indexOf('Alpha 100') < reply.text.indexOf('Beta 200'));
    assert.ok(reply.text.indexOf('Beta 200') < reply.text.indexOf('Gamma 300'));
    assert.doesNotMatch(reply.text, /Delta 400|Raw reason/u);
    assert.ok(reply.products?.every((product) => product.reason?.startsWith('Katalog výslovně potvrzuje')));
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('complete English selection uses natural deterministic prose and safe reasons', async () => {
  const originalKey = env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.GROQ_API_KEY = 'test-key-never-sent';
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('Selection must not reach Groq.'); };
  try {
    const reply = await new ColourbondProductProvider().generateReply(input({
      language: 'en',
      question: 'I need an adhesive for a ceramic table outdoors.',
      retrievedChunks: [
        chunk('Alpha 100', 'Raw catalogue prose. Ceramic for outdoor use.', 1),
        chunk('Beta 200', 'Another raw description. Ceramic for outdoor use.', 2),
      ],
    }));
    assert.equal(reply.provider, 'deterministic:grounded-selection');
    assert.deepEqual(reply.products?.map((product) => product.title), ['Alpha 100', 'Beta 200']);
    assert.deepEqual(reply.sources.map((source) => source.title), ['Alpha 100', 'Beta 200']);
    assert.match(reply.text, /main suitable choice is Alpha 100/u);
    assert.match(reply.text, /Suitable alternatives:\n- Beta 200/u);
    assert.doesNotMatch(reply.text, /Raw catalogue prose|Another raw description|What material|indoors or outdoors/u);
    assert.ok(reply.products?.every((product) => product.reason?.startsWith('The catalogue explicitly confirms')));
    assert.equal(fetchCalls, 0);
  } finally {
    env.GROQ_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});
