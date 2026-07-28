import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductCard } from '../src/services/ai-provider.js';
import { partitionProducts, selectMentionedProducts, truncateAtSentence } from '../src/services/product-grounding.js';

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

test('cards include only products named in the answer and are limited to three', () => {
  const products = ['Product Alpha', 'Product Beta', 'Product Gamma', 'Product Delta'].map(product);
  assert.deepEqual(
    selectMentionedProducts('Doporučuji Product Beta a jako alternativu Product Delta.', products).map((candidate) => candidate.title),
    ['Product Beta', 'Product Delta'],
  );
});

test('card text ends at a complete sentence when possible', () => {
  const text = 'První úplná věta obsahuje podstatnou informaci. Druhá věta je velmi dlouhá a neměla by být oříznuta uprostřed slova bez označení.';
  assert.equal(truncateAtSentence(text, 80), 'První úplná věta obsahuje podstatnou informaci.');
});
