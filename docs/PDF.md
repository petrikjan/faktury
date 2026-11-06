# PDF: čistě Node renderer a ověření

Uživatel upřesnil kritérium: „ne, nemusi to byt pixel perfekt, ale lidsky citelne stejne“. Produkční renderer zůstává **Node + Chromium**, bez PHP či běhu starého webu. Rozhoduje stejné čitelné členění a úplný správný obsah. Pixelová identita není podmínkou; diagnostické rozdíly se neskrývají ani nevydávají za nulu.

## Zachovaný doklad

Aktivní invoice_view.php je podkladem šablony: A4, okraje, původní lokální logo a DejaVu Regular/Bold, třísloupcová hlavička, šedé číslo dokladu, datum/symboly/účet vlevo a odběratel vpravo, sedm sloupců položek, QR vlevo, souhrn vpravo a patička. Formát cen zachovává round na dvě místa bez povinného doplňování nul. Množství tiskne přesně bez zbytečných koncových nul. DUZP respektuje skutečnou zadanou hodnotu, nikoliv natvrdo datum vystavení.

`legacy.css` zachovává zdrojová pravidla; `chromium.css` přizpůsobuje jejich sazbu pro Chromium. Drobné rozdíly metrik a QR matice zůstávají. Běžný doklad je opět **jedna stránka bez prázdného pokračování**. Finální vizuální posouzení je předložené vlastníkovi společně se schválením místní verze a init commitu.

## Více stran bez ztráty obsahu

Stránkování měří načtené lokální fonty v tiskovém režimu a při stejné fyzické šířce 190 mm, jaká se použije v PDF. Opakuje hlavičku s číslem, tabulkové popisky a patičku s číslem strany. Celá položka přejde na další stranu; položka delší než celá strana se rozdělí na označená pokračování. Cena/množství/DPH se u pokračování neopakují jako další účtovaná položka. Dělí se mezi slovy, případně po celých grafémech, takže se neporuší znaky s diakritikou.

Souhrn a QR se přesunou společně na konec. Zachování celého popisu se kontroluje před tiskem i **extrakcí textu z hotového PDF po jednotlivých položkách a stranách**. Obsah nesmí překrýt patičku ani přesáhnout šířku. Nepřenosná hlavička/adresa/patička vede ke srozumitelné chybě a zachovanému návrhu, ne k ořezu.

## Syntetická matice

`npm run test:pdf`: Chrome 156.0.8078.80, 120 DPI; všechny výsledné strany vyrastrované a vizuálně prohlédnuté v přehledu i vybraných detailních stránkách. Ve všech případech je ověřena shoda celého extrahovaného popisu, fyzický počet stran, žádná prázdná strana a dekódování QR z poslední strany.

| Případ               | Strany | Původní položky | Text z PDF | QR dekódováno |
| -------------------- | ------ | --------------- | ---------- | ------------- |
| standard             | 1      | 2               | celý       | ano           |
| end-customer-null-ks | 1      | 2               | celý       | ano           |
| alto-empty-ks        | 1      | 2               | celý       | ano           |
| alto-set-ks          | 1      | 2               | celý       | ano           |
| fractional           | 1      | 2               | celý       | ano           |
| zero-vat             | 1      | 2               | celý       | ano           |
| long-address         | 1      | 2               | celý       | ano           |
| many-items           | 7      | 60              | celý       | ano           |
| long-description     | 12     | 1               | celý       | ano           |
| unbroken-description | 3      | 1               | celý       | ano           |
| separate-tax-date    | 1      | 2               | celý       | ano           |

Výsledky jsou jen syntetické: `.private/pdf/matrix/*.pdf`, odpovídající PNG a `report.json`; přehled všech stran `all-pages-review-v2.png`. Oba účty a KS NULL/prázdný/nastavený jsou navíc pokryty testy PNG. SPAYD má správný IBAN, AM na dvě místa, CZK, VS a nepovinný KS. Datum DUZP odlišné od vystavení je výslovně otestované.

## Porovnání s původním rendererem

`npm run pdf:compare` spustí původní šablonu a Dompdf 3.1.6 **pouze jako izolovanou syntetickou testovací referenci**. Nečte konfiguraci, nevolá Bbs_pdf.php, starý web ani produkční PDF. Pevné soukromé texty se na obou stranách nahradí stejnými syntetickými hodnotami. PHP není produkční závislost.

Aktuální reference i Node mají po jedné straně. Nativní rozměry: 595,28 × 841,89 pt a 594,96 × 841,92 pt. Nulový pixelový práh včetně antialiasingu vykazuje 132823 rozdílných pixelů; jde o diagnostiku, ne nové kritérium přijetí. Žádné maskování, škálování ani tolerance pro zakrytí rozdílu. Překryv a diff jsou v `.private/pdf/`. QR má jinou matici, ale shodný ověřený payload.

## Provoz a předpoklady

- Renderer vytváří PDF jen z interních dat a lokálních assetů; všechny uživatelské texty jsou escapované a síťové požadavky jsou zablokované.
- Nové PDF se ukládá neměnně s verzí `legacy-node-2`, SHA-256 a privátní náhodnou cestou. Každé stažení je autorizované, kontroluje hash a používá private/no-store. Stejný origin může PDF vložit do chráněného náhledu; cizí origin nikoliv.
- Historická původní PDF zůstávají bitově nezměněné originály. Chybějící příloha se eviduje, nevymýšlí se historické DPH. Cizoměnové doklady nelze vystavit CZK šablonou.
- Na serveru je nutný podporovaný Chrome/Chromium a jeho systémové knihovny pod neprivilegovaným účtem. Konkrétní aaPanel prostředí zatím není ověřené. Výchozí kanál je lokální Chrome, stejný jako při testu.
- Pro matici je třeba Python s pdfplumber a Poppler (`pdfinfo`, `pdftoppm`); interpret lze zadat přes PDF_QA_PYTHON. Referenční test navíc potřebuje PHP s gd/mbstring; lze zvolit PHP_BIN. Tyto nástroje jsou pro QA, aplikace PHP/Python/Poppler k běhu nepotřebuje.
- Skutečné soukromé texty dodavatele/hlavičky/patičky přenese povolený lokální migrační postup. Syntetický test nepotvrzuje neprohlédnutý skutečný obsah ani reálnou migraci.
