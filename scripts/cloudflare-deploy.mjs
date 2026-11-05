import fs from "node:fs/promises";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const token = process.env.CLOUDFLARE_API_TOKEN;
const messages = [];
const say = (value) => {
  console.log(value);
  messages.push(value);
};
async function api(route, method = "GET", body, allow404 = false) {
  const response = await fetch("https://api.cloudflare.com/client/v4" + route, {
    method,
    redirect: "error",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (allow404 && response.status === 404) return null;
  if (!response.ok || result.success === false) {
    const codes = (result.errors || []).map((e) => String(e.code)).join(",");
    throw Error(
      "Cloudflare rechazó " +
        method +
        " " +
        route +
        " (HTTP " +
        response.status +
        (codes ? ", códigos " + codes : "") +
        "). Comprueba permisos, cuenta y activación del servicio.",
    );
  }
  return result.result;
}
async function wrangler(args, account) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/wrangler/bin/wrangler.js", ...args],
      {
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    // Never relay raw CLI errors or request dumps from a process with credentials.
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.resume();
    child.on("error", () => reject(Error("No se pudo iniciar Wrangler")));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            Error(
              "Wrangler no pudo completar " +
                args[0] +
                ". Comprueba el plan de Workers, la configuración y permisos. No se ha publicado la interfaz.",
            ),
          ),
    );
  });
}
async function main() {
  if (!token) throw Error("Falta el secreto de GitHub CLOUDFLARE_API_TOKEN");
  const verified = await api("/user/tokens/verify");
  if (verified.status !== "active") throw Error("El token no está activo");
  say("Token de Cloudflare verificado: activo.");
  let account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!account) {
    try {
      account = JSON.parse(
        await fs.readFile("worker/account.json", "utf8"),
      ).account_id;
    } catch {}
  }
  if (!account || !/^[a-f0-9]{32}$/.test(account))
    throw Error(
      "Falta el Account ID de Cloudflare. Añádelo como variable de GitHub CLOUDFLARE_ACCOUNT_ID o en worker/account.json. No es una contraseña.",
    );
  const prefix = "/accounts/" + account;
  // Check all required initial configuration before modifying the running Worker.
  const databaseList = await api(prefix + "/d1/database?per_page=100");
  let database = databaseList.find((db) => db.name === "vidres-sosa");
  if (!database && !process.env.ADMIN_INITIAL_PASSWORD)
    throw Error(
      "Falta el secreto GitHub ADMIN_INITIAL_PASSWORD para el primer arranque. No se ha modificado el Worker.",
    );
  if (!database)
    database = await api(prefix + "/d1/database", "POST", {
      name: "vidres-sosa",
    });
  const databaseId = database.uuid || database.id;
  if (!/^[a-f0-9-]{36}$/.test(databaseId || ""))
    throw Error("Cloudflare no devolvió un identificador D1 válido");
  say("Base de datos D1 localizada o creada.");
  const bucketName = "vidres-sosa-privado",
    buckets = await api(prefix + "/r2/buckets");
  if (!(buckets.buckets || []).some((bucket) => bucket.name === bucketName))
    await api(prefix + "/r2/buckets", "POST", { name: bucketName });
  const managed = await api(
    prefix + "/r2/buckets/" + bucketName + "/domains/managed",
  );
  const domains = await api(
    prefix + "/r2/buckets/" + bucketName + "/domains/custom",
  );
  if (
    managed.enabled ||
    (domains.domains || []).some((domain) => domain.enabled)
  )
    throw Error(
      "El bucket tiene acceso público. Desactívalo antes de continuar; no se han subido datos.",
    );
  say("Bucket R2 privado comprobado.");
  const config = {
    name: "vidres-sosa-ia",
    account_id: account,
    main: "worker.js",
    compatibility_date: "2026-11-04",
    workers_dev: true,
    triggers: { crons: ["0 3 * * *"] },
    vars: { ALLOWED_ORIGIN: "https://paanser.github.io" },
    d1_databases: [
      {
        binding: "DB",
        database_name: "vidres-sosa",
        database_id: databaseId,
        migrations_dir: "migrations",
      },
    ],
    r2_buckets: [{ binding: "FILES", bucket_name: bucketName }],
    limits: { cpu_ms: 100 },
    observability: { enabled: false },
  };
  const configFile = "worker/wrangler.deploy.json";
  await fs.writeFile(configFile, JSON.stringify(config, null, 2) + "\n");
  await wrangler(
    [
      "d1",
      "migrations",
      "apply",
      "vidres-sosa",
      "--remote",
      "--config",
      configFile,
    ],
    account,
  );
  say("Migraciones D1 aplicadas.");
  const query = await api(
    prefix + "/d1/database/" + databaseId + "/query",
    "POST",
    { sql: "SELECT COUNT(*) AS count FROM users" },
  );
  const count = query[0]?.results[0]?.count;
  if (!Number.isInteger(count))
    throw Error("No se pudo comprobar el estado de usuarios");
  const secretsRoute = prefix + "/workers/scripts/vidres-sosa-ia/secrets";
  const existing = (await api(secretsRoute, "GET", undefined, true)) || [];
  const secretNames = new Set(existing.map((secret) => secret.name));
  if (count > 0 && !secretNames.has("PASSWORD_PEPPER"))
    throw Error(
      "Hay usuarios, pero falta el pepper original. Restáuralo; no se generará otro.",
    );
  if (
    count === 0 &&
    !secretNames.has("ADMIN_INITIAL_PASSWORD") &&
    !process.env.ADMIN_INITIAL_PASSWORD
  )
    throw Error(
      "Falta el secreto GitHub ADMIN_INITIAL_PASSWORD para activar el primer usuario.",
    );
  await wrangler(["deploy", "--config", configFile], account);
  say("Worker desplegado con autenticación.");
  const putSecret = (name, value) =>
    api(secretsRoute, "PUT", { name, type: "secret_text", text: value });
  if (!secretNames.has("PASSWORD_PEPPER"))
    await putSecret("PASSWORD_PEPPER", crypto.randomBytes(32).toString("hex"));
  if (count === 0 && !secretNames.has("ADMIN_INITIAL_PASSWORD"))
    await putSecret(
      "ADMIN_INITIAL_PASSWORD",
      process.env.ADMIN_INITIAL_PASSWORD,
    );
  if (!secretNames.has("OPENAI_API_KEY") && process.env.OPENAI_API_KEY)
    await putSecret("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  say(
    "Secretos necesarios configurados sin mostrar sus valores; secretos existentes conservados.",
  );
  const origin = { Origin: "https://paanser.github.io" },
    endpoint = "https://vidres-sosa-ia.pausosagomez.workers.dev";
  for (const route of [
    "/api/state",
    "/api/files",
    "/admin/users",
    "/ai/interpretar",
  ]) {
    const response = await fetch(endpoint + route, {
      method: route === "/ai/interpretar" ? "POST" : "GET",
      redirect: "error",
      headers: {
        ...origin,
        ...(route === "/ai/interpretar"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(route === "/ai/interpretar"
        ? { body: JSON.stringify({ text: "Parte ficticio de comprobación" }) }
        : {}),
      signal: AbortSignal.timeout(30000),
    });
    if (response.status !== 401)
      throw Error(
        "La comprobación sin sesión falló en " +
          route +
          " (HTTP " +
          response.status +
          ")",
      );
  }
  say(
    "Verificado: datos, archivos, usuarios e IA rechazan peticiones sin sesión (401).",
  );
  say(
    count === 0
      ? "Backend preparado. Falta el primer login y cambio obligatorio de contraseña antes de publicar la interfaz."
      : "Backend actualizado. La interfaz puede publicarse después de verificar el acceso de un administrador.",
  );
}
try {
  await main();
} catch (error) {
  say("ERROR: " + error.message);
  process.exitCode = 1;
} finally {
  if (process.env.GITHUB_STEP_SUMMARY)
    await fs.appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      messages.map((m) => "- " + m).join("\n") + "\n",
    );
}
