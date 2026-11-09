import {
  random,
  digest,
  credentials,
  passwordHash,
  equal,
  fail,
  readJSON,
  text,
  validPassword,
  username,
  publicUser,
  atomic,
  audit,
  ITERATIONS,
} from "./security.js";
export async function bootstrap(db, env) {
  if (await db.prepare("SELECT id FROM bootstrap WHERE id=1").first()) return;
  if (!env.ADMIN_INITIAL_PASSWORD)
    fail(503, "Falta configurar el administrador inicial");
  const c = await credentials(
    text(env.ADMIN_INITIAL_PASSWORD, 256, 1),
    env.PASSWORD_PEPPER,
  );
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO bootstrap(id) SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM users)",
      ),
      db
        .prepare(
          "INSERT INTO users(id,name,username,role,password_hash,salt,iterations,must_change,created_at) SELECT ?,? ,?, 'administrador',?,?,?,1,? WHERE changes()=1",
        )
        .bind(
          random(16),
          "Pau",
          "pau",
          c.hash,
          c.salt,
          c.iterations,
          new Date().toISOString(),
        ),
    ]);
  } catch (e) {
    if (!(await db.prepare("SELECT id FROM bootstrap WHERE id=1").first()))
      throw e;
  }
}
async function attempt(db, user, ip) {
  const now = Date.now(),
    window = 15 * 60000;
  const keys = await Promise.all(["user:" + user, "ip:" + ip].map(digest));
  for (const key of keys) {
    const blocked = await db
      .prepare("SELECT blocked_until FROM attempts WHERE key=?")
      .bind(key)
      .first();
    if (blocked?.blocked_until > now)
      fail(429, "Usuario o contraseña incorrectos");
  }
  const results = await db.batch(
    keys.map((key) =>
      db
        .prepare(
          `INSERT INTO attempts(key,failures,window_start,blocked_until) VALUES(?,1,?,0)
    ON CONFLICT(key) DO UPDATE SET
    failures=CASE WHEN blocked_until<=? AND window_start<=? THEN 1 ELSE failures+1 END,
    window_start=CASE WHEN blocked_until<=? AND window_start<=? THEN ? ELSE window_start END,
    blocked_until=CASE WHEN blocked_until>? THEN blocked_until WHEN window_start>? AND failures>=4 THEN ? ELSE 0 END
    RETURNING failures,blocked_until`,
        )
        .bind(
          key,
          now,
          now,
          now - window,
          now,
          now - window,
          now,
          now,
          now - window,
          now + window,
        ),
    ),
  );
  if (results.some((r) => r.results[0].failures > 5))
    fail(429, "Usuario o contraseña incorrectos");
  return keys;
}
export async function login(req, db, env) {
  const body = await readJSON(req);
  // Bound malformed logins are also counted, without revealing whether a username exists.
  const supplied =
    typeof body.usuario === "string"
      ? body.usuario.trim().toLowerCase().slice(0, 100)
      : "";
  const keys = await attempt(
    db,
    supplied,
    req.headers.get("CF-Connecting-IP") || "sin-ip",
  );
  await bootstrap(db, env);
  const user = await db
    .prepare("SELECT * FROM users WHERE username=?")
    .bind(supplied)
    .first();
  const password =
    typeof body.password === "string" && body.password.length <= 256
      ? body.password
      : "";
  const candidate = await passwordHash(
    password,
    user?.salt || "dummy-salt-for-unknown-user",
    user?.iterations || ITERATIONS,
    env.PASSWORD_PEPPER,
  );
  if (!user || !user.active || !equal(candidate, user.password_hash))
    fail(401, "Usuario o contraseña incorrectos");
  const token = random(),
    hash = await digest(token);
  const results = await db.batch([
    db
      .prepare(
        "INSERT INTO sessions(token_hash,user_id,credential_version,created_at) SELECT ?,id,credential_version,? FROM users WHERE id=? AND active=1 AND credential_version=? AND password_hash=?",
      )
      .bind(
        hash,
        new Date().toISOString(),
        user.id,
        user.credential_version,
        user.password_hash,
      ),
    ...keys.map((key) =>
      db
        .prepare(
          "UPDATE attempts SET blocked_until=CASE WHEN failures<=5 THEN 0 ELSE blocked_until END, failures=MAX(0,failures-1) WHERE key=?",
        )
        .bind(key),
    ),
  ]);
  if (results[0].meta.changes !== 1)
    fail(401, "Usuario o contraseña incorrectos");
  return { token, user: publicUser(user) };
}
export async function authRoute(req, db, auth, path, env) {
  if (path === "/auth/me" && req.method === "GET")
    return { user: publicUser(auth.user) };
  if (path === "/auth/logout" && req.method === "POST") {
    await atomic(
      db,
      auth,
      [db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(auth.hash)],
      { allowChange: true },
    );
    return { ok: true };
  }
  if (path === "/auth/change-password" && req.method === "POST") {
    const body = await readJSON(req),
      next = validPassword(body.password);
    const old = text(body.actual, 256, 1);
    if (
      !equal(
        await passwordHash(
          old,
          auth.user.salt,
          auth.user.iterations,
          env.PASSWORD_PEPPER,
        ),
        auth.user.password_hash,
      )
    )
      fail(400, "Contraseña actual incorrecta");
    if (
      equal(
        await passwordHash(
          next,
          auth.user.salt,
          auth.user.iterations,
          env.PASSWORD_PEPPER,
        ),
        auth.user.password_hash,
      )
    )
      fail(400, "La contraseña nueva debe ser distinta");
    const c = await credentials(next, env.PASSWORD_PEPPER),
      token = random();
    await atomic(
      db,
      auth,
      [
        db
          .prepare(
            "UPDATE users SET password_hash=?,salt=?,iterations=?,must_change=0,credential_version=credential_version+1 WHERE id=?",
          )
          .bind(c.hash, c.salt, c.iterations, auth.user.id),
        db.prepare("DELETE FROM sessions WHERE user_id=?").bind(auth.user.id),
        db
          .prepare(
            "INSERT INTO sessions(token_hash,user_id,credential_version,created_at) SELECT ?,id,credential_version,? FROM users WHERE id=?",
          )
          .bind(await digest(token), new Date().toISOString(), auth.user.id),
        audit(db, auth, "password-change", auth.user.id),
      ],
      { allowChange: true },
    );
    return { token, user: publicUser({ ...auth.user, must_change: 0 }) };
  }
  return null;
}
export async function usersRoute(req, db, auth, path, env) {
  if (auth.user.role !== "administrador")
    fail(403, "Solo un administrador puede gestionar usuarios");
  if (path === "/admin/users" && req.method === "GET") {
    const { results } = await db
      .prepare("SELECT * FROM users ORDER BY username")
      .all();
    return { users: results.map(publicUser) };
  }
  if (path === "/admin/users" && req.method === "POST") {
    const b = await readJSON(req),
      c = await credentials(validPassword(b.password), env.PASSWORD_PEPPER),
      id = random(16);
    const role = b.rol;
    if (!["administrador", "empleado"].includes(role))
      fail(400, "Rol no válido");
    const name = text(b.nombre, 100, 1).trim();
    if (!name) fail(400, "Nombre obligatorio");
    await atomic(
      db,
      auth,
      [
        db
          .prepare(
            "INSERT INTO users(id,name,username,role,password_hash,salt,iterations,created_at) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            name,
            username(b.usuario),
            role,
            c.hash,
            c.salt,
            c.iterations,
            new Date().toISOString(),
          ),
        audit(db, auth, "user-create", id),
      ],
      { admin: true },
    );
    return { ok: true };
  }
  const match = path.match(/^\/admin\/users\/([a-f0-9]{32})(\/password)?$/);
  if (!match) return null;
  const id = match[1],
    user = await db.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  if (!user) fail(404, "Usuario no encontrado");
  let statements = [];
  if (match[2] && req.method === "POST") {
    const b = await readJSON(req),
      c = await credentials(validPassword(b.password), env.PASSWORD_PEPPER);
    statements = [
      db
        .prepare(
          "UPDATE users SET password_hash=?,salt=?,iterations=?,must_change=0,credential_version=credential_version+1 WHERE id=?",
        )
        .bind(c.hash, c.salt, c.iterations, id),
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id),
      audit(db, auth, "user-password", id),
    ];
  } else if (!match[2] && req.method === "DELETE") {
    statements = [
      db.prepare("DELETE FROM users WHERE id=?").bind(id),
      audit(db, auth, "user-delete", id),
    ];
  } else if (!match[2] && req.method === "PATCH") {
    const b = await readJSON(req);
    if (typeof b.activo !== "boolean") fail(400, "Estado no válido");
    statements = [
      db
        .prepare(
          "UPDATE users SET active=?,credential_version=credential_version+1 WHERE id=?",
        )
        .bind(Number(b.activo), id),
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id),
      audit(db, auth, "user-active", id),
    ];
  } else return null;
  await atomic(db, auth, statements, { admin: true });
  return { ok: true };
}
