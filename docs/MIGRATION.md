# Místní migrace bez ztráty dat

Vlastník 6. 11. 2026 výslovně povolil lokální import svého SQL s podmínkou, že se data neposílají do chatu. Archivace, dry-run, import do nové databáze a závěrečné verify proběhly lokálně. Skutečné záznamy, částky, účty ani PDF se modelu nezobrazovaly. Připravená kontrolní hodnota REAL_MIGRATION_APPROVAL není sama souhlasem pro další jiné migrace.

Aktivní konfigurace ukazuje na nový ověřený cíl. Předchozí databáze a úložiště zůstaly zachované; offline záloha včetně tehdejší konfigurace je v `.private/backups/before-real-import-20261106`. Zdrojový archiv je v `.private/source-archive-20261106`. Soukromé reporty jsou v `.private/migrations/local-20261106`, závěrečné ověření má nulový počet chyb. Některá původní PDF ve zdroji chybí; tato výjimka je v reportu, soubory se nedogenerovaly.

`merge-local.ts` rezervuje původní interní ID před importem a poté zachová dosavadní uživatele, relace, koncepty, upravené či vlastní záznamy, audit a soubory. Přesně nezměněný syntetický seed se vynechá, kromě kontaktů a bank již použitých v současných dokladech. Kolize čísla faktury operaci zastaví bez přečíslování. Přepnutí konfigurace následuje až po kontrole importu i zachované práce.

## Režimy

- `migration:preflight -- --source legacy/faktury.sql`: jen DDL, počet strukturálních chyb ven; soukromý report v `.private/migrations/preflight.json`. Žádné INSERT hodnoty se nevypisují.
- `migration:dry-run`: po povolení parsuje zdroj jako data, kontroluje čísla, identity, vazby, měny a příznaky, nic nemění v cílové DB.
- `migration:import`: pouze do nové DB, nikdy do zdrojové. Transakce pro nastavení/kontakty a po jednotlivých fakturách, se zdrojovou mapou a kontrolou obsahu. Po pádu se znovu spustí se stejným source-id, verzí a obsahem.
- `migration:verify`: každá mapovaná faktura, položka, kontakt, vztah, archiv a soubor. Reportuje jen stav a počet chyb. Úplný privátní report nepatří do chatu, CI, MCP ani veřejného logu.
- `migration:archive -- /absolutni/zdroj /privatni/novy/archiv`: bezeztrátová kopie celého stromu se soukromým manifestem. Symlinky a konflikty vyžadují posouzení, nic se nespouští ani nemaže.

Volba `--template-file /cesta/k/aktivni/invoice_view.php` přenese pevný web a text obou patiček pouze do soukromých dat dodavatele. PHP se nespouští, povolené dynamické části jsou jen zástupné hodnoty dodavatele a času. Text je při vykreslení escapovaný a je součástí kontrolního otisku importu.

Syntetické příklady použijí `--source tests/fixtures/legacy.json --fixture --source-id synthetic-review --source-timezone Europe/Prague`. Importovat do samostatné prázdné test DB; nikoliv do vývojového seedu s dodavatelem. Výchozí live režimy neakceptují skutečná data bez povolení. Syntetický marker sám nepovoluje jinou cestu než tests/fixtures.

## Bezpečnost zdroje a kódování

Importér nepředává dump jako libovolné SQL databázovému serveru. Lexer čte jen CREATE metadata a INSERT literály: NULL, desetinné řetězce včetně exponentu a MySQL escapované texty. Neznámá SQL operace, trigger, rutina, práce se soubory nebo nepodporovaný literál operaci zastaví. SET/ALTER jsou pouze ignorované zdrojové instrukce, nikdy vykonané. Podporované komentářové SET hlavičky a ENABLE/DISABLE KEYS se také nevykonávají; jiné skryté operace v komentářích se odmítnou. Místní test se skutečným původním DDL používá výhradně syntetická data.

