# COLOUR BOND assistant test matrix

Use mocked retrieval chunks derived from `backend/data/colourbond-products.json`; never call Groq or a production shop. Product names below are confirmed in that fixture: `Colour Bond P+ 6min`, `EVERCLEAR 510`, `PLATINUM Maxi Power`, `Akepox 2040`, `Akepox 5010`, `AKENOVA® CLEAR 300`, `AKENOVA® ELASTIC 100`, and `AKENOVA® ROCKET 200`.

For every case record text, cards, card order, sources, provider suffix, language, and absence of invented facts/internal terms.

| ID | Scenario / messages | Fixture or setup | Expected behavior |
|---|---|---|---|
| CB-001 | Greeting | No retrieval required; CZ and EN | Short localized introduction; no cards. |
| CB-002 | “Kdo jsi?” / “Who are you?” | No retrieval required | Correct identity in site language; no cards. |
| CB-003 | Contact request | No retrieval required | Email/contact-form links; no invented phone number. |
| CB-004 | Complaint and return | No retrieval required | Process/contact guidance only; no invented decision. |
| CB-005 | Status of a specific order with order number | No retrieval required | State that order status is inaccessible; request order number only if absent. |
| CB-006 | General shipping price or method | Approved store-information fixture if available | Answer only supported general shipping facts; do not claim this is an order-status lookup. |
| CB-007 | Product question without material | Relevant product chunks | Ask one or two practical questions; no recommendation/cards. |
| CB-008 | Product question without indoor/outdoor | Relevant product chunks | Ask whether use is indoor or outdoor; no recommendation/cards. |
| CB-009 | Ceramic/gres, with location known | `Colour Bond P+ 6min`, `EVERCLEAR 510` | Recommend only products explicitly confirming both constraints. |
| CB-010 | Natural stone, with location known | Fixture-confirmed stone products | Filter by exact use and location before ranking. |
| CB-011 | Artificial stone, with location known | Fixture-confirmed stone products | Filter by exact use and location before ranking. |
| CB-012 | Marble, with location known | Relevant chunks; include negative ACID cleaner data when cleaning | Never infer marble suitability from generic stone wording; honor explicit exclusions. |
| CB-013 | Granite, with location known | `EVERCLEAR 510`, suitable AKEMI chunks | Recommend only explicitly confirmed use; brand preference follows suitability. |
| CB-014 | Glass, with location known | `EVERCLEAR 510`, `AKENOVA® CLEAR 300` | Require explicit glass and location confirmation. |
| CB-015 | Wood, with location known | `EVERCLEAR 510`, `AKENOVA® CLEAR 300` | Require explicit wood and location confirmation. |
| CB-016 | Metal, with location known | `Akepox 2040`, Akenova fixtures | Require explicit metal and location confirmation. |
| CB-017 | Exterior with rain, frost, and direct sun | Outdoor-confirmed chunks plus indoor-only chunk | Reject missing/indoor-only suitability; do not infer UV or sun resistance. |
| CB-018 | Product explicitly says “interior only” | `PLATINUM Maxi Power` | Exclude from exterior text/cards and preserve the explicit restriction. |
| CB-019 | Ask for `Colour Bond P+ 6min` outdoors | Its fixture lacks outdoor confirmation | Do not recommend/card it; explain that exterior use is not confirmed. |
| CB-020 | Outdoor ceramic table | `EVERCLEAR 510` fixture plus unsuitable chunks | Verify `EVERCLEAR 510` only because fixture explicitly states exterior use for Techno ceramic and frost/thaw resistance; do not broaden beyond those facts. |
| CB-021 | Query retrieves 4+ suitable products | Four mocked chunks | At most one main recommendation plus two alternatives/cards. |
| CB-022 | Model names three products out of order | Mocked Groq response | Reject/replace the response; final text and cards share one order. |
| CB-023 | Model names only one of three eligible products | Mocked Groq response | Exactly one card/source for the named product. |
| CB-024 | Model invents an unknown product | Mocked Groq response | Guarded fallback; invented product absent from text/cards. |
| CB-025 | Model names a rejected retrieved product | Eligible and rejected mocked chunks | Guarded fallback; rejected product absent from recommendation text/cards. |
| CB-026 | Same product request on CZ and EN sites | Same chunks, language `cs`/`en` | Entire response uses only the selected site language. |
| CB-027 | “Potřebuji lepidlo.” → “Na keramiku.” → “Venku v dešti a mrazu.” | Persisted history plus `EVERCLEAR 510` and other chunks | Final turn combines material and exterior constraints from history. |
| CB-028 | Groq returns non-2xx/invalid answer | Mocked `fetch` | Deterministic grounded fallback; no network retry inside provider. |
| CB-029 | Missing `GROQ_API_KEY` | Key unset in isolated test | Deterministic `groq-unavailable` reply from fixtures; no network call. |
| CB-030 | Submit Czech brief | Site language `cs`; mocked repositories | Czech confirmation/summary, never “Captured brief”. |
| CB-031 | Concrete EN product question containing “help” | Relevant chunks | Treat as product question, not generic capability intent. |

## Current automation

- `backend/tests/product-grounding.test.ts` covers fixture-grounded filtering, missing-property rejection, stable eligible order, maximum-three/card mention behavior, rejected-card exclusion, and sentence truncation.
- `backend/tests/colourbond-product-provider.test.ts` covers deterministic missing-key output plus explicit `todo` reproductions for conversation history and the rejected-product guard. These todos document known production gaps without changing production behavior in this task.
- Full `ChatService` history persistence requires repository doubles or dependency interfaces; the provider-level history reproduction is the smallest safe current seam. Browser card rendering and the PrestaShop PHP enrichment have no checked-in test harness; add a DOM/PHP harness only when implementation work requires it, without introducing a framework solely for this matrix.
