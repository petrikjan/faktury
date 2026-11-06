# Průběžné předání místní verze

Aktuální stav nasazování z 6. 11. 2026 uvádějí STATUS.md a DEPLOYMENT.md; následující text zachycuje implementační předání. Repozitář už existuje a vlastník povolil nasazení. Uživatel odmítl PHP renderer a upřesnil, že pixelová identita není podmínkou; požaduje stejné čitelné rozložení. To řeší dokončený Node/Chromium renderer. Nové úpravy nasazování zatím čekají na commit a uživatelův push.

## Skutečně spuštěno

- Node 24.22.2 / npm 11.9.0 / MariaDB 11.4.13, nové DDL a syntetická data. API/frontend místně spuštěny a otevřeny v náhledu.
- Typecheck, ESLint, Vitest (**36 testů**), šest Python testů deploye a produkční build. Vše prošlo také při instalaci z nové čisté kopie bez legacy, .private, .env a hotových buildů: npm ci → check → pět E2E scénářů. Ověřeno s připnutým Node 24.22.2 a produkčním React buildem.
- Pět Playwright scénářů: login/logout, URL kvartál a návrat z detailu, ruční desetinná položka, nový kontakt bez ztráty formuláře, ochrana rozepsané práce, vystavení skutečného Node PDF, chráněný náhled a stažení, úhrada bez změny PDF a šířky 360/390/768/1280. Bez vodorovného posuvu celé stránky. Desktop i mobil vizuálně prohlédnuty.
- Reálný dump: vlastníkem výslovně povolený lokální import 6. 11. 2026. DDL preflight, dry-run, nový cíl, zachování současné práce i závěrečné verify prošly; záznamy ani PDF se modelu nezobrazovaly. Původní databáze zůstala zachovaná a má offline zálohu. Některá původní PDF chybějí již ve zdroji a jsou evidována v soukromém reportu. Aktuální změny prošly 58 aplikačními testy, typecheckem, lintem a buildem.
- Syntetické migrace včetně skutečné zdrojové MariaDB se stejným DDL, opakování a obnovení po přerušení, detekce konfliktu, všech známých FK, BIGINT, FLOAT rozdílů, NULL a kódování. Privátní původní PDF je bitově zachováno a jeho změnu validátor detekuje.
- Offline záloha a obnova nové syntetické DB do nového prázdného cíle, porovnání **všech řádků** všech tabulek, včetně vystavené syntetické faktury, její položky a bitového porovnání skutečného syntetického PDF. Nešlo o produkční obnovu.
- MCP SDK a HTTP testy, JWT podpis/issuer/audience/expirace, revokace, neznámé nástroje/argumenty a syntetické canary. Žádná obchodní data nejsou dostupná.
- npm audit produkčních i všech závislostí: 0 hlášených zranitelností v posledním běhu. Kandidáti pro Git prošli skenem známých vzorů tajných hodnot; sken nenahrazuje finální lidskou kontrolu souborů.

## Poslední úpravy rozhraní a dat

Barvy podle loga StudioPlesná, opravené odsazení šipek, pouze CZK, karty a sloupce bez DPH / DPH / celkem. Kvartální skupiny podle částky s DPH pod 10 000 Kč a od 10 000 Kč včetně sdílejí URL filtry a souhrny celého výsledku. Dosavadní vystavené faktury jsou zaplacené, při vystavení se nyní nastavuje zaplaceno automaticky. Vlastník schválil doplnění chybějící DPH základní sazbou podle DUZP; dopočet je oddělený od původních dat a má audit. Lokální ověření i 45 testů a pět E2E scénářů prošly. Soukromé zálohy a pravidla jsou v MIGRATION.md.

## Úpravy a mazání všech obchodních záznamů

Vlastník výslovně rozšířil zadání na úpravy a mazání faktur, kontaktů, ceníku, bankovních účtů i dodavatele. V seznamu a detailu jsou viditelné akce. Mazání má dvě samostatná potvrzení: první vydá pětiminutový náhodný token, druhé jej spotřebuje při transakci. Token je v DB jen jako hash, vázaný na uživatele, typ, ID a verzi. Stará verze, jiný záznam, vypršení či opakování se odmítnou. Smazané záznamy se vyloučí z nabídek, seznamů, souhrnů a aktuálních PDF; čísla smazaných faktur se podle následného zadání vlastníka uvolní a použijí přednostně ve stejném roce. Historie zůstává soukromě zachovaná.