Dodané UTF-8 SQL se dekóduje striktně, neplatné bajty se nenahrazují potichu. Dump z SQL klienta obsahuje hodnoty převedené do jeho SET NAMES kódování. Před reálným importem je nutné ověřit hlavičku exportu a skutečné kódování, nikoli předpokládat UTF-8 pro libovolný jiný export. Při odlišnosti vznikne výjimka a připraví se explicitní lokální převod podle sloupce. Zdrojové bbs_contacts má latin1 default a utf8mb3 běžné textové sloupce; payment_id dědí latin1. Syntetický DB test ověřuje převod sloupců přes MariaDB, ne jen řetězce v JS.

Původní dump se kopíruje bitově, jeho SHA je jen v privátním manifestu. Všechny tabulky a sloupce se archivují odděleně od provozního schématu, včetně starých účtů, kreditů, produktů a souvisejících souborů. Žádný legacy token ani účet se neaktivuje. Případný budoucí převod konkrétního bcrypt účtu by vyžadoval výslovnou mapu identity/role a vlastní lokální test; není automatickou součástí tohoto importu.

## Invarianty

- BIGINT čísla zůstávají řetězce, vazba položek se odvozuje přes **obchodní číslo**.
- Id kontaktů se neslučují. NULL, prázdný text a nula zůstávají odlišné; původní hodnoty a FLOAT lexémy zůstávají v archivu.
- Čas created se ukládá doslova s potvrzeným zdrojovým pásmem. PHP má Europe/Prague; před povolenou migrací prověřit SQL session a historické souvislosti. Den se neodvozuje tichým převodem přes JS Date/UTC.
- Aktuální dodavatel/kontakt/účet je označená rekonstrukce. Historická sazba DPH i datum platby jsou neznámé, pokud nejsou doložené. Importované vat/gross jsou NULL; přehledy nejistotu ukazují.
- Originální total se nezamění kontrolním přepočtem. Rozdíl po každé faktuře je evidován. Cílové DECIMAL(30,10), celky DECIMAL(30,2), HALF_UP. Nepřenosná velikost hodnoty import zastaví.
- Položky zachovávají celý popis a product_id. Pořadí id ASC je odvozené: renderer neměl explicitní ORDER BY.
- Původní PDF se nikdy negeneruje starou routou. Kopie s kontrolou hash je originál, chybějící soubor je výjimka. Neznámá minulá DPH se nedomýšlí podle dnešního nastavení.
- source-id + tabulka + staré ID je jedinečné. Změna zdroje, verze, časového předpokladu, cílového řádku či archivu vede ke konfliktu. Opakovaný import nepřepisuje již změněný cíl.
- Řady se nastavují jen z přesných YYYYNNNN. Jiný formát je zachovaný a označený k posouzení, nikdy se nepřečíslovává.

Před reálným spuštěním je nutný nový prázdný cíl, omezený účet, privátní záloha zdrojů, kontrola dostupných příloh a konce archivace. Výstup syntetických testů není důkazem úspěšné skutečné migrace.

## Úpravy podle zadání vlastníka — 6. 11. 2026

Po offline zálohách byly všechny dosavadní vystavené doklady označené jako zaplacené s auditem. Skutečná data plateb se nevymýšlejí; zůstala zachovaná. Nově vystavené faktury se prozatím automaticky označují jako zaplacené, návrhy zůstávají návrhy. Aplikace nově přijímá pouze CZK, volba měny je odstraněná z formulářů a přehledů.

Vlastník výslovně schválil doplnění chybějící DPH základní sazbou podle data DUZP. Skript `scripts/invoice-adjustments.ts` v režimu `standard-by-date` uloží výsledek a schvalujícího uživatele do `invoice_vat_adjustments`. Původní finanční pole, položky, snímky a PDF se nepřepisují. Už uložené sazby či částky DPH mají přednost, včetně snížených sazeb. Jde o vlastníkem schválený dopočet, nikoli o důkaz původně účtované daně. Původní historický příznak proto zůstává zachovaný.

| Datum DUZP                | Doplňovaná základní sazba |
| ------------------------- | ------------------------- |
| 1. 1. 1993 – 31. 12. 1994 | 23 %                      |
| 1. 1. 1995 – 30. 4. 2004  | 22 %                      |
| 1. 5. 2004 – 31. 12. 2009 | 19 %                      |
| 1. 1. 2010 – 31. 12. 2012 | 20 %                      |
| od 1. 1. 2013             | 21 %                      |

