/* Thin client for the /api functions. Every call sends the session cookie. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public body: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // A static host answers unknown paths with index.html: that means there is no backend.
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw response.status >= 500 ? new ApiError(response.status, 'server_error') : new ApiError(404, 'no_backend');
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!response.ok) throw new ApiError(response.status, String(payload.error ?? 'http_error'), payload);
  return payload as T;
}

export interface Session {
  email: string;
  userId: string;
}

export const api = {
  me: () => call<Session>('GET', '/api/auth/me'),
  login: (email: string, password: string, remember: boolean) =>
    call<{ email: string }>('POST', '/api/auth/login', { email, password, remember }),
  register: (email: string, password: string, remember: boolean) =>
    call<{ email: string }>('POST', '/api/auth/register', { email, password, remember }),
  logout: () => call<{ ok: boolean }>('POST', '/api/auth/logout', {}),
  getData: () => call<{ data: unknown; version: number }>('GET', '/api/data'),
  putData: (data: unknown, baseVersion: number) => call<{ version: number }>('PUT', '/api/data', { data, baseVersion }),
};
