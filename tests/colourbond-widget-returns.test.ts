import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('the widget offers localized complaint information and withdrawal links', () => {
  const content = readFileSync(fileURLToPath(new URL('../prestashop-widget/colourbond-chatbot.js', import.meta.url)), 'utf8');

  assert.match(content, /\/content\/9-reklamace-a-vraceni-zbozi/u);
  assert.match(content, /\/cz\/module\/abcodstupenie\/form/u);
  assert.match(content, /\/en\/content\/9-complaints-and-returns/u);
  assert.match(content, /\/en\/module\/abcodstupenie\/form/u);
  assert.match(content, /showReturns\(action\[0\]\)/u);
});
