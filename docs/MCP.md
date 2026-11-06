# MCP: hranice soukromí

Výchozí `MCP_ENABLED=false`: endpoint odpovídá 404. Webové session nejsou OAuth oprávnění MCP. Po zapnutí je povolen pouze scope `navigation:read`; žádný obchodní scope není implementován ani skrytě dostupný.

Oficiální SDK skutečně obsluhuje tools/list a tools/call přes Streamable HTTP. Existují pouze:

- `technical_status {}`: pevná informace o dostupnosti, bez diagnostiky nebo počtů.
- `open_application {page}`: page má pevný výběr invoices/new/customers/reports. Výsledek je jen statický chráněný odkaz bez tokenu, identity či obchodních údajů.

Žádné resources/prompts, SQL, filesystem, shell, URL-fetch ani export nástroje. MCP server nemá přístup k aplikačním obchodním službám. Vstupy i výstupy se skládají z povoleného seznamu, ne z regexového mazání. Neznámý nástroj nebo argument vrací obecnou chybu bez vložené hodnoty. Request body, cookies a bearer tokeny se nelogují.

## OAuth pro budoucí vzdálené připojení

Aplikace je **resource server**, ne vlastní kryptografický autorizační protokol. Ověřuje JWT přes jose/JWKS, povolené RS256/ES256, přesný issuer/audience, exp/iat/sub/jti, maximálně 15 minut platnosti, scope a místní revokaci jti. Vyžaduje HTTPS issuer/JWKS a Host/Origin podle nastaveného APP_ORIGIN; má limit požadavků. Token je pouze v Authorization headeru. Metadata chráněného zdroje jsou na `.well-known/oauth-protected-resource`.

Před zapnutím je nutný konkrétní ověřený OAuth/OIDC autorizační server s registrovaným klientem, přesnými redirect URI, Authorization Code + **PKCE S256**, consentem, krátkými access tokeny a odvoláním přístupu. Tato část je záměrně svěřena ověřené knihovně/službě IdP, nikoliv vlastnímu ad hoc OAuth. Bez ní endpoint nelze bezpečně zapnout; config selže. Připojení a redirect/PKCE musí být ověřeny proti zvolenému IdP a cílovému klientu na stagingu.

Místní zneplatnění tokenu je POST `/api/mcp/revoke` s přihlášenou webovou relací a CSRF. Použije jti a konec platnosti; do DB se ukládá jen hash. Odvolání klienta a refresh tokenu navíc proběhne u IdP.

## Co opouští server

Co nástroj vrátí ChatGPT, může být zpracováno servery OpenAI. Vlastní hosting, TLS ani OAuth neznamenají zpracování pouze u uživatele. Proto nejsou dostupné ani obraty, částky, počty, pseudonymizované doklady nebo ceník. Citlivé údaje uživatel vybírá a potvrzuje v přihlášeném webu. Údaj již vložený uživatelem do chatu aplikace zpětně neochrání.

Případný budoucí obchodní rozsah vyžaduje výslovnou změnu zadání a předem popsané konkrétní údaje, které budou odesílány. Není součástí současné implementace.

## Mobil

Ověřena byla [oficiální dokumentace MCP SDK](https://ts.sdk.modelcontextprotocol.io/server), [OpenAI MCP](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) a [ChatGPT MCP](https://learn.chatgpt.com/docs/extend/mcp) dne 5. 11. 2026. To nepotvrzuje dostupnost přidání vlastního MCP u konkrétního tarifu nebo mobilního účtu. Přímé připojení z mobilního ChatGPT **neověřeno**. Responzivní web je samostatná funkční cesta; není totožný se vzdáleným ovládáním desktopu.
