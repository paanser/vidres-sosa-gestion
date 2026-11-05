import { authenticate, atomic, fail, readJSON, digest } from "./security.js";
import { login, authRoute, usersRoute } from "./auth.js";
import {
  state,
  saveState,
  filesRoute,
  importsRoute,
  reserveQuoteNumber,
} from "./data.js";
import { D1Files } from "./d1-files.js";
import { maintenance } from "./maintenance.js";
import { interpret } from "./ai.js";
export default {
  async scheduled(controller, env, ctx) {
    const db = env.DB?.withSession
      ? env.DB.withSession("first-primary")
      : env.DB;
    ctx.waitUntil(maintenance({ ...env, FILES: env.FILES || new D1Files(db) }));
  },
  async fetch(req, env) {
    const origin = req.headers.get("Origin"),
      allowed = "https://paanser.github.io";
    const headers = {
      ...(origin === allowed ? { "Access-Control-Allow-Origin": allowed } : {}),
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, X-File-Metadata",
      "Access-Control-Expose-Headers": "Content-Disposition",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      Vary: "Origin",
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...headers,
          "Content-Type": "application/json;charset=utf-8",
        },
      });
    if (origin && origin !== allowed)
      return json({ error: "Origen no permitido" }, 403);
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    try {
      if (!env.DB) fail(503, "Servidor sin configurar");
      // Primary reads make revocation visible immediately even with D1 read replication enabled.
      const db = env.DB.withSession
        ? env.DB.withSession("first-primary")
        : env.DB;
      const path = new URL(req.url).pathname.replace(/\/$/, "") || "/";
      if (path === "/auth/login" && req.method === "POST")
        return json(await login(req, db, env));
      const auth = await authenticate(req, db);
      const authResponse = await authRoute(req, db, auth, path, env);
      if (authResponse) return json(authResponse);
      if (auth.user.must_change)
        fail(403, "Debes cambiar tu contraseña antes de continuar");
      if (path.startsWith("/admin/users")) {
        const r = await usersRoute(req, db, auth, path, env);
        if (r) return json(r);
      }
      if (path.startsWith("/admin/imports")) {
        const r = await importsRoute(req, db, auth, path);
        if (r) return json(r);
      }
      if (path === "/api/quote-number" && req.method === "POST")
        return json(await reserveQuoteNumber(req, db, auth));
      if (path === "/api/state") {
        if (req.method === "GET") return json(await state(db));
        if (req.method === "PUT") return json(await saveState(req, db, auth));
      }
      if (path.startsWith("/api/files")) {
        const storageEnv = { ...env, FILES: env.FILES || new D1Files(db) };
        const r = await filesRoute(req, storageEnv, db, auth, path);
        if (r instanceof Response) {
          const h = new Headers(r.headers);
          for (const [k, v] of Object.entries(headers)) h.set(k, v);
          return new Response(r.body, { status: r.status, headers: h });
        }
        if (r) return json(r);
      }
      if (
        (path === "/ai/interpretar" || path === "/") &&
        req.method === "POST"
      ) {
        if (!env.OPENAI_API_KEY) fail(503, "La IA no está configurada");
        const b = await readJSON(req),
          input = typeof b.text === "string" ? b.text.trim() : "";
        if (input.length < 5 || input.length > 2000)
          fail(400, "Texto demasiado corto o largo");
        const now = Date.now(),
          minute = Math.floor(now / 60000),
          month = new Date(now).toISOString().slice(0, 7);
        const keys = [
          [
            "ai-minute:" +
              minute +
              ":" +
              (await digest(req.headers.get("CF-Connecting-IP") || "sin-ip")),
            10,
            now + 120000,
          ],
          ["ai-month:" + month, 500, now + 3456000000],
        ];
        // A failed quota reservation rolls back the entire transaction, before calling OpenAI.
        await atomic(
          db,
          auth,
          keys.map(([key, max, expires]) =>
            db
              .prepare(
                `INSERT INTO quotas(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN count<? THEN count+1 ELSE -1 END`,
              )
              .bind(key, expires, max),
          ),
        );
        return json(await interpret(input, env));
      }
      return json({ error: "Ruta o método no permitido" }, 404);
    } catch (error) {
      let status = error.status || 500,
        message = error.status
          ? error.message
          : "No se pudo completar la operación";
      const codes = [
        [
          "STORAGE_FULL",
          507,
          "El espacio de archivos está lleno. Exporta una copia y elimina adjuntos que ya no necesites.",
        ],
        [
          "FILE_CONFLICT",
          409,
          "El archivo ha cambiado. Recarga antes de guardar",
        ],
        ["AUTH_REQUIRED", 401, "Inicia sesión para continuar"],
        [
          "PASSWORD_CHANGE_REQUIRED",
          403,
          "Debes cambiar tu contraseña antes de continuar",
        ],
        [
          "ADMIN_REQUIRED",
          403,
          "Solo un administrador puede gestionar usuarios",
        ],
        [
          "LAST_ADMIN",
          409,
          "No puedes eliminar ni desactivar al último administrador",
        ],
        [
          "REVISION_CONFLICT",
          409,
          "Otro dispositivo ha modificado los datos. Recarga antes de guardar; conserva tu formulario.",
        ],
        ["IMPORT_CLOSED", 409, "La importación ya está cerrada"],
        ["users.username", 409, "Ese usuario ya existe"],
        [
          "quotas.count",
          429,
          "Límite de solicitudes alcanzado. Espera antes de reintentar",
        ],
        [
          "count>=0",
          429,
          "Límite de solicitudes alcanzado. Espera antes de reintentar",
        ],
      ];
      for (const [code, s, m] of codes)
        if (String(error.message).includes(code)) {
          status = s;
          message = m;
          break;
        }
      if (String(error.message).includes("invalid-file-write")) {
        status = 409;
        message = "El archivo ha cambiado. Recarga antes de guardar";
      }
      return json({ error: message }, status);
    }
  },
};
