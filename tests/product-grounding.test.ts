import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductCard } from '../src/services/ai-provider.js';
import { findUniqueProductReference, isProductSelectionRequest, partitionProducts, resolveProductQuestionContext, selectMentionedProducts, truncateAtSentence } from '../src/services/product-grounding.js';

function product(title: string): ProductCard {
  return {
    product_id: title,
    cover_image_id: null,
    title,
    url: `https://example.test/${encodeURIComponent(title)}`,
    image_url: null,
    price_without_tax: null,
    quantity: null,
    category: null,
    reason: '',
  };
}

test('outdoor ceramic request keeps only products with both explicit confirmations', () => {
  const colourBond = product('Colour Bond P+ 6min');
  const everclear = product('EVERCLEAR 510');
  const clear300 = product('AKENOVA CLEAR 300');
  const result = partitionProducts([
    { product: colourBond, catalogueText: 'Lepení keramiky a gresu. Rychle tvrdnoucí lepidlo.' },
    { product: everclear, catalogueText: 'Pro exteriér, Techno keramiku a cykly mrazu a rozmrazování.' },
    { product: clear300, catalogueText: 'Pro vnitřní i venkovní použití. Odolnost vůči povětrnostním vlivům. Pro přírodní kámen.' },
  ], 'Mohu lepit venkovní keramický stůl vystavený dešti a mrazu?');

  assert.deepEqual(result.eligible.map((candidate) => candidate.product.title), ['EVERCLEAR 510']);
  assert.deepEqual(result.rejected.map((candidate) => candidate.product.title), ['Colour Bond P+ 6min', 'AKENOVA CLEAR 300']);
  assert.deepEqual(result.rejected[0]?.reasons, ['explicitly confirmed outdoor use']);
  assert.deepEqual(result.rejected[1]?.reasons, ['ceramic or gres']);
});

test('missing catalogue property is not treated as confirmed compatibility', () => {
  const candidate = product('Generic adhesive');
  const result = partitionProducts(
    [{ product: candidate, catalogueText: 'Silné lepidlo pro různé aplikace.' }],
    'Potřebuji lepidlo na keramiku do exteriéru.',
  );
  assert.equal(result.eligible.length, 0);
  assert.deepEqual(result.rejected[0]?.reasons, ['explicitly confirmed outdoor use', 'ceramic or gres']);
});

test('indoor requests require explicit indoor confirmation and preserve outdoor behavior', () => {
  const indoor = { product: product('Indoor Wood'), catalogueText: 'Dřevo pro použití v interiéru. Indoor use.' };
  const outdoorOnly = { product: product('Outdoor Wood'), catalogueText: 'Dřevo pouze pro exteriér. Outdoor-only.' };
  const unspecified = { product: product('Unspecified Wood'), catalogueText: 'Silné lepidlo na dřevo.' };
  const both = { product: product('Indoor Outdoor Wood'), catalogueText: 'Dřevo pro vnitřní i venkovní použití. Indoor and outdoor.' };

  const indoorResult = partitionProducts([indoor, outdoorOnly, unspecified, both], 'Lepidlo na dřevo do interiéru.');
  assert.deepEqual(indoorResult.eligible.map((candidate) => candidate.product.title), ['Indoor Wood', 'Indoor Outdoor Wood']);
  assert.deepEqual(indoorResult.rejected.map((candidate) => candidate.product.title), ['Outdoor Wood', 'Unspecified Wood']);
  assert.ok(indoorResult.rejected.every((candidate) => candidate.reasons.includes('explicitly confirmed indoor use')));

  const outdoorResult = partitionProducts([indoor, outdoorOnly, unspecified, both], 'Lepidlo na dřevo do exteriéru.');
  assert.deepEqual(outdoorResult.eligible.map((candidate) => candidate.product.title), ['Outdoor Wood', 'Indoor Outdoor Wood']);

  const unrelatedIndoorWord = partitionProducts(
    [{ product: product('Design Wood'), catalogueText: 'Dřevo s interiérovým designem obalu.' }],
    'Lepidlo na dřevo do interiéru.',
  );
  assert.equal(unrelatedIndoorWord.eligible.length, 0);
});

test('cards include only products named in the answer and are limited to three', () => {
  const products = ['Product Alpha', 'Product Beta', 'Product Gamma', 'Product Delta'].map(product);
  assert.deepEqual(
    selectMentionedProducts('Doporučuji Product Beta a jako alternativu Product Delta.', products).map((candidate) => candidate.title),
    ['Product Beta', 'Product Delta'],
  );
});

