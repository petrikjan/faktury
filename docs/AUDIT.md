# Etapa A: aktivní funkce a rozhodnutí

Stav 5. 11. 2026. Prohlédnut byl zdrojový kód a DDL, nikoli produkční záznamy, PDF ani konfigurace s přístupy. Referenční soubory se nemění.

| Funkce                    | Aktivní zdroj pod legacy/faktury.janpetrik.cz/www/application         | Nové chování                                                                                  |
| ------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Seznam, kvartály, souhrny | controllers/Faktury.php::index, views/themes/default/home/faktury.php | Skutečný rok a Q1–Q4, pravdivý samostatný měsíc, serverové stránkování a souhrn celého filtru |
| Ruční položky             | Faktury.php::newinvoice, models/Bbs_invoices_model.php::create        | Validované desetinné řetězce, návrh, vystavení, transakce a idempotence                       |
| Kontakty, ARES            | Faktury.php::addcompany/ares, Bbs_contacts_model.php                  | Archivační příznak, explicitní ARES s náhledem a potvrzením                                   |
| Detail dokladu            | controllers/Invoice.php::index                                        | Snímek odběratele/dodavatele/účtu/měny/sazeb a původ snímku                                   |
| Číslo                     | Bbs_invoices_model.php::create                                        | Interní id nezávislé; textové číslo YYYYNNNN; uzamčená řada, UNIQUE                           |
| Úhrada                    | Bbs_invoices_model.php::payed                                         | Příznak + audit; nepovinné skutečné datum odlišné od času akce                                |
| Bankovní varianta         | create: isset(contact.payment_id), Invoice.php::index                 | NULL a prázdno odlišné; bankovní účet lze výslovně vybrat                                     |
| Symboly                   | invoice/invoice_view.php, third_party/invoice_qrcode/payment.php      | invoice_number = VS, contact.payment_id = KS; místní QR                                       |
| Koncový zákazník          | invoice_view.php, podmínka staré id=1                                 | Explicitní end_customer, bez závislosti na novém id                                           |
| PDF                       | models/Bbs_pdf.php, invoice/invoice_view.php                          | Žádný fetch starého webu; chráněné immutable soubory; původní PDF se neregeneruje             |
| Čas                       | www/index.php:57, config/config.php:481                               | PHP Europe/Prague/local; zdrojové DATETIME doslova, odvození dne explicitně                   |
| Pořadí položek            | get_invoice a Bbs_invoices_details_model.php                          | V aktivní cestě není explicitní ORDER BY. id ASC je označené odvození                         |
| Prefix / vstup            | core/BBS_Model.php, config/routes.php                                 | Čisté doménové tabulky a chráněné API                                                         |

## Chyby, které nepřebíráme

- Natvrdo rok 2026 a kvartál pojmenovaný jako měsíc.
- PHP výraz `array('YEAR(created)' == "2025")` nefiltruje zamýšlený rok.
- Nečíselné množství přepsané na 1; nové formuláře musí ukázat chybu.
- Neuzamčené max+1, smazání existujícího PDF při downloadu, přepis historických údajů dnešním kontaktem a DPH.
- Neexistující invoices.user_id v některých kontrolerech.
- Neúčinné či nesourodé kontroly přihlášení, natvrdo zapsané přístupové údaje ve starém PDF modelu.
- Wallet/ThePay/blog/knihy/nákupy se neobnovují; všechny zdrojové tabulky se archivují se sloupci i vazbami.

## Návrh a mapa obrazovek

Jeden Fastify backend a jedna MariaDB, React/Vite. Validace a výpočty v packages/domain; sdílené služby v apps/api/src/services.ts; renderer za funkcí renderInvoice. Web i minimální MCP používají stejné serverové bezpečnostní hranice; MCP záměrně nevolá obchodní služby.

Přihlášení → Faktury (filtry URL, souhrn, stránky) → detail / návrh / vystavení. Kontakty (hledání, dialog změn a archivace). Ceník (samostatný nový modul, kopírování do položek). Přehledy (měny odděleně, měsíce, původní hranice základu, popsaný průměr). Nastavení (dodavatel, oba účty, heslo, stav MCP, audit).

DDL v db/migrations/001_core.sql zahrnuje navržené doménové tabulky a konkrétně odůvodněné doplňky: idempotency_keys pro dvojí odeslání; legacy_metadata pro zachované zdrojové údaje mimo UI; app_settings pro provozní příznaky; revoked_mcp_tokens pro místní okamžitou revokaci OAuth jti. schema_migrations slouží pouze správě migrací.

## Ověřené zdroje verzí a rozhraní

Ověřeno 5. 11. 2026; přesné npm verze jsou v package.json a package-lock.json. Node 24.22.2 (LTS), MariaDB 11.4.13 (LTS). Node 24.14.0 byl výchozí dostupný runtime; konečné ověření se opakuje s připnutou verzí.

- [Node LTS](https://nodejs.org/en/about/previous-releases), [Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/), [Vite požadavky](https://vite.dev/guide/), [React verze](https://react.dev/versions), [Vitest](https://vitest.dev/guide/).
- [MariaDB LTS](https://mariadb.org/about/), [11.4.13 maintenance release](https://mariadb.org/mariadb-server-12-3-11-8-11-4-and-10-11-q3-2026-maintenance-releases-and-goodbye-10-6/).
- [mysql2](https://sidorares.github.io/node-mysql2/docs), [decimal.js](https://mikemcl.github.io/decimal.js/), [Zod](https://zod.dev/).
- [ARES oficiální informace](https://ares.gov.cz/stranky/vyvojar-info), [MF ČR](https://mf.gov.cz/cs/ministerstvo/informacni-systemy/ares). Pevný endpoint a 5s timeout; odesílá se pouze IČO, na tlačítko.
- [Oficiální MCP SDK](https://ts.sdk.modelcontextprotocol.io/server), [OpenAI MCP](https://developers.openai.com/api/docs/guides/tools-connectors-mcp), [ChatGPT MCP](https://learn.chatgpt.com/docs/extend/mcp). SDK podporuje Streamable HTTP; dokumentace není důkazem dostupnosti na konkrétním mobilním účtu.

## Neuzavřené předpoklady před převzetím

Uživatel odmítl PHP renderer a upřesnil, že pixelová identita není nutná; požaduje čitelně stejné rozložení. Node/Chromium je dokončen s měřeným stránkováním. Prošlo 11 syntetických případů včetně textu každé položky z hotového PDF a QR. Vizuální výsledek je předložen s místní verzí před schválením init commitu. PHP slouží jen izolovanému referenčnímu testu.

Aktuální nastavení není historický důkaz DPH/adresy/účtu. Import je rekonstrukce; původní PDF je samostatný originál. Skutečné počty, přílohy, účty, historické časové souvislosti a dostupný aaPanel DB engine nelze ověřit z DDL. Reálná migrace ani nasazení nebyly povoleny.
