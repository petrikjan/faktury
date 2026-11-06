# Nasazení přes aaPanel Git Manager

Uživatel 6. 11. 2026 schválil nahrazení původní PHP fakturace a nasazování po pushi do `main`, stejně jako u Maxnera. Repozitář `https://github.com/petrikjan/faktury.git` existuje; místní a vzdálený `main` byly ověřeny na `675818933a1c0f3ea948c8f1df06fb2deababab8`. Přes přihlášený aaPanel je vytvořený oddělený Node projekt, veřejný checkout a nová prázdná databáze. Původní PHP, jeho data a veřejná doména zatím zůstávají aktivní. Dostupné místní SSH klíče server nepřijal; správa pokračuje přes aaPanel.

## Co bylo ověřeno

Referenční `/Users/janpetrik/Node/Maxner.cz/scripts/aapanel-deploy.py` používá `projectModel.nodejsModel.main`, `restart_project`/`start_project`, kontrolu důvěryhodného původu modulu, Flask request context, zámek a readiness DB/SHA. Aktuální `docs/AUTOMATICKE-NASAZENI.md` a `docs/NASAZENI.md` Maxnera dokládají aaPanel Git Manager → push na main → chráněný helper → build → restart → readiness. GitHub Actions nejsou pro tento postup potřeba. Cesty, projekt, porty, klíče a DB Faktur se ověří samostatně; Maxner se nemění.