test('eligible products preserve retrieval order and rejected products never become cards', () => {
  const products = [
    { product: product('Colour Bond P+ 6min'), catalogueText: 'Keramika a gres. Pouze pro interiér.' },
    { product: product('EVERCLEAR 510'), catalogueText: 'Techno keramika. Bez omezení pro exteriér a cykly mrazu.' },
    { product: product('AKENOVA CLEAR 300'), catalogueText: 'Keramika pro vnitřní a venkovní použití.' },
    { product: product('Fourth suitable product'), catalogueText: 'Keramika pro exteriér.' },
  ];
  const result = partitionProducts(products, 'Lepidlo na keramiku do exteriéru.');

  assert.deepEqual(result.eligible.map((candidate) => candidate.product.title), [
    'EVERCLEAR 510',
    'AKENOVA CLEAR 300',
    'Fourth suitable product',
  ]);
  assert.deepEqual(result.rejected.map((candidate) => candidate.product.title), ['Colour Bond P+ 6min']);

  const cards = selectMentionedProducts(
    'EVERCLEAR 510, AKENOVA CLEAR 300 a Fourth suitable product. Colour Bond P+ 6min není vhodný.',
    result.eligible.map((candidate) => candidate.product),
  );
  assert.deepEqual(cards.map((candidate) => candidate.title), [
    'EVERCLEAR 510',
    'AKENOVA CLEAR 300',
    'Fourth suitable product',
  ]);
});

test('card text ends at a complete sentence when possible', () => {
  const text = 'První úplná věta obsahuje podstatnou informaci. Druhá věta je velmi dlouhá a neměla by být oříznuta uprostřed slova bez označení.';
  assert.equal(truncateAtSentence(text, 80), 'První úplná věta obsahuje podstatnou informaci.');
});

test('a new material does not inherit location or material from an older request', () => {
  const context = resolveProductQuestionContext('Potřebuji lepidlo na dřevo.', [
    { role: 'user', content: 'Potřebuji lepidlo na keramiku.' },
    { role: 'assistant', content: 'Bude použití v interiéru, nebo v exteriéru?' },
    { role: 'user', content: 'Potřebuji lepidlo na dřevo.' },
  ]);

  assert.equal(context.question, 'Potřebuji lepidlo na dřevo.');
  assert.equal(context.hasMaterial, true);
  assert.equal(context.hasLocation, false);
  assert.deepEqual(context.relevantHistory, []);
});

test('valid immediate clarification inherits only the previous user material', () => {
  const context = resolveProductQuestionContext('Bude venku, na dešti a v mrazu.', [
    { role: 'user', content: 'Potřebuji lepidlo na keramický stůl.' },
    { role: 'assistant', content: 'Bude použití v interiéru, nebo v exteriéru?' },
    { role: 'user', content: 'Bude venku, na dešti a v mrazu.' },
  ]);

  assert.equal(context.question, 'Potřebuji lepidlo na keramický stůl.\nBude venku, na dešti a v mrazu.');
  assert.deepEqual(context.relevantHistory.map((turn) => turn.role), ['user']);
});

test('valid Czech and English clarification variants inherit material', () => {
  for (const [previous, assistant, current] of [
    ['Potřebuji lepidlo na keramiku.', 'Bude použití v interiéru, nebo v exteriéru?', 'Teď bude stůl venku.'],
    ['Potřebuji lepidlo na keramiku.', 'Bude použití v interiéru, nebo v exteriéru?', 'Jinak bude venku.'],
    ['Potřebuji lepidlo na keramiku.', 'Bude použití v interiéru, nebo v exteriéru?', 'Nyní bude vystaven dešti.'],
    ['I need an adhesive for ceramic.', 'Will it be used indoors or outdoors?', 'It will be outdoors and exposed to rain.'],
  ]) {
    const context = resolveProductQuestionContext(current, [
      { role: 'user', content: previous },
      { role: 'assistant', content: assistant },
      { role: 'user', content: current },
    ]);
    assert.equal(context.hasMaterial, true, current);
    assert.equal(context.relevantHistory.length, 1, current);
  }
});

test('invalid English assistant text does not activate material inheritance', () => {
  const current = 'It will be outdoors.';
  const context = resolveProductQuestionContext(current, [
    { role: 'user', content: 'I need an adhesive for ceramic.' },
    { role: 'assistant', content: 'Is this for inside or outside?' },
    { role: 'user', content: current },
  ]);
  assert.equal(context.hasMaterial, false);
  assert.deepEqual(context.relevantHistory, []);
});

test('location-only text does not inherit after a completed recommendation', () => {
  const completedConversation = [
    { role: 'user' as const, content: 'Potřebuji lepidlo na keramický stůl.' },
    { role: 'assistant' as const, content: 'Doporučuji EVERCLEAR 510.' },
  ];
  const question = 'Bude nový projekt venku?';
  const context = resolveProductQuestionContext(question, [...completedConversation, { role: 'user', content: question }]);
  assert.equal(context.question, question);
  assert.equal(context.hasMaterial, false);
  assert.deepEqual(context.relevantHistory, []);
});

