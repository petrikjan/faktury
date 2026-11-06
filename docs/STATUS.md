# Provozní stav — 6. 11. 2026

**Nová fakturace je nasazená na https://faktury.janpetrik.cz.** Původní PHP už není veřejné. Účet správce, současná místní práce i dostupná PDF jsou zachované. Skutečné obchodní záznamy, hesla a otisky dat se modelu nezobrazovaly.

## Nasazení

- aaPanel 8.0.7, Apache, Node 26.13.0, npm 11.9.0, MariaDB 12.3.2, neprivilegovaný proces `www`, port 3110 pouze na loopbacku.
- GitHub `petrikjan/faktury`, větev `main` → aaPanel Git Manager → `Faktury_production` → chráněný root helper. Git a sestavení běží jako `www`. Webhook je aktivní pro události push, používá HTTPS s ověřením certifikátu; úvodní ping byl doručen úspěšně. Nasazování nepoužívá cron.
- `npm ci`, 62 aplikačních testů, 17 testů nasazování, typecheck, lint, build a všech 8 E2E scénářů prošly také přímo na serveru. Migrační test rekonstruující 34 syntetických tabulek má kvůli pomalejšímu sdílenému úložišti limit 120 sekund. Lokálně prošla i čistá instalace bez legacy a skutečných dat.
- Produkční `.env`, storage, npm a browser cache jsou mimo release a veřejný web. Kód release je pro aplikaci pouze ke čtení. Start načítá přesné SHA z `.release.env`, nic neseeduje ani neimportuje.
- Každý deploy ověřuje aplikované migrace pouze čtecím příkazem `db:check`. Automaticky neprovádí DDL, import ani obnovu DB. Přepne `current`, nativně restartuje pouze Faktury a ověří DB/SHA; při chybě vrací předchozí kód, nikoli databázi.
- Veřejné HTTPS, přihlašovací stránka, DB/SHA a odmítnutí nepřihlášeného přístupu k seznamu/PDF byly ověřené. Soukromé cesty nevystavují konfiguraci, Git ani storage. ACME výjimka zachovává obnovování původního certifikátu.

Přesný právě běžící commit ukazuje `/health/ready`. Doručení webhooku je oddělené od dokončení sestavení. Provozní postup, diagnostika a rollback jsou v [DEPLOYMENT.md](DEPLOYMENT.md).

## Data a zálohy

Současná místní Node aplikace byla před přenosem zastavená a má úplnou offline zálohu DB a souborů. Obnova do oddělené místní MariaDB 12.3.2 potvrdila shodu všech řádků a všech souborů. Stejné porovnání pak prošlo na serveru v nové databázi `faktury_node`; produkční účet má pouze SELECT/INSERT/UPDATE/DELETE ve svém schématu. Původní místní datadir 11.4.13 zůstal oddělený a nedotčený.

Původní PHP databáze `faktury`, všechny soubory a Apache konfigurace mají úvodní i závěrečnou soukromou serverovou zálohu. Závěrečná vznikla při údržbě bez veřejných PHP požadavků. Porovnání se zdrojovým baseline potvrdilo, že ve staré databázi nepřibyly záznamy k dalšímu sloučení. Původní PHP DB se nepřepisovala; nepoužívá se jako aktivní databáze nové aplikace.

SQL, soubory, mapy přenosu, otisky dat, přístupy a podrobné reporty zůstávají pouze v soukromých adresářích. Git obsahuje jen obecné skripty, nové DDL a syntetické fixtures. Kandidátní soubory prošly kontrolou cest a skenem známých secret vzorů. Push provádí uživatel.

Místní náhled se skutečnými daty zůstává zastavený, aby nevznikly dvě nezávislé řady dokladů. Další vývoj má používat oddělené syntetické databáze.

## Dokončené funkce

- České responzivní rozhraní, barvy StudioPlesná, sjednocená pole a odsazení šipek. CZK, URL filtry, rok/kvartál/měsíc, základ/DPH/celkem a kvartální skupiny pod 10 000 Kč a od 10 000 Kč včetně podle částky s DPH.
- Kontakty, ARES s potvrzením, ceník, ruční položky, návrhy, vystavení, úhrady a audit. Položka ceníku využije prázdný řádek. Změna data vystavení nastaví DUZP a přepočítá splatnost podle počtu dnů; změna DUZP nepřepisuje vystavení.
- Úpravy a mazání faktur, kontaktů, ceníku, účtů i dodavatele. Dvojí potvrzení ověřuje server; předchozí verze a PDF jsou zachované. Smazané faktury se nepočítají do přehledů a čísla se znovu používají v témže roce.
- Nové faktury se podle zadání označují jako zaplacené. U importu je dokončený vlastníkem schválený dopočet chybějící DPH historickou základní sazbou podle DUZP, odděleně od původních polí a s auditem.
- Čistě Node/Chromium PDF, čitelné původní členění, lokální fonty a logo, QR, vícestránkové položky a chráněný náhled/stažení. Název je číslo faktury s příponou `.pdf`. Matice 11 syntetických případů / 30 stran prošla textovou i vizuální kontrolou. Chybějící původní PDF lze rekonstruovat z uloženého snímku a potvrzené DPH; vytvoření má audit a další požadavky použijí stejný soubor.
- Serverové relace, Argon2id, revokace, CSRF, Host/Origin, rate limit, přesné desetinné výpočty, idempotence a souběžné přidělování čísel. Testy používají výhradně oddělená syntetická schémata.

## Zachované hranice

Některá původní PDF už ve zdroji chyběla. Import je označená rekonstrukce; aktuální nastavení nedokládá všechny historické adresy/účty ani datum úhrady. Podrobnosti zdrojů a schválených dopočtů jsou v [MIGRATION.md](MIGRATION.md).

MCP zůstává v produkci vypnuté. Izolované SDK/HTTP testy minimálního nástroje prošly, konkrétní IdP a mobilní účet nejsou propojené. Žádná obchodní data přes MCP nejsou zpřístupněná. Historické implementační podklady jsou v [HANDOVER.md](HANDOVER.md), audit a mapování v [AUDIT.md](AUDIT.md) a [MIGRATION-MAP.md](MIGRATION-MAP.md).
