# Budoucí nasazení přes aaPanel

Zatím pouze příprava. Nevznikl vzdálený repozitář, push, webhook, hosting, změna domény ani produkční DB. Init commit až po schválení místního výsledku, push provede uživatel.

## Co bylo ověřeno

Referenční `/Users/janpetrik/Node/Maxner.cz/scripts/aapanel-deploy.py` skutečně používá `projectModel.nodejsModel.main`, `restart_project`/`start_project`, kontrolu důvěryhodného původu modulu, Flask request context, zámek a readiness DB/SHA. V kontrolované kopii není `.github`. Přesný současný push/webhook mechanismus není doložen. Nepřebíráme žádné cesty, jména projektů, runtime, porty, klíče ani DB této aplikace.

[Oficiální aaPanel API dokumentace](https://www.aapanel.com/docs/api/api-list.html) popisuje API a zjištění parametrů v panelu; není úplnou smlouvou každé verze Node manageru. Adaptér níže je lokálně testovaný proti náhradnímu modelu, konkrétní panel se musí teprve ověřit. Není nutný SSH přístup: soubory a jednorázové příkazy se řeší přes aaPanel File Manager / Terminal / Cron, podle dostupných oprávnění.

## Podmínky prvního nasazení

1. Po schválení commitu a uživatelově pushi ověřit v aaPanelu Node 24.22.2, MariaDB **11.4.13**, Node project manager, neprivilegovaného uživatele, TLS, reverse proxy a možnost ověřeného webhooku. Pokud aaPanel neumí stejnou DB, rozhodnutí o změně před migrací, s opakováním všech integračních testů. Nenahrazovat potichu MySQL/MariaDB.
2. Vyhradit nové cesty a lokální port. Zdrojové release adresáře jsou neměnné; `.env`, PDF, privátní archivy, DB a zálohy jsou ve sdíleném adresáři mimo release a public/static. Práva souborů 0600, adresářů 0700.
3. V `.env` na serveru nastavit silné DB přístupy, `NODE_ENV=production`, `APP_ORIGIN=https://faktury.janpetrik.cz`, `HOST=127.0.0.1`, skutečný lokální PORT, `TRUST_PROXY=loopback`, absolutní STORAGE_DIR, přesné DEPLOY_SHA. Žádný secret do repozitáře ani argumentů procesu. MCP výchozí false. PDF_REVIEW_APPROVED=true až po skutečném vizuálním schválení dokončeného rendereru.
4. Nginx/Apache proxy pouze na loopback, HTTPS, zachovat Host, X-Forwarded-Proto a bezpečné hlavičky. Žádné zpřístupnění .env/DB/storage/legacy. Pro MCP po samostatné konfiguraci vypnout buffering, nastavit vhodný timeout a ověřit Streamable HTTP.
5. Vytvořit novou DB, účet jen pro ni, aplikovat pouze nové verzované migrace. Vytvořit prvního správce interaktivním místním příkazem. Start produkce nikdy nespouští seed ani legacy import.
6. PDF používá schválený směr Node/Chromium s čitelným původním rozložením; pixelová identita není požadována. V konkrétním aaPanelu ověřit dostupný Chrome/Chromium, knihovny a matici; PHP není runtime závislost. Soukromě převést pevné firemní texty hlavičky/patičky a zkontrolovat oprávnění k logu. Natvrdo zapsaný Basic-auth údaj ze starého Bbs_pdf.php vyměnit a zneplatnit; hodnotu nikam nekopírovat.

## Push jako signál, nikoliv bezpodmínečný deploy

Připraven je `scripts/deploy-webhook.py`: přijímá jen podepsaný GitHub push z pevně povoleného repozitáře a main, odmítá replay, ukládá pouze ověřené SHA do privátní fronty. Nevykonává příkazy z HTTP payloadu. Secret se čte ze serverového prostředí, listener pouze loopback za HTTPS proxy. Stav fronty zpracuje aaPanel Cron, nikoliv veřejný volný deploy endpoint.

`scripts/aapanel-deploy.py` připraví přesný SHA pomocí pevného git mirroru, `git fetch --prune origin main`, ověření commit SHA a dosažitelnosti z origin/main, čisté exportování archivu do nového release. Použije připnutý Node/npm, npm ci, typecheck/lint/test/build. Testy potřebují oddělenou **syntetickou** DB, nikdy produkční data. Před migracemi je nutná ověřená záloha a zastavení zápisů. Teprve potom forward migrace, atomická aktivace a nativní restart Node projektu s readiness DB i DEPLOY_SHA. Neúspěch vrátí předchozí release aplikace, nikoli starou DB.

Soubor konfigurace připravte ze `docs/deploy-config.example.json` v privátním serverovém adresáři. Reálný trigger a restart ověřit nejdříve na stagingu. Skript úmyslně vyžaduje marker schválené zálohy a explicitní potvrzení ověřeného panelu. Zde se nespouštěl proti serveru.

## Záloha a vyzkoušená obnova

`npm run backup -- create /absolutni/privatni/cesta --offline-confirm` vytvoří snapshot nové DB a bitové kopie privátního úložiště s manifestem SHA-256. Aplikace musí být ve chvíli zálohy zastavená, aby DB a soubory tvořily jeden konzistentní celek. Přístup CLI je v dočasném souboru 0600, ne na příkazovém řádku. Další kopie mimo release a mimo samotný server, šifrované úložiště a pravidelná zkouška obnovy. Produkční credentials a případné šifrovací klíče zálohovat odděleně zabezpečeným postupem.

Obnova je povolena pouze do nové prázdné `_restore_test` databáze a prázdného úložiště. `npm run backup -- restore /cesta/k/zaloze --offline-confirm`, s lokálně nastaveným DATABASE_URL/STORAGE_DIR. Ověřit po řádcích data, vazby i soubory, ne pouze úspěšný návrat CLI. Skutečnou obnovu produkce provést jako samostatně schválený incidentní krok; skript ji úmyslně neprovádí.

## Finální přepnutí a rollback

Krátce zastavit zápisy starého systému, poslední privátní záloha zdrojů, povolený finální import a verify každé faktury/položky/přílohy, nastavení řad podle skutečných čísel a kontrola anomálií. Teprve pak přepnout doménu a zkontrolovat login, filtr, detail a chráněné PDF. Nenechat oba systémy současně vystavovat do stejné řady.

Rollback aplikace přepne symlink na předchozí kompatibilní release a restartuje nativně aaPanel. DB se automaticky nevrací: nesmějí se ztratit nově vystavené doklady. Každá migrace má mít dopředu plán kompatibility; destruktivní SQL reset není součástí deploye. Částečně aplikovanou DDL migraci řešit forward opravou, protože MySQL/MariaDB DDL má implicitní commity.
