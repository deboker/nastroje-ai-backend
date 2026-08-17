# CB-MT-001 — strata materiálu vo viac-správovej konverzácii

- **Test ID:** CB-MT-001
- **Dátum:** 2026-08-17
- **Jazyk a stránka:** čeština, CZ web
- **URL stránky:** neuvedená v manuálnom reporte
- **Celá postupnosť správ:**
  1. Používateľ: „Dobrý den, potřebuji lepidlo na keramický stůl.“
  2. Asistent predčasne odporučil `Colour Bond P+ 6min`.
  3. Používateľ: „Bude venku, na dešti a v zimě také v mrazu.“
  4. Asistent odporučil `AKENOVA® ELASTIC 100`, `AKENOVA® ROCKET 200` a `Akepox 5010` a znovu sa opýtal na materiál.
- **Skutočná odpoveď:** Prvá odpoveď obsahovala konkrétny produkt bez známeho interiéru/exteriéru. Druhá odpoveď filtrovala iba podľa exteriéru, dažďa a mrazu, stratila keramiku a znovu si ju vyžiadala.
- **Zobrazené produktové karty:** Manuálny report potvrdzuje odporúčané produkty; presný zoznam zobrazených kariet nebol dodaný.
- **Zobrazené zdroje/odkazy:** Neuvedené.
- **Provider alebo debug suffix:** Neuvedený.
- **Očakávané správanie:** Po prvej správe sa nesmie odporučiť produkt ani karta; aktuálna všeobecná odpoveď je „Bude použití v interiéru, nebo v exteriéru?“. Druhá správa musí zachovať keramiku, vyhľadávať a filtrovať podľa keramiky aj exteriéru a odporučiť iba produkt s oboma explicitnými potvrdeniami. Ak taký produkt nie je, nesmie odporučiť žiadny. Nesmie sa znovu pýtať na keramiku.
- **Čo je nesprávne:** Predčasné odporúčanie, retrieval iba z aktuálnej správy, strata relevantnej histórie, neúplné constraints, nekompatibilné odporúčania a opakovaná otázka.
- **Závažnosť:** high
- **Dotknutá vrstva:** `ChatService`, retrieval query, `ColourbondProductProvider`, product grounding, Groq messages
- **Reprodukčný automatický test:** `tests/colourbond-product-provider.test.ts` — CB-MT-001 testy prvej a druhej správy; ChatService retrieval-query test.
- **Implementovaná oprava:** Bezprostredný používateľský turn s materiálom sa pripojí iba k location/exposure follow-upu bez vlastného materiálu. Tento krátky kontext sa používa v retrieval query, groundingu a Groq správach. Neúplný prvý turn vráti iba doplňujúcu otázku bez kariet.
- **Spustené kontroly:** Pred opravou `npm test` potvrdil FAIL prvého turnu, follow-up groundingu, retrieval query a Groq kontextu. Po oprave: `npm test`, `npm run typecheck`, `npm run build`.
- **Výsledok po oprave:** PASS — automatické CB-MT-001 scenáre prešli; manuálne opakovanie na nasadenom webe nebolo súčasťou tejto úlohy.

## Accepted review findings and correction

Následný code review našiel tri medzery: Groq guard povoľoval názov rejected produktu, location-only správa mohla prevziať materiál bez dostatočnej hranice medzi témami a material/location gate zachytával aj priame usage otázky. Oprava preto:

- kontroluje Groq text proti rejected produktom aj bez Markdown formátovania a pri ich výskyte použije deterministic fallback iba s eligible produktmi;
- pri explicitnej otázke na rejected produkt obíde Groq a použije deterministic constraint odpoveď bez kariet a zdrojov;
- dedí materiál iba v bezprostrednej sekvencii: product-selection používateľská správa s materiálom bez location → presná deterministic missing-location odpoveď asistenta → krátka location/exposure odpoveď používateľa bez nového materiálu, produktu alebo novej požiadavky;
- aplikuje required-information gate iba na product selection, recommendation a suitability/compatibility intent, nie na greeting, identity, contact, complaint/return, order/shipping alebo priamu usage otázku;
- rozpoznáva reprezentatívne české a anglické location varianty vrátane `interiér`, `uvnitř`, `exteriér`, `venku`, `venkovní`, `indoor` a `outdoor`;
- pri missing material/location vracia prázdne produkty a zdroje bez volania Groq aj v teste s nastaveným API kľúčom.

