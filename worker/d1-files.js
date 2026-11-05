import { Buffer } from "node:buffer";
import { fail } from "./security.js";
const CHUNK = 256 * 1024;
export class D1Files {
  constructor(db) {
    this.db = db;
  }
  async put(key, bytes) {
    if (bytes.byteLength > 8_000_000)
      fail(413, "El archivo supera el máximo de 8 MB");
    const source = Buffer.from(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      ),
      chunks = [];
    for (let offset = 0; offset < source.length; offset += CHUNK)
      chunks.push({
        ordinal: chunks.length,
        data: source.subarray(offset, offset + CHUNK).toString("base64"),
      });
    const size = chunks.reduce((n, c) => n + c.data.length, 0);
    const statements = [
      this.db
        .prepare(
          "INSERT INTO file_objects(key,size,encoded_size,uploaded) VALUES(?,?,?,?)",
        )
        .bind(key, source.length, size, new Date().toISOString()),
    ];
    // Three encoded chunks per parameter, below D1's 2 MB per-value limit.
    for (let i = 0; i < chunks.length; i += 3)
      statements.push(
        this.db
          .prepare(
            "INSERT INTO file_chunks(object_key,ordinal,data) SELECT ?,json_extract(value,'$.ordinal'),json_extract(value,'$.data') FROM json_each(?)",
          )
          .bind(key, JSON.stringify(chunks.slice(i, i + 3))),
      );
    await this.db.batch(statements);
  }
  async get(key) {
    const { results } = await this.db
      .prepare(
        "SELECT o.size,c.data FROM file_objects o LEFT JOIN file_chunks c ON c.object_key=o.key WHERE o.key=? ORDER BY c.ordinal",
      )
      .bind(key)
      .all();
    if (!results.length) return null;
    let index = 0;
    return {
      body: new ReadableStream({
        pull(controller) {
          if (index === results.length) {
            controller.close();
            return;
          }
          const encoded = results[index++].data;
          if (encoded !== null)
            controller.enqueue(Buffer.from(encoded, "base64"));
        },
      }),
    };
  }
  async delete(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    if (!list.length) return;
    // Bounded parameters and one query per batch keep cleanup within Workers Free limits.
    for (let i = 0; i < list.length; i += 100) {
      const group = list.slice(i, i + 100);
      await this.db
        .prepare(
          "DELETE FROM file_objects WHERE key IN(" +
            group.map(() => "?").join(",") +
            ")",
        )
        .bind(...group)
        .run();
    }
  }
  async list({ cursor = "", limit = 100 } = {}) {
    const { results } = await this.db
      .prepare(
        "SELECT key,uploaded FROM file_objects WHERE key>? ORDER BY key LIMIT ?",
      )
      .bind(cursor, Math.min(limit, 100) + 1)
      .all();
    const truncated = results.length > limit,
      objects = results
        .slice(0, limit)
        .map((x) => ({ key: x.key, uploaded: new Date(x.uploaded) }));
    return {
      objects,
      truncated,
      cursor: truncated ? objects.at(-1).key : undefined,
    };
  }
}
