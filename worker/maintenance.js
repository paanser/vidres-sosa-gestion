// Invoked only by Cloudflare's scheduler, never exposed as an HTTP endpoint.
export async function maintenance(env) {
  if (!env.DB || !env.FILES) return;
  const db = env.DB.withSession ? env.DB.withSession("first-primary") : env.DB;
  const now = Date.now(),
    old = new Date(now - 7 * 86400000).toISOString();
  await db.batch([
    db
      .prepare("DELETE FROM sessions WHERE last_used<=?")
      .bind(new Date(now - 30 * 86400000).toISOString()),
    db
      .prepare("DELETE FROM attempts WHERE window_start<? AND blocked_until<?")
      .bind(now - 86400000, now),
    db.prepare("DELETE FROM quotas WHERE expires_at<?").bind(now),
    db
      .prepare(
        "DELETE FROM files WHERE import_id IN(SELECT id FROM imports WHERE status='cancelled' OR (status='staging' AND created_at<?))",
      )
      .bind(old),
    db
      .prepare(
        "UPDATE imports SET status='cancelled' WHERE status='staging' AND created_at<?",
      )
      .bind(old),
  ]);
  const cursor = await db
    .prepare("SELECT value FROM maintenance_state WHERE key='files-cursor'")
    .first();
  const page = await env.FILES.list({
    limit: 100,
    ...(cursor?.value ? { cursor: cursor.value } : {}),
  });
  const candidates = page.objects.filter(
    (o) => new Date(o.uploaded).getTime() < now - 86400000,
  );
  if (candidates.length) {
    const { results } = await db
      .prepare(
        "SELECT object_key FROM files WHERE object_key IN(" +
          candidates.map(() => "?").join(",") +
          ")",
      )
      .bind(...candidates.map((o) => o.key))
      .all();
    const live = new Set(results.map((r) => r.object_key)),
      garbage = candidates.filter((o) => !live.has(o.key)).map((o) => o.key);
    if (garbage.length) await env.FILES.delete(garbage);
  }
  await db
    .prepare(
      "INSERT INTO maintenance_state(key,value) VALUES('files-cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(page.truncated ? page.cursor : "")
    .run();
}
