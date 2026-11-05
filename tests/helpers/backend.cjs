const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
class D1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec(
      fs.readFileSync(
        require("node:path").join(
          __dirname,
          "../../worker/migrations/0001_auth_data.sql",
        ),
        "utf8",
      ),
    );
  }
  withSession() {
    return this;
  }
  prepare(sql) {
    const db = this.db;
    return {
      args: [],
      bind(...args) {
        this.args = args;
        return this;
      },
      async first() {
        return db.prepare(sql).get(...this.args) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...this.args) };
      },
      async run() {
        const stmt = db.prepare(sql);
        const results = stmt.columns().length ? stmt.all(...this.args) : [];
        if (!stmt.columns().length) stmt.run(...this.args);
        return {
          results,
          meta: { changes: db.prepare("SELECT changes() c").get().c },
        };
      },
    };
  }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const out = [];
      for (const stmt of statements) out.push(await stmt.run());
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
function setup() {
  const map = new Map();
  return {
    DB: new D1(),
    PASSWORD_PEPPER: "fixture-only-pepper-not-a-production-secret",
    ADMIN_INITIAL_PASSWORD: "temporary-fixture",
    OPENAI_API_KEY: "fixture-not-a-key",
    FILES: {
      async put(key, bytes) {
        map.set(key, new Uint8Array(bytes));
      },
      async get(key) {
        const v = map.get(key);
        return v ? { body: new Blob([v]).stream() } : null;
      },
      async delete(key) {
        map.delete(key);
      },
    },
    map,
  };
}
module.exports = { D1, setup };