Historie byla ověřena v [tabulce Evropské komise, oddíl VIII](https://taxation-customs.ec.europa.eu/system/files/2021-06/vat_rates_en.pdf). Aktuální základní sazbu potvrzuje [Portál veřejné správy](https://portal.gov.cz/informace/general-vat-rules-and-rates-INF-205). Snížená sazba se bez doloženého zařazení plnění automaticky nevolí. Datum před rokem 1993 se odmítne; změny sazeb po posledním ověření vyžadují aktualizaci tabulky.

Součty a detail používají doložené hodnoty nebo schválený dopočet. Základ zůstává podle původního dokladu, DPH se počítá přes Decimal a zaokrouhluje HALF_UP na haléře, celkem je základ plus DPH. Známé částky či sazby jednotlivých položek mají při dopočtu přednost. Kvartální členění pracuje s výslednou zaokrouhlenou částkou **s DPH**: pod 10 000 Kč a od 10 000 Kč včetně. Souhrny zahrnují celý filtrovaný výsledek, nikoli pouze zobrazenou stránku.

Soukromé zálohy: `.private/backups/before-invoice-preferences-20261106` a `.private/backups/before-vat-backfill-20261106`. Lokální ověření úhrad a DPH je v `.private/invoice-preferences-verification.json` a `.private/vat-backfill-verification.json`; obsah záznamů se do chatu neposílal. Byla ověřena shoda původních polí, položek a PDF, úplnost efektivní DPH, součty i členění podle částky. Po oprávněné změně úhrad se původní import znovu nespouští do upraveného cíle; jeho ochrana kontrolních otisků správně vyhodnotí pozdější obchodní změny jako konflikt.

## Pozdější úpravy a historie

Migrace 003 přidává příznak smazání, soukromé record_history a časově omezená potvrzení mazání. Před migrací vznikla offline záloha `.private/backups/before-record-edit-delete-20261106`. Přidání schématu nemění obchodní obsah. Podle pozdějšího výslovného zadání vlastníka lze upravovat a mazat i vystavené doklady; staré verze a soubory zůstávají zachované. Tyto oprávněné změny mohou záměrně změnit původní cílové kontrolní otisky importu, proto se import neopakuje přes upravené doklady.

Historie PDF je chráněná stejným přihlášením jako aktuální PDF, ověřuje relativní cestu a SHA souboru a nesmí jít do veřejného logu či MCP. Záloha kopíruje celé úložiště včetně historických PDF. Nová schémata jsou součástí migrací od prázdné DB; kopírování současného lokálního stavu zahrnuje i historii a potvrzení.

## Opětovné použití čísel po smazání

Vlastník následně výslovně požaduje číslo smazané faktury nerezervovat. Migrace 004 zachová původní číslo v deleted_invoice_number i historii a u smazaného záznamu uvolní jedinečné invoice_number. Uvolněná standardní čísla YYYYNNNN se evidují v released_invoice_numbers. Vystavení nejprve transakčně použije nejnižší uvolněné číslo stejné roční řady, teprve potom zvyšuje poslední pořadí. Historie i PDF zůstávají vázané na interní ID; nové použití stejného čísla je nepropojí s jinou fakturou.

Řada je uzamčená proti souběhu, chyba PDF vrací i přidělení uvolněného čísla a ruční použití při editaci jej vyřadí z nabídky pro automatické přidělení. Nestandardní číslo je také uvolněné k ručnímu použití, automatická řada používá standardní formát. Před změnou vznikla soukromá offline záloha `.private/backups/before-number-release-20261106`. Byla lokálně ověřena také už dříve smazaná čísla, bez výpisu záznamů.

## Dostupnost PDF bez původní přílohy

Po opravě dostupnosti PDF se chybějící uložený soubor pro vystavený nebo stornovaný doklad vytvoří při prvním požadavku ze snímku, položek a doložené nebo vlastníkem potvrzené DPH. Původní stav chybějící přílohy zůstává evidovaný; nová kopie používá kind generated a označení reconstructed v template_version. Zámek faktury brání souběžnému vytváření více kopií. Nová kopie má audit, privátní úložiště a ověření SHA, bez změny finančních polí či položek. Existující soubory nadále procházejí kontrolou integrity. Bez vyčíslené DPH je nutné nejprve doplnit fakturu.