Vystavenou i stornovanou fakturu lze výslovně upravit a uložit jako další verzi, včetně čísla, dat, odběratele, účtu a položek. Předchozí stav, sazby/dopočty i metadata PDF se uloží do record_history, staré soubory se nepřepisují. Aktuální PDF se vytvoří znovu; původní lze stáhnout z chráněné historie v detailu. Při chybě PDF nebo konfliktu verze/čísla se transakce vrátí. Samotné změny kontaktu, účtu a dodavatele nadále nemění již uložené faktury automaticky.

Před rozšířením schématu byla pořízena soukromá offline záloha v `.private/backups/before-record-edit-delete-20261106`. Implementace ani testy nemažou vlastníkovy obchodní záznamy. Testuje se výhradně ve vyhrazených syntetických DB. Poslední kontrola: 58 aplikačních testů a sedm E2E scénářů; pokrývají oba kroky, zrušení, smazání navázaného kontaktu/účtu, vyřazení ze součtů, jedinečné přidělení aktivních čísel a opětovné použití uvolněných čísel, revizi PDF a bitově zachovaný historický soubor.

## PDF důkaz

Běžná faktura nyní má **jednu stránku bez prázdného pokračování** a zachovává čitelné původní členění, originální logo, lokální fonty, sedm sloupců, platební údaje, QR, souhrn a patičku. Drobné metrické a QR maticové rozdíly jsou zdokumentované, pixelová identita se neslibuje.

Prošlo **11 syntetických případů / 30 stran**: koncový zákazník, oba účty a stavy KS, diakritika, dlouhá adresa, desetinné množství/ceny, nulová sazba, 60 položek a popis delší než stránka včetně dlouhého slova. Z hotového PDF se porovnává **celý popis každé položky**, ověřuje počet neprázdných stran a dekóduje QR poslední strany. Všechny strany byly vyrastrované a vizuálně prohlédnuté; rozdělené popisy mají označení pokračování a neopakují účtované částky.

Podmínky testu a výsledky uvádí [PDF.md](PDF.md). Ukázka je v `.private/review/faktura-ukazka.pdf`, více stran v `.private/review/faktura-vice-stran.pdf`. Pevné soukromé texty byly v referenci rovnoměrně nahrazeny syntetickými; jejich lokální přenos do soukromého nastavení proběhl při povoleném importu, bez spuštění PHP a bez vložení textů do veřejného zdrojového kódu.

## Co zůstává mimo ověření

- Konečné vizuální schválení vlastníkem jako součást převzetí místní verze. Směr rendereru už je podle upřesnění Node a matice prošla.
- Historické neznámé DPH, datum úhrad a ve zdroji nedostupná PDF; z aktuálních nastavení se nedoplňují.
- Dostupnost stejné DB/runtime a ověření triggeru/restartu/TLS/proxy v konkrétním aaPanelu.
- Konkrétní OAuth IdP/PKCE/redirect a přímé připojení z konkrétního mobilního ChatGPT.

Repozitář petrikjan/faktury má main a uživatelem vytvořený init commit. Žádné soubory nebyly přidány slepým `git add .`. Konkrétní seznam kandidátů je v INIT-COMMIT-FILES.md. Aktuální seznam i testy a známé vzory tajných hodnot jsou zkontrolované. Push provede uživatel. Produkční deploy a přepnutí domény už byly výslovně povoleny. Lokální import už schválený a dokončený je.

PDF bez uložené přílohy se při prvním náhledu nebo stažení lokálně vytvoří z uložených údajů a potvrzené DPH. Kopie je označená jako reconstructed, má audit a další požadavky použijí stejný soubor. Částky, položky a snímek se nemění. Název stažení je číslo faktury s příponou .pdf, také u historické verze podle jejího tehdejšího čísla. Ověřeno 58 aplikačními testy, osmi E2E scénáři a jedním skutečným místním vytvořením bez zobrazování obsahu modelu.
