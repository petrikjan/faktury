let csrf: string | null = null;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}
export function setCsrf(value: string | null) {
  csrf = value;
}
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
): Promise<T> {
  const response = await fetch('/api' + path, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(options.key ? { 'Idempotency-Key': options.key } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const result = await response.json().catch(() => ({ message: 'Server není dostupný.' }));
  if (!response.ok) {
    if (response.status === 401 && path !== '/login')
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(response.status, result.message ?? 'Operace selhala.', result.fields);
  }
  return result;
}
