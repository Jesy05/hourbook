import { currentUser, error, handle, json } from '../_lib/http.js';

export function GET(request: Request): Promise<Response> {
  return handle(request, async () => {
    const user = await currentUser(request);
    return user ? json({ email: user.email, userId: user.id }) : error('unauthorized', 401);
  });
}
