import webPush from "web-push";
import { atomic, fail, readJSON } from "./security.js";

function vapid(env) {
  if (env.PUSH_PUBLIC_KEY && env.PUSH_PRIVATE_KEY && env.PUSH_SUBJECT)
    return {
      publicKey: env.PUSH_PUBLIC_KEY,
      privateKey: env.PUSH_PRIVATE_KEY,
      subject: env.PUSH_SUBJECT,
    };
}

function checkedEndpoint(value) {
  let url;
  if (typeof value === "string" && value.length <= 2048)
    try {
      url = new URL(value);
    } catch {}
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !(
      url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname === "web.push.apple.com" ||
      url.hostname.endsWith(".web.push.apple.com")
    )
  )
    fail(400, "Suscripción push no válida");
  return url.href;
}

export async function notificationsRoute(req, db, auth, env) {
  if (!["POST", "PUT", "DELETE"].includes(req.method))
    fail(405, "Método no permitido");
  const config = vapid(env),
    body = await readJSON(req, 4096);
  const endpoint = body?.endpoint ? checkedEndpoint(body.endpoint) : null;
  if (req.method === "POST") {
    const active =
      endpoint &&
      (await db
        .prepare(
          "SELECT 1 FROM push_subscriptions WHERE endpoint=? AND token_hash=?",
        )
        .bind(endpoint, auth.hash)
        .first());
    return { publicKey: config?.publicKey || null, active: Boolean(active) };
  }
  if (!endpoint) fail(400, "Falta la suscripción push");
  if (req.method === "DELETE") {
    await atomic(db, auth, [
      db
        .prepare(
          "DELETE FROM push_subscriptions WHERE endpoint=? AND token_hash=?",
        )
        .bind(endpoint, auth.hash),
    ]);
    return { ok: true };
  }
  if (!config) fail(503, "Las notificaciones aún no están disponibles");
  const { p256dh, auth: authKey } = body.keys || {};
  if (
    typeof p256dh !== "string" ||
    !/^B[A-Za-z0-9_-]{86}$/.test(p256dh) ||
    typeof authKey !== "string" ||
    !/^[A-Za-z0-9_-]{22}$/.test(authKey)
  )
    fail(400, "Claves de suscripción push no válidas");
  await atomic(db, auth, [
    db
      .prepare(
        "INSERT INTO push_subscriptions(endpoint,token_hash,p256dh,auth_key) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET token_hash=excluded.token_hash,p256dh=excluded.p256dh,auth_key=excluded.auth_key",
      )
      .bind(endpoint, auth.hash, p256dh, authKey),
  ]);
  return { ok: true };
}

export async function notifyNewJobs(db, env, count) {
  const config = vapid(env);
  if (!config) return;
  const { results } = await db
    .prepare(
      `SELECT p.endpoint,p.token_hash,p.p256dh,p.auth_key FROM push_subscriptions p
     JOIN sessions s ON s.token_hash=p.token_hash
     JOIN users u ON u.id=s.user_id
     WHERE u.active=1 AND u.must_change=0 AND s.credential_version=u.credential_version
       AND s.last_used>?`,
    )
    .bind(new Date(Date.now() - 30 * 86400000).toISOString())
    .all();
  let failures = 0;
  const payload = JSON.stringify({ type: "new-jobs", count });
  for (let offset = 0; offset < results.length; offset += 6) {
    const batch = await Promise.allSettled(
      results.slice(offset, offset + 6).map(async (row) => {
        const endpoint = checkedEndpoint(row.endpoint);
        const request = webPush.generateRequestDetails(
          { endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
          payload,
          { vapidDetails: config, TTL: 3600, urgency: "high" },
        );
        const headers = new Headers(request.headers);
        headers.delete("Content-Length");
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: request.body,
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        });
        await response.body?.cancel();
        if (response.status === 404 || response.status === 410) {
          await db
            .prepare(
              "DELETE FROM push_subscriptions WHERE endpoint=? AND token_hash=? AND p256dh=? AND auth_key=?",
            )
            .bind(endpoint, row.token_hash, row.p256dh, row.auth_key)
            .run();
        } else if (!response.ok) {
          throw Error("El servicio push rechazó el envío");
        }
      }),
    );
    failures += batch.filter((result) => result.status === "rejected").length;
  }
  if (failures) console.warn({ event: "push_delivery_failed", failures });
}
