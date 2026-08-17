# Repository guidance

## Relevant repository map

- `backend/src/index.ts`: Express composition root; registers site-scoped providers and routes.
- `backend/src/services/ai-provider-registry.ts`: resolves `assistant_profile` and selects the provider for a site.
- `backend/src/services/chat-service.ts`: conversation resolution, message persistence, retrieval call, provider input, and reply persistence.
- `backend/src/services/colourbond-product-provider.ts`: COLOUR BOND intent routing, grounding integration, Groq call/guards, deterministic fallbacks, sources, and product cards.
- `backend/src/services/nastroje-ai-provider.ts`: provider for the Nastroje AI website; keep its behavior isolated from COLOUR BOND work.
- `backend/src/services/product-grounding.ts`: material/outdoor constraints, eligible/rejected partitioning, mentioned-card selection, and card-text truncation.
- `backend/src/services/retrieval-service.ts` and `backend/src/repositories/document-repository.ts`: profile-aware catalogue/site retrieval and product ranking.
- `backend/src/services/sync-service.ts`, `backend/scripts/import-colourbond-products.ts`, and `backend/data/colourbond-products.json`: synchronized content ingestion and the checked-in COLOUR BOND catalogue export.
- `backend/src/repositories/conversation-repository.ts`: conversation and message history storage/read order.
- `backend/src/services/lead-service.ts` and `backend/src/routes/leads.ts`: lead/brief submission and confirmation text.
- `prestashop-widget/colourbond-chatbot.js`: CZ/EN resolution, chat session, rendering, product cards, links, timeout, and retry behavior. `backend/prestashop-widget/` and `prestashop-widget-deploy/` contain deployment copies.
- `prestashop-widget/colourbond-chatbot-proxy.php`: same-origin proxy, server-side token, backend request, URL/card enrichment, and localized product lookup. The other two PrestaShop widget directories contain copies.
- `wp-ai-assistant/`: WordPress Nastroje AI plugin, proxy, chat UI, and lead/brief UI; do not change it as a side effect of COLOUR BOND work.
- `backend/tests/`: backend tests using the built-in Node test runner through `tsx`.
- `docs/colourbond-assistant/`: COLOUR BOND architecture, behavioral rules, test matrix, and report template.

No KryoWien implementation is present in this checkout. Treat KryoWien as another protected provider/site integration if it is added or restored.

## Verified commands

Run backend commands from `backend/`:

- Install: `npm install`
- Build: `npm run build`
- Type-check: `npm run typecheck`
- Tests: `npm test`
- Development server: `npm run dev`
- Production start of an already built backend: `npm start`

Run WordPress asset commands from `wp-ai-assistant/`:

- Install: `npm install`
- Build all assets: `npm run build`
- Build admin only: `npm run build:admin`
- Build widget only: `npm run build:widget`

There is no lint script in either `package.json`, no separate WordPress type-check script, and no checked-in PHP/PrestaShop test command. Do not claim that `npm run lint` exists. For TypeScript backend work, `npm run typecheck` is the authoritative type check; the WordPress TypeScript compiler is exercised by its Vite builds.

## Change rules

- COLOUR BOND assistant changes must not change any other provider or site behavior, especially `NastrojeAiProvider` and KryoWien.
- Do not change the security proxy mechanism, API keys or token handling, URL validation, timeouts, session handling, or retry logic unless the user explicitly requests it.
- Every chatbot-response fix starts with an automated reproduction test that fails for the reported behavior.
- Make the smallest targeted change. Do not include unrelated refactoring, formatting churn, dependency upgrades, generated bundles, archives, or deployment copies unless required by the request.
- Tests must not call the live Groq API or a production shop. Use deterministic fixtures, mocked retrieval chunks, and mocked `fetch` responses.
- Do not deploy without an explicit instruction. Do not commit or push unless explicitly requested.

## Definition of done

A chatbot change is done only when:

1. the regression/reproduction test exists and passes after the fix;
2. relevant backend and/or frontend tests pass;
3. backend type-check passes, plus the relevant build when applicable;
4. lint passes if a lint command is introduced in the future (currently none exists); and
5. the complete diff is reviewed for scope, secrets, generated artifacts, and unintended provider/security changes.
