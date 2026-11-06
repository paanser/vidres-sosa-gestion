"use strict";
(() => {
  async function readDB(name, store) {
    if (indexedDB.databases) {
      const names = await indexedDB.databases();
      if (!names.some((d) => d.name === name)) return [];
    }
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(name);
      let missing = false;
      r.onupgradeneeded = () => {
        missing = true;
        r.transaction.abort();
      };
      r.onerror = () =>
        missing ? resolve([]) : reject(Error("No se pudo leer la copia local"));
      r.onsuccess = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(store)) {
          db.close();
          resolve([]);
          return;
        }
        const tx = db.transaction(store),
          q = tx.objectStore(store).getAll();
        q.onsuccess = () => {
          db.close();
          resolve(q.result);
        };
        q.onerror = () => {
          db.close();
          reject(q.error);
        };
      };
    });
  }
  async function localData() {
    const meta = await readDB("vidres-gestion-v1", "meta");
    if (meta.some((value) => value?.format === "vidres-sosa-backup"))
      throw Error(
        "Hay una recuperación local pendiente. Conserva el dispositivo y exporta una copia coherente desde la versión anterior antes de importar.",
      );

    const data = { format: "vidres-sosa-backup", version: 2 };
    for (const [name, key] of Object.entries(VSBackup.keys)) {
      const raw = localStorage.getItem(key),
        fallback = ["configuracion", "numeracion"].includes(name) ? {} : [];
      if (!raw) {
        data[name] = fallback;
        continue;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      data[name] =
        parsed && Array.isArray(parsed) === Array.isArray(fallback)
          ? parsed
          : fallback;
    }
    const measures = await readDB("vidres-gestion-v1", "mediciones"),
      legacy = JSON.parse(localStorage.getItem("vidres-mediciones-v1") || "[]");
    const merged = new Map(measures.map((x) => [x.id, x]));
    for (const m of legacy) {
      if (
        merged.has(m.id) &&
        JSON.stringify(merged.get(m.id)) !== JSON.stringify(m)
      )
        throw Error(
          "Hay versiones locales distintas de la medición " +
            m.id +
            ". Exporta y resuelve el conflicto antes de importar.",
        );
      merged.set(m.id, m);
    }
    data.mediciones = [...merged.values()];
    data.photos = await readDB("vidres-fotos-v1", "fotos");
    data.documents = await readDB("vidres-documentos-v1", "documentos");
    // validate() accepts binary files separately; never deletes or rewrites source stores.
    return VSBackup.validate(data);
  }
  let importing = false;
  async function importData(data) {
    if (importing) throw Error("Ya hay una importación en curso");
    if (VSAuth.user.rol !== "administrador")
      throw Error("Solo un administrador puede importar");
    const before = await VSBackup.snapshot(),
      after = { ...before };
    for (const k of [
      ...Object.keys(VSBackup.keys),
      "mediciones",
      "photos",
      "documents",
    ])
      if (data[k] !== undefined) after[k] = data[k];
    const current = new Map(before.trabajos.map((j) => [j.id, j])),
      conflicts = after.trabajos
        .filter(
          (j) =>
            current.has(j.id) &&
            JSON.stringify(current.get(j.id)) !== JSON.stringify(j),
        )
        .map((j) => j.id),
      removed = before.trabajos
        .filter((j) => !after.trabajos.some((x) => x.id === j.id))
        .map((j) => j.id);
    const summary = `La importación sustituirá los datos del servidor por los de esta copia.\n\n${after.trabajos.length} trabajos, ${after.clientes.length} clientes, ${after.mediciones.length} mediciones, ${after.presupuestos.length} presupuestos, ${after.photos.length} fotos y ${after.documents.length} documentos.\n\nTrabajos con contenido diferente: ${conflicts.slice(0, 30).join(", ") || "ninguno"}${conflicts.length > 30 ? "…" : ""}.\nTrabajos actuales ausentes en la copia: ${removed.slice(0, 30).join(", ") || "ninguno"}${removed.length > 30 ? "…" : ""}.\n\nAntes se descargará una copia completa del servidor. Los originales locales se conservarán. ¿Continuar?`;
    if (!confirm(summary)) return;
    VSBackup.download(
      await VSBackup.encode(before, true),
      "vidres-antes-de-migrar-" + Date.now() + ".json",
    );
    if (
      !confirm(
        "Comprueba que la copia anterior está en Descargas. ¿Confirmas la importación al servidor?",
      )
    )
      return;
    importing = true;
    let imp;
    try {
      imp = await VSAuth.json("/admin/imports", "POST", {
        revision: VSStorage.revision(),
      });
      const manifest = [];
      const status = document.querySelector("#migration-status");
      for (const kind of ["photos", "documents"])
        for (const item of after[kind]) {
          if (status)
            status.textContent =
              "Subiendo y verificando archivos: " + (manifest.length + 1) + "…";
          const bytes = await item.blob.arrayBuffer(),
            hash = Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
              (b) => b.toString(16).padStart(2, "0"),
            ).join("");
          const record = await VSFiles.upload(kind, item, imp.id);
          if (record.sha256 !== hash || record.size !== item.blob.size)
            throw Error("No se pudo verificar el archivo " + item.nombre);
          manifest.push(record);
        }
      await VSAuth.json("/admin/imports/" + imp.id, "POST", {
        values: VSBackup.toValues(after),
        files: manifest,
      });
      alert(
        "Importación verificada y completada. Los datos locales originales se han conservado.",
      );
      location.reload();
    } catch (e) {
      if (imp)
        await VSAuth.json("/admin/imports/" + imp.id, "DELETE").catch(() => {});
      throw Error(
        "No se pudo confirmar la importación: " +
          e.message +
          " Comprueba el estado del servidor antes de repetirla.",
      );
    } finally {
      importing = false;
    }
  }
  window.VSMigration = { localData, importData };
})();
