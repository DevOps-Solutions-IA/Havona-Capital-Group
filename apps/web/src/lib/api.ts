export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(
  /\/$/,
  '',
);
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
function cookie(name: string) {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((value) => value.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const csrf = !['GET', 'HEAD', 'OPTIONS'].includes(method) ? cookie('havona_csrf') : undefined;
  const form = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body && !form ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
      ...init.headers,
    },
  });
  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const data = payload as { message?: string | string[] } | null;
    const message = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
    if (
      response.status === 403 &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/acceso-denegado'
    )
      window.location.assign('/acceso-denegado');
    throw new ApiError(
      response.status,
      message ?? 'No fue posible completar la solicitud.',
      payload,
    );
  }
  return payload as T;
}
export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}
