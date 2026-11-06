# Faktury

Soukromá česká fakturace: Node.js/TypeScript, Fastify, React/Vite a MariaDB. Nové rozhraní, serverové návrhy a vystavení, snímky údajů, přesné desetinné výpočty, kontakty, ceník, přehledy, audit, chráněné PDF a minimální MCP.

**Lokální verze obsahuje vlastníkem schválený import skutečných dat z 6. 11. 2026. Import i zachování dosavadní práce prošly lokální kontrolou; obsah záznamů se modelu nezobrazoval. PDF zůstává čistě v Node, pixelová identita není požadována. Repozitář uživatel vytvořil a pushnul; schválil nasazování z `main` přes aaPanel Git Manager stejně jako u Maxnera. Serverové přepnutí zatím neproběhlo.** Podrobnosti a aktuální výsledky v [docs/STATUS.md](docs/STATUS.md).

## Spuštění

Požadováno Node **26.13.0**, npm **11.9.0**, MariaDB **12.3.2**. Tyto verze odpovídají ověřenému cílovému aaPanelu. Původní místní databáze 11.4.13 zůstává oddělená; její datadir se novým serverem neotevírá. Běžný provoz nevyžaduje adresář legacy.

```sh
nvm install
nvm use
npm ci
cp .env.example .env
```

Nastavte v místním `.env` vlastní DB přístup. Soubor se neverzifikuje. Žádné výchozí heslo ani správce nejsou součástí aplikace.

Pro Docker Compose zadejte vlastní LOCAL_DB_PASSWORD a LOCAL_DB_ROOT_PASSWORD v prostředí nebo privátním `.env`; potom `docker compose up -d db`. Port DB je jen 127.0.0.1:3307. Alternativou je stejná MariaDB instalovaná lokálně; izolovaný datadir držte v `.private/db`, nespouštějte nad původním datadirem.

```sh
npm run db:migrate
npm run db:seed       # výhradně syntetická data; vyžaduje prázdný cíl
npm run admin:create  # jednorázově, interaktivní skryté heslo, min. 12 znaků
npm run dev
```

Otevřete [lokální aplikaci](http://localhost:5173). API běží na 127.0.0.1:3100; Vite ho zpřístupňuje pod stejným originem. APP_ORIGIN musí odpovídat adrese v prohlížeči. Pro data se nepoužívá localStorage, analytika ani externí fonty/CDN.

Produkční build: `npm run build`. `npm start` slouží pro sestavenou aplikaci s `.env`. Pro aaPanel je připraven `start:production`, který navíc načte release SHA z `.release.env`. Produkční start neprovádí žádnou migraci, seed ani import. Produkční konfigurace vyžaduje PDF_REVIEW_APPROVED=true; vlastník schválil čitelné původní rozložení a požádal o nasazení. Konkrétní serverový renderer je ještě nutné funkčně ověřit. Automatický deploy spouští pouze čtecí `db:check`; chybějící nebo změněná migrace jej zastaví. Viz [postup nasazení](docs/DEPLOYMENT.md).

## Testy

Vyhraďte oddělené prázdné lokální databáze se stejným enginem/verzí a účtem jen pro jejich schémata:

- `TEST_DATABASE_URL`: databáze končící `_test`, pro jednotkové/integrační testy.
- `SOURCE_TEST_DATABASE_URL`: databáze končící `_source_test`, pro syntetické původní DDL včetně utf8mb3/latin1.
- `E2E_DATABASE_URL`: samostatná databáze končící `_e2e_test`, pro Playwright. Nesmí být shodná s integrační DB.
- `LOCAL_MERGE_SOURCE_TEST_URL` a `LOCAL_MERGE_BASELINE_TEST_URL`: samostatné cíle končící `_test`, pro zachování současné práce při importu. Výchozí názvy jsou `faktury_merge_source_test` a `faktury_merge_baseline_test`, přístupy se odvodí z integračního URL. Databáze je nutné předem vytvořit a přidělit testovacímu účtu.

URL zadejte soukromě v prostředí, nebo použijte ignorovaný `.private/test-env.json` s klíči DATABASE_URL, SOURCE_TEST_DATABASE_URL a E2E_DATABASE_URL. Testy nikdy nesmějí mířit na produkci: vyhrazené cíle mažou a znovu plní syntetickými daty.

```sh
npm run check        # typecheck, lint, Vitest, testy deploye, build
npm run test:e2e     # Chrome/Chromium; běží nad vlastním lokálním test serverem
npm run test:pdf     # 11 syntetických případů, text všech položek a QR z PDF
npm run pdf:compare  # volitelné legacy pouze pro syntetický referenční test
```

Playwright používá výchozí lokální Google Chrome. Na Linuxu lze nastavit `PDF_BROWSER_CHANNEL=chromium` a nainstalovat připnutý prohlížeč pomocí `npx playwright install chromium`; cache mimo release určuje `PLAYWRIGHT_BROWSERS_PATH`. PDF matice vyžaduje Python s pdfplumber (volitelně PDF_QA_PYTHON) a Poppler. Referenční PDF test vyžaduje PHP s gd/mbstring, Dompdf 3.1.6 z nepřepsaného legacy a Poppler. Je to izolovaný test, nikoli runtime závislost. Skript není součástí startu aplikace.

## Struktura

- `apps/web`: české responzivní UI, filtry v URL, formuláře a stavy chyb.
- `apps/api`: autentizace, aplikační služby, parametrizované dotazy a MCP.
- `packages/domain`: Zod, decimal.js, data/období, IBAN/SPAYD.
- `packages/pdf`: lokální fonty/logo a escapovaná aktivní šablona za rozhraním rendereru.
- `db/migrations`: verzované nové DDL s kontrolou otisků a zámkem.
- `scripts/migration`: parser dumpu jako dat, archiv, oddělené režimy, import a validátor.
- `tests/fixtures`: jen syntetická data a očištěné DDL; nikdy původní dump.
- `.private`: ignorované místní databáze, PDF, migrační reporty, test přístupy a zálohy.

[Audit aktivních funkcí](docs/AUDIT.md), [úplná matice 242 sloupců](docs/MIGRATION-MAP.md), [migrační postup](docs/MIGRATION.md), [MCP a soukromí](docs/MCP.md), [aaPanel a rollback](docs/DEPLOYMENT.md), [PDF ověření a více stran](docs/PDF.md).
