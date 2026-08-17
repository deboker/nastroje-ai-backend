# CB-RETRIEVAL-001 — rozdiel retrieval výsledkov medzi jedným a dvoma turnami

- **Stav:** OPEN — samostatná diagnostická úloha
- **Pozorovanie:** Kompletná jednosprávová požiadavka obsahujúca keramiku aj exteriér retrieved produkt `EVERCLEAR 510`.
- **Nekonzistentné správanie:** Ekvivalentná dvoj-správová konverzácia, v ktorej prvý turn obsahoval keramiku a druhý exteriér, dážď a mráz, v živom prostredí nevrátila žiadny eligible produkt.
- **Dopad:** Context resolver a grounding môžu korektne zachovať keramiku, ale provider nemôže odporučiť produkt, ktorý retrieval v danom turne nevráti.
- **Rozsah tohto hotfixu:** Bez opravy retrieval rankingu, query embeddingu, synchronizovaných dát alebo Supabase. Urgentný hotfix rieši iba bezpečný deterministic routing, usage odpovede a quick-action context.
- **Ďalší krok:** Samostatne porovnať normalizované retrieval query, chunk ranking a retrieved fixture/produkčné výsledky pre jednosprávový a dvoj-správový variant bez oslabenia material/outdoor constraints.
