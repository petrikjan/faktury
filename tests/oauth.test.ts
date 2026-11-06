import { it, expect } from 'vitest';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { jwtTokenVerifier } from '../apps/api/src/mcp.js';
it('jose ověří podpis, issuer, audience, expiraci a krátkou platnost bez vlastního OAuth protokolu', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey);
  key.kid = 'synthetic';
  const verify = jwtTokenVerifier(
    createLocalJWKSet({ keys: [key] }),
    'https://issuer.example.test',
    'https://app.example.test/mcp',
  );
  const now = Math.floor(Date.now() / 1000);
  const token = async (
    issuer = 'https://issuer.example.test',
    audience = 'https://app.example.test/mcp',
    start = now,
    exp = now + 100,
  ) =>
    new SignJWT({ scope: 'navigation:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'synthetic' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('synthetic-user')
      .setJti('synthetic-jti')
      .setIssuedAt(start)
      .setExpirationTime(exp)
      .sign(privateKey);
  expect((await verify(await token())).jti).toBe('synthetic-jti');
  await expect(verify(await token('https://foreign.example'))).rejects.toThrow();
  await expect(verify(await token(undefined, 'https://foreign.example'))).rejects.toThrow();
  await expect(verify(await token(undefined, undefined, now - 200, now - 100))).rejects.toThrow();
  await expect(verify(await token(undefined, undefined, now, now + 3600))).rejects.toThrow();
  const other = await generateKeyPair('RS256');
  const bad = await new SignJWT({ scope: 'navigation:read' })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic' })
    .setIssuer('https://issuer.example.test')
    .setAudience('https://app.example.test/mcp')
    .setSubject('synthetic')
    .setJti('synthetic')
    .setIssuedAt(now)
    .setExpirationTime(now + 100)
    .sign(other.privateKey);
  await expect(verify(bad)).rejects.toThrow();
});