[Oficiální aaPanel API dokumentace](https://www.aapanel.com/docs/api/api-list.html) popisuje API a zjištění parametrů v panelu; není úplnou smlouvou každé verze Node manageru. Zdroj nativního Node manageru konkrétního panelu byl přečten a rozhraní odpovídá adaptéru. Skutečný restart a readiness se musí ověřit po dokončení prvního sestavení. Není nutný SSH přístup: soubory a jednorázové příkazy se řeší přes aaPanel File Manager a Git Manager. Jediná úvodní čtecí inventura proběhla dočasnou úlohou, která je zastavená; nasazování cron nepotřebuje.

## Podmínky prvního nasazení

1. Po schválení commitu a uživatelově pushi ověřit v aaPanelu Node **26.13.0**, MariaDB **12.3.2**, Node project manager, neprivilegovaného uživatele, TLS, reverse proxy a možnost ověřeného webhooku. Skutečná verze databázového serveru byla ověřena připojením. Nové verze prošly integračními testy a E2E v odděleném místním prostředí; původní datadir 11.4.13 zůstává nedotčený.
2. Vyhradit nové cesty a lokální port. Zdrojové release adresáře jsou neměnné; `.env`, PDF, privátní archivy, DB a zálohy jsou ve sdíleném adresáři mimo release a public/static. Práva souborů 0600, adresářů 0700.
3. V `.env` na serveru nastavit silné DB přístupy, `NODE_ENV=production`, `APP_ORIGIN=https://faktury.janpetrik.cz`, `HOST=127.0.0.1`, skutečný lokální PORT, `TRUST_PROXY=loopback`, absolutní STORAGE_DIR, přesné DEPLOY_SHA. Žádný secret do repozitáře ani argumentů procesu. MCP výchozí false. PDF_REVIEW_APPROVED=true až po skutečném vizuálním schválení dokončeného rendereru.
4. Nginx/Apache proxy pouze na loopback, HTTPS, zachovat Host, X-Forwarded-Proto a bezpečné hlavičky. Žádné zpřístupnění .env/DB/storage/legacy. Pro MCP po samostatné konfiguraci vypnout buffering, nastavit vhodný timeout a ověřit Streamable HTTP.
5. Použít novou DB a účet jen pro ni. Převést aktuální místní Node databázi a úložiště z konzistentní offline kopie, včetně účtu správce a dosavadních úprav. Neopakovat import původního PHP přes současnou práci. Start produkce nikdy nespouští seed ani legacy import.
6. PDF používá schválený směr Node/Chromium s čitelným původním rozložením; pixelová identita není požadována. V konkrétním aaPanelu ověřit dostupný Chrome/Chromium, knihovny a matici; PHP není runtime závislost. Soukromě převést pevné firemní texty hlavičky/patičky a zkontrolovat oprávnění k logu. Natvrdo zapsaný Basic-auth údaj ze starého Bbs_pdf.php vyměnit a zneplatnit; hodnotu nikam nekopírovat.

## Vybraný postup: Git Manager → main → chráněný helper

1. Git Manager sleduje pouze `petrikjan/faktury`, větev `main`, se samostatným přístupem pouze ke čtení. Webhook GitHubu používá HTTPS s ověřením certifikátu a neveřejný klíč. Jeho celá URL ani klíč nepatří do Gitu či konverzace.
2. Serverový skript Git Manageru vyvolá pevný příkaz chráněné kopie helperu, například `/www/server/panel/pyenv/bin/python3 /usr/local/libexec/faktury-aapanel-deploy.py --config /OVĚŘENÁ/PRIVÁTNÍ/CESTA/deploy.json --main`. Skutečné cesty a projekt musí před instalací odpovídat cílovému panelu. Helper se nespouští jako root přímo z měnitelného checkoutu.
3. `scripts/aapanel-deploy.py` uzamkne nasazení, ověří konkrétní Node 26.13.0 a npm 11.9.0, přesný repozitář a vzdálený `main`. Git a instalace/sestavení běží pod neprivilegovaným uživatelem. Zdrojový archiv exportuje do nového odděleného release, takže změna checkoutu během sestavení nemění nasazovaný SHA.
4. Provede `npm ci --include=dev`, `npm run check` a `npm run test:e2e` s výhradně syntetickými oddělenými DB. Produkční `.env` v této fázi není připojený. Privátní JSON s testovacími URL musí mít jen povolené klíče; všechny cíle končí `_test` a jsou různé. Potřebná schémata a oprávnění jsou uvedena v README.
5. Teprve po kontrolách připojí produkční `.env` ze sdíleného adresáře a spustí **pouze čtecí** `npm run db:check`. Neshodný počet, název či otisk aplikovaných migrací nasazení zastaví před přepnutím. Automatický deploy neprovádí DDL, seed, import ani obnovu DB.
6. Atomicky přepne `current`, restartuje pouze ověřený Node projekt Faktur a zkontroluje DB i SHA na `/health/ready`. Při neúspěchu přepne předchozí release kódu a restartuje jej. DB ani soubory faktur se automaticky nevracejí.

Konfigurace vychází z `docs/deploy-config.example.json`. `mirror` označuje ověřený Git Manager checkout (běžný nebare repozitář s `origin/main`), nikoli adresář PHP aplikace. Konfigurace i chráněná kopie helperu patří rootovi bez práva zápisu skupiny/ostatních; produkční `.env` musí být pro proces aplikace čitelný, ale nesmí být měnitelný kódem. `panel_verified` se nastaví až po kontrole konkrétního projektu, uživatele, cest, portu, runtime a nativního restartu. Push sám nemění chráněný helper. Aktualizace helperu se instaluje samostatně po kontrole otisku a se zálohou předchozí verze.

Při změně schématu je nutná předem ověřená konzistentní záloha a plán kompatibility; migrace se provedou samostatně při zastavených zápisech. Pak lze nasazení zopakovat. Po neúspěšné přípravě zůstane soukromý adresář `.building-*` pro diagnostiku. Neúspěch po aktivaci může ponechat neaktivní release stejného SHA; před opakováním se musí zkontrolovat, nikoli automaticky přepsat.

`scripts/deploy-webhook.py` zůstává volitelná, izolovaně testovaná alternativa s podepsanou frontou; pro požadovaný postup přes stávající Git Manager není potřeba instalovat další listener ani cron fronty. Příslušná pole `queue_file` se při `--main` nepoužívají.

## Čtecí inventura před prvním nasazením

`scripts/server-preflight.py` pouze přečte verze dostupných runtime, cestu a základní provozní nastavení projektů Faktury/Maxner, přítomnost Apache a prohlížeče. Nečte hesla, databázové záznamy ani obsah faktur a nic na serveru nenastavuje. Po přenosu do privátního adresáře serveru jej lze spustit přes `sudo python3 /OVĚŘENÁ/CESTA/server-preflight.py`. Samotná verze DB klienta není důkazem verze běžícího databázového serveru; tu je třeba ještě ověřit soukromým připojením.

## Záloha a vyzkoušená obnova

`npm run backup -- create /absolutni/privatni/cesta --offline-confirm` vytvoří snapshot nové DB a bitové kopie privátního úložiště s manifestem SHA-256. Aplikace musí být ve chvíli zálohy zastavená, aby DB a soubory tvořily jeden konzistentní celek. Přístup CLI je v dočasném souboru 0600, ne na příkazovém řádku. Další kopie mimo release a mimo samotný server, šifrované úložiště a pravidelná zkouška obnovy. Produkční credentials a případné šifrovací klíče zálohovat odděleně zabezpečeným postupem.

Obnova je povolena pouze do nové prázdné `_restore_test` databáze a prázdného úložiště. `npm run backup -- restore /cesta/k/zaloze --offline-confirm`, s lokálně nastaveným DATABASE_URL/STORAGE_DIR. Ověřit po řádcích data, vazby i soubory, ne pouze úspěšný návrat CLI. Skutečnou obnovu produkce provést jako samostatně schválený incidentní krok; skript ji úmyslně neprovádí.

## Finální přepnutí a rollback

Krátce zastavit zápisy starého systému, poslední privátní záloha zdrojů a soukromé porovnání s importovaným baseline. Případné nové záznamy starého systému vyžadují cílené sloučení; aktuální práci Node nepřepisovat. Převod Node databáze ověřit po všech řádcích a úložiště po všech souborech. Teprve pak přepnout doménu a zkontrolovat login, filtr, detail a chráněné PDF. Nenechat oba systémy současně vystavovat do stejné řady.

Rollback aplikace přepne symlink na předchozí kompatibilní release a restartuje nativně aaPanel. DB se automaticky nevrací: nesmějí se ztratit nově vystavené doklady. Každá migrace má mít dopředu plán kompatibility; destruktivní SQL reset není součástí deploye. Částečně aplikovanou DDL migraci řešit forward opravou, protože MySQL/MariaDB DDL má implicitní commity.

## Konkrétní příprava serveru 6. 11. 2026

- aaPanel 8.0.7, Apache, Node 26.13.0 a MariaDB 12.3.2. Ostatní projekty se nemění.
- Node projekt `faktury`, uživatel `www`, loopback port 3110, automatický start po bootu zapnutý. Checkout `/www/wwwroot/faktury-node/repository/faktury`, běžící kód `/www/wwwroot/faktury-node/current`. Vlastní start je `node /www/wwwroot/faktury-node/current/scripts/start-production.mjs`.
- Git Manager má veřejný repozitář a `main`; automatické nasazování je zatím vypnuté. Produkční webhook se připojí až po ověření první verze.
- Nová databáze `faktury_node` již obsahuje ověřenou kopii současné místní práce, samostatný účet `faktury_node_app`; původní databáze `faktury` se nepřepisuje. Produkční účet má pouze SELECT/INSERT/UPDATE/DELETE ve své databázi.
- Sdílené nastavení, storage a browser cache patří do `/www/wwwroot/faktury-node/shared`, mimo veřejný web i Git. aaPanel požaduje existující `node_modules` v checkoutu i pro absolutní příkaz; prázdný pomocný adresář splní tuto kontrolu, skutečné závislosti jsou v každém release.
- Úvodní online záloha PHP databáze, všech souborů a Apache konfigurace je dokončená v soukromém adresáři root. Export databáze je uložený i místně a po normalizaci číselných reprezentací odpovídá původnímu importnímu baseline ve všech tabulkách. Před přepnutím je stále nutné zastavit zápisy a pořídit závěrečnou zálohu.
- Jednorázový `scripts/aapanel-prepare.py` ověřuje konkrétní server/projekt, zdroj zálohuje a odděleně připravuje prostředí. Hesla čte pouze uvnitř serverového procesu z uloženého nastavení panelu; nikam je nevypisuje. Prohlížeč a npm instaluje jako `www` z oficiálního registru. Knihovny pro PDF smí přidat pouze jako nové balíčky; simulace zastaví upgrade, odstranění či konfiguraci nesouvisejícího softwaru.
- Aktuální místní Node aplikace byla zastavená a má novou offline zálohu před přenosem. Obnova do oddělené místní MariaDB 12.3.2 potvrdila shodu všech řádků a všech souborů. Soukromý přenosový balíček může místo opakovaného přenosu existujících PDF uvést jejich původní serverové cesty a otisky; `scripts/aapanel-transfer.py` je před kopírováním znovu ověří, vytvoří samostatné Node úložiště a odmítne neprázdnou cílovou DB či storage. Po obnově porovná všechny řádky přes neprivilegovaný účet a všechny soubory. Při chybě nic automaticky nemaže ani neresetuje. SQL, mapy a otisky zůstávají soukromé; do Gitu patří jen obecný helper. Přenos na server už proběhl a porovnání všech řádků a souborů prošlo. Při opakování prvního buildu `verify_existing` nejprve pouze čtecím způsobem znovu ověří již přenesená data; import ani reset se neopakuje. Pomocné soubory AppleDouble přidané macOS do tar archivu se přeskočí a nikdy neobnovují.

`aapanel-cutover.py` připraví krátkou údržbu, závěrečnou soukromou zálohu a porovná starou databázi s ověřeným baseline. Teprve při shodě zapojí HTTPS proxy na port 3110, odstraní PHP handler a přesměruje DocumentRoot do prázdného adresáře mimo staré zdroje. Výjimka pro ACME zachová obnovování současného certifikátu. Konfiguraci nejprve ověří Apache a po přepnutí se kontrolují HTTPS, DB/SHA a odmítnutí nepřihlášeného přístupu k fakturám. Chyba před veřejným spuštěním vrátí původní konfiguraci. Chyba po veřejném spuštění ponechá údržbu, aby se souběžně neobnovil druhý nezávislý systém pro vystavování. Databáze se nevrací automaticky.
