import { clearSessionCookie, deleteSession, handle, json } from '../_lib/http.js';

export function POST(request: Request): Promise<Response> {
  return handle(request, async () => {
    await deleteSession(request);
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
  });
}
