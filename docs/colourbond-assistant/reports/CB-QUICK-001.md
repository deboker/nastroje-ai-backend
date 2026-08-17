# CB-QUICK-001 — slučka quick-action konverzácie

- **Stav pred opravou:** FAIL
- **Live postupnosť usage:** `Jak produkt použít` → nesprávna otázka na materiál → `drevo` → otázka na interiér/exteriér → `interieru` → opakovaná otázka na materiál.
- **Live postupnosť selection:** Krátka materiálová odpoveď nebola považovaná za pokračovanie výberu, takže po location odpovedi resolver stratil materiál a vytvoril slučku.
- **Príčina:** Context resolver dedil materiál iba vtedy, keď bezprostredná materiálová správa sama spĺňala celý selection intent. Samotné `drevo` túto podmienku nespĺňalo. Usage quick action zároveň nemal samostatnú deterministic vetvu.
- **Opravené usage správanie:** `Jak produkt použít` vráti iba `Který konkrétní produkt chcete použít? Napište jeho název.` bez kariet, zdrojov a Groq. Bezprostredný jednoznačný názov retrieved produktu vráti iba jeho limited-usage odpoveď, kartu a zdroj.
- **Opravené selection správanie:** `Vybrat vhodný produkt` vyžiada materiál. Krátky materiál sa zachová cez deterministic location otázku `Bude použití v interiéru, nebo v exteriéru?`. Rozpoznaná location odpoveď pokračuje do deterministic groundingu a materiál sa neopakuje.
- **Context hranica:** Dedia sa iba krátke bezprostredné odpovede po presnej shared deterministic location otázke. Explicitná nová požiadavka kontext zastaví. Krátka nerozpoznaná odpoveď pending materiál nezahodí, ale location zostane nevyplnená.
- **Automatické testy:** Produkčný `ChatService` s reálnym `ColourbondProductProvider`, mock retrieval, nastaveným API kľúčom a fetch spy pre usage aj selection sekvencie; CZ varianty `interieru`, `interier`, `v interiéru`, `uvnitř` a EN `indoors`.
- **Výsledok po oprave:** PASS

## Durable pending selection correction

Následný review odhalil, že pôvodná oprava prehľadávala najviac tri používateľské turny. Finálna oprava používa contiguous-chain resolution bez vlastného počítadla turnov. `ChatService` poskytne resolveru pre profil `colourbond_products` celý už existujúci maximálne 60-správový conversation window; ostatné profily zostávajú na pôvodných ôsmich správach. Resolver pokračuje dozadu iba cez presné deterministic missing-location odpovede a krátke nerozpoznané používateľské odpovede. Zastaví sa pri inej assistant odpovedi, známom unrelated intent, novej požiadavke, novej explicitnej materiálovej požiadavke alebo dokončenej selection odpovedi. Retrieval query obsahuje iba pôvodný material user turn a aktuálnu odpoveď, nikdy assistant text.

Produkčný `ChatService` test potvrdzuje zachovanie `drevo` cez päť po sebe idúcich nerozpoznaných odpovedí a následné `interieru` bez návratu k otázke na materiál.