Po accepted-review oprave je výsledok automatických CB-MT-001 testov **PASS**. Starý problém rozlíšenia všeobecnej dopravy od stavu objednávky zostáva zámerne mimo tejto opravy.

## Final deterministic recommendation boundary

Finálna oprava odstraňuje Groq z product-selection, recommendation a suitability/compatibility odpovedí. Pre tieto intenty backend vykoná retrieval a material/location grounding, zoradí najviac tri eligible produkty a vytvorí český alebo anglický text, karty aj zdroje deterministicky z rovnakých `ProductCard` objektov v rovnakom poradí. Groq preto nemôže vložiť rejected ani vymyslený názov produktu do odporúčania.

Priamo uvedený produkt sa páruje s retrieved katalógom konzervatívne. Celý normalizovaný titul sa prijíma vždy. Skrátený prefix sa prijme iba vtedy, keď obsahuje negenerický rozlišovací alebo modelový token a jednoznačne identifikuje práve jeden retrieved produkt; `+` a čísla sa pri normalizácii zachovávajú. Ambiguous alebo čisto generické označenie sa nepáruje. Unikátne spárovaný rejected produkt dostane deterministic constraint odpoveď bez Groq, kariet a suitability zdrojov.

Groq zostáva dostupný iba pre non-selection otázky, napríklad priame použitie pomenovaného produktu alebo všeobecné katalógové/technické informácie. Samostatné slová `potřebuji` a `need` už selection intent nevytvárajú; musia byť spojené s produktovou kategóriou/aplikáciou alebo musí otázka výslovne žiadať výber, odporúčanie či kompatibilitu.

Outdoor detekcia rozlišuje `venku` a tvary `venkovní` od spojenia `venkovský styl`. Follow-up stav naďalej vyžaduje presnú českú alebo anglickú deterministic clarification odpoveď a bezprostredné susedné turny. Platné formulácie `Teď bude stůl venku`, `Jinak bude venku`, `Nyní bude vystaven dešti` a anglický ekvivalent sa zachovávajú; explicitná nová alebo odlišná produktová požiadavka kontext nezdedí.

## Fail-closed product routing and safe reasons

Groq je opt-in a smie sa volať iba pre explicitne rozpoznaný katalógový information/usage intent: použitie alebo aplikácia produktu, bezpečnostný či technický list, technické informácie, vytvrdzovanie, handling alebo dobu spracovania. Neznáma produktová formulácia nikdy neprepadne do Groq odporúčania. Ak obsahuje materiál a umiestnenie, spracuje sa ako deterministic selection; pri chýbajúcom povinnom údaji sa položí príslušná deterministic otázka; neurčitá otázka bez bezpečne rozpoznateľného cieľa si vyžiada upresnenie, či používateľ chce výber alebo informácie o konkrétnom produkte.

Deterministic selection už nekopíruje raw katalógový popis do textu ani do dôvodu produktovej karty. Pre každý eligible produkt vytvorí rovnaký bezpečný český alebo anglický dôvod iba z constraint labelov, ktoré aplikačný grounding explicitne overil, napríklad kompatibilitu s keramikou/gresom a potvrdené použitie v exteriéri. Tým sa zabraňuje úniku názvu rejected alebo nevybraného produktu z voľného katalógového textu. Deterministic vetvy používajú pravdivé `deterministic:*` provider labely; iba skutočné Groq cesty si ponechávajú `groq:*` label.

Indoor location už nie je iba povinný údaj pre gate. Grounding vytvára samostatný constraint `explicitly confirmed indoor use`; eligible produkt musí mať v katalógovom texte explicitné potvrdenie `interiér/interiéru`, `vnitřní použití`, `uvnitř`, `indoor/indoors` alebo `interior use`. Outdoor-only produkt ani produkt bez indoor potvrdenia sa pre indoor požiadavku nepovažuje za kompatibilný. Produkt s explicitným indoor aj outdoor potvrdením môže vyhovieť obom samostatným požiadavkám.
