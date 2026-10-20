export function requireCron(request: Request) {
  const expected = process.env.CRON_SECRET ?? "";
  const header = request.headers.get("authorization") ?? "";
  if (!expected || header !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
