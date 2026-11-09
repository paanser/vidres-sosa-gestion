const encoder = new TextEncoder();
export const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
export const random = (size = 32) =>
  hex(crypto.getRandomValues(new Uint8Array(size)));
export const digest = async (text) =>
  hex(
    await crypto.subtle.digest(
      "SHA-256",
      typeof text === "string" ? encoder.encode(text) : text,
    ),
  );
export const ITERATIONS = 100000; // Cloudflare Web Crypto currently caps PBKDF2 at 100,000.
export async function passwordHash(
  password,
  salt,
  iterations = ITERATIONS,
  pepper,
) {
  if (typeof pepper !== "string" || pepper.length < 32)
    fail(503, "Falta configurar PASSWORD_PEPPER");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations },
    key,
    256,
  );
  const pepperKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", pepperKey, derived));
}
export async function credentials(password, pepper) {
  const salt = random(16);
  return {
    salt,
    hash: await passwordHash(password, salt, ITERATIONS, pepper),
    iterations: ITERATIONS,
  };
}
export function equal(a, b) {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
export function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export async function readJSON(req, limit = 12000) {
  const reader = req.body?.getReader();
  if (!reader) fail(400, "JSON vacío");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      fail(413, "Petición demasiado grande");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes), (key, value) => {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw Error();
      return value;
    });
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data;
  } catch {
    fail(400, "JSON no válido");
  }
}
export function text(value, max, min = 0) {
  if (
    typeof value !== "string" ||
    value.length < min ||
    value.length > max ||
    /[\u0000]/.test(value)
  )
    fail(400, "Texto no válido");
  return value;
}
export function validPassword(p) {
  text(p, 256);
  if ([...p].length < 8)
    fail(400, "La contraseña debe tener al menos 8 caracteres");
  return p;
}
export function username(value) {
  const s = text(value, 50, 1).trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,50}$/.test(s)) fail(400, "Usuario no válido");
  return s;
}
export const publicUser = (u) => ({
  id: u.id,
  nombre: u.name,
  usuario: u.username,
  rol: u.role,
  activo: Boolean(u.active),
  cambioObligatorio: Boolean(u.must_change),
});
export async function atomic(
  db,
  auth,
  statements,
  { revision = null, admin = false, allowChange = false, importId = null } = {},
) {
  const id = random(16);
  return db.batch([
    db
      .prepare(
        "INSERT INTO mutation_guards(id,token_hash,revision,admin_only,allow_change,import_id) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        id,
        auth.hash,
        revision,
        Number(admin),
        Number(allowChange),
        importId,
      ),
    ...statements,
    db.prepare("DELETE FROM mutation_guards WHERE id=?").bind(id),
  ]);
}
export const audit = (db, auth, action, target) =>
  db
    .prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
    .bind(random(16), auth.user.id, action, target, new Date().toISOString());
export async function authenticate(req, db) {
  const token = (req.headers.get("Authorization") || "").match(
    /^Bearer ([a-f0-9]{64})$/,
  )?.[1];
  if (!token) fail(401, "Inicia sesión para continuar");
  const hash = await digest(token);
  const user = await db
    .prepare(
      "SELECT u.*, s.last_used AS session_last_used FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND u.active=1 AND s.credential_version=u.credential_version",
    )
    .bind(hash)
    .first();
  if (!user) fail(401, "Inicia sesión para continuar");
  const now = Date.now(),
    lastUsed = Date.parse(user.session_last_used);
  if (!Number.isFinite(lastUsed) || now - lastUsed >= 30 * 86400000) {
    await db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(hash)
      .run();
    fail(401, "La sesión ha caducado. Inicia sesión para continuar");
  }
  if (now - lastUsed > 86400000)
    await db
      .prepare(
        "UPDATE sessions SET last_used=? WHERE token_hash=? AND last_used=?",
      )
      .bind(new Date(now).toISOString(), hash, user.session_last_used)
      .run();
  delete user.session_last_used;
  return { user, hash };
}