test('different or new request wording blocks inheritance even after a missing-location clarification', () => {
  const clarificationSequence = [
    { role: 'user' as const, content: 'Potřebuji lepidlo na keramický stůl.' },
    { role: 'assistant' as const, content: 'Bude použití v interiéru, nebo v exteriéru?' },
  ];
  for (const question of ['Potřebuji něco jiného venku.', 'Teď hledám jiný produkt venku.']) {
    const context = resolveProductQuestionContext(question, [...clarificationSequence, { role: 'user', content: question }]);
    assert.equal(context.question, question);
    assert.equal(context.hasMaterial, false);
    assert.deepEqual(context.relevantHistory, []);
  }
});

test('material more than one user turn back is not inherited', () => {
  const question = 'Bude venku a na dešti.';
  const context = resolveProductQuestionContext(question, [
    { role: 'user', content: 'Potřebuji lepidlo na keramiku.' },
    { role: 'assistant', content: 'Bude použití v interiéru, nebo v exteriéru?' },
    { role: 'user', content: 'Ještě si to rozmyslím.' },
    { role: 'assistant', content: 'Dobře.' },
    { role: 'user', content: question },
  ]);

  assert.equal(context.question, question);
  assert.equal(context.hasMaterial, false);
  assert.deepEqual(context.relevantHistory, []);
});

test('Czech and English indoor and outdoor variants are recognized without history', () => {
  for (const question of [
    'Keramika v interiéru.',
    'Keramika v interieru.',
    'Keramika interier.',
    'Keramika interieru.',
    'Keramika uvnitř.',
    'Keramika uvnitr.',
    'Keramika v exteriéru.',
    'Keramika v exterieru.',
    'Keramika exterier.',
    'Keramika exterieru.',
    'Keramika venku.',
    'Venkovní keramika.',
    'Ceramic indoors.',
    'Ceramic indoor.',
    'Ceramic outdoors.',
    'Ceramic outdoor.',
  ]) {
    const context = resolveProductQuestionContext(question);
    assert.equal(context.hasMaterial, true, question);
    assert.equal(context.hasLocation, true, question);
  }
});

test('an unrecognized short location answer does not discard pending material context', () => {
  const current = 'Nejsem si jistý.';
  const context = resolveProductQuestionContext(current, [
    { role: 'user', content: 'drevo' },
    { role: 'assistant', content: 'Bude použití v interiéru, nebo v exteriéru?' },
    { role: 'user', content: current },
  ]);
  assert.equal(context.hasMaterial, true);
  assert.equal(context.hasLocation, false);
  assert.match(context.question, /drevo/u);
});

test('a new explicit material replaces pending material in the clarification chain', () => {
  const context = resolveProductQuestionContext('kov', [
    { role: 'user', content: 'drevo' },
    { role: 'assistant', content: 'Bude použití v interiéru, nebo v exteriéru?' },
    { role: 'user', content: 'kov' },
  ]);
  assert.equal(context.question, 'kov');
  assert.equal(context.hasMaterial, true);
  assert.doesNotMatch(context.question, /drevo/u);
});

test('a recognized unrelated request clears the pending material chain', () => {
  const context = resolveProductQuestionContext('Jaký je stav objednávky?', [
    { role: 'user', content: 'drevo' },
    { role: 'assistant', content: 'Bude použití v interiéru, nebo v exteriéru?' },
    { role: 'user', content: 'Jaký je stav objednávky?' },
  ]);
  assert.equal(context.question, 'Jaký je stav objednávky?');
  assert.equal(context.hasMaterial, false);
  assert.deepEqual(context.relevantHistory, []);
});

test('venkovský style does not create outdoor context', () => {
  const context = resolveProductQuestionContext('Keramický stůl ve venkovském stylu.');
  assert.equal(context.hasMaterial, true);
  assert.equal(context.hasLocation, false);
});

test('information need verbs alone are not product-selection intent', () => {
  for (const question of [
    'Potřebuji bezpečnostní list k produktu.',
    'Potřebuji technický list.',
    'Potřebuji informace o vytvrzení produktu.',
    'I need curing information about this product.',
    'I need the safety data sheet.',
  ]) assert.equal(isProductSelectionRequest(question), false, question);
  assert.equal(isProductSelectionRequest('Potřebuji lepidlo na keramický stůl.'), true);
  assert.equal(isProductSelectionRequest('Which adhesive is suitable for ceramic outdoors?'), true);
});

test('unique product references accept full and conservative shortened titles only', () => {
  const products = [
    product('Colour Bond P+ 6min'),
    product('AKENOVA ELASTIC 100'),
    product('AKENOVA ROCKET 200'),
  ];
  assert.equal(findUniqueProductReference('Mohu použít Colour Bond P+ 6min?', products)?.title, 'Colour Bond P+ 6min');
  assert.equal(findUniqueProductReference('Mohu použít Colour Bond P+?', products)?.title, 'Colour Bond P+ 6min');
  assert.equal(findUniqueProductReference('Mohu použít AKENOVA?', products), undefined);
  assert.equal(findUniqueProductReference('Potřebuji lepidlo.', products), undefined);
  assert.equal(findUniqueProductReference('Je vhodný produkt?', products), undefined);
});
