"use strict";
(() => {
  let cache = [];
  const ready = VSAuth.json("/api/files").then((r) => (cache = r.files));
  const clean = ({
    blob,
    kind,
    size,
    sha256,
    version,
    importId,
    ...metadata
  }) => metadata;
  async function getBlob(item) {
    const response = await VSAuth.request("/api/files/" + item.id);
    return response.blob();
  }
  async function all(kind, filter = {}) {
    await ready;
    return Promise.all(
      cache
        .filter(
          (x) =>
            x.kind === kind &&
            Object.entries(filter).every(([key, value]) => x[key] === value),
        )
        .map(async (item) => ({ ...clean(item), blob: await getBlob(item) })),
    );
  }
  async function uploadInner(kind, item, importId) {
    const old = cache.find((x) => x.id === item.id),
      id = importId
        ? crypto.randomUUID().replaceAll("-", "")
        : item.id.replaceAll("-", "");
    // New identifiers supplied by the old app are UUIDs; preserve a stable id after first upload.
    const actualId = /^[a-f0-9]{32}$/.test(id)
      ? id
      : crypto.randomUUID().replaceAll("-", "");
    const meta = {
      ...clean(item),
      kind,
      version: old?.version || 0,
      importId,
      revision: VSStorage.revision(),
    };
    const response = await VSAuth.request("/api/files/" + actualId, {
      method: "PUT",
      headers: {
        "Content-Type": item.blob.type || "application/octet-stream",
        "X-File-Metadata": encodeURIComponent(JSON.stringify(meta)),
      },
      body: item.blob,
    });
    const result = await response.json();
    if (!importId) {
      VSStorage.advanceRevision(result.revision);
      cache = cache.filter((x) => x.id !== item.id && x.id !== actualId);
      cache.push({
        ...meta,
        id: actualId,
        size: item.blob.size,
        sha256: result.sha256,
        version: (old?.version || 0) + 1,
      });
    }
    return { id: actualId, sha256: result.sha256, size: item.blob.size };
  }
  async function upload(kind, item, importId) {
    return importId
      ? uploadInner(kind, item, importId)
      : VSStorage.runMutation(() => uploadInner(kind, item));
  }
  async function remove(kind, id) {
    await ready;
    return VSStorage.runMutation(async () => {
      const r = await VSAuth.json("/api/files/" + id, "DELETE", {
        revision: VSStorage.revision(),
      });
      VSStorage.advanceRevision(r.revision);
      cache = cache.filter((x) => !(x.id === id && x.kind === kind));
    });
  }
  async function replace(kind, items) {
    await ready;
    for (const old of cache.filter((x) => x.kind === kind))
      if (!items.some((x) => x.id === old.id)) await remove(kind, old.id);
    for (const item of items) await upload(kind, item);
  }
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file),
        img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height)),
          canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(Error("No se pudo comprimir la imagen")),
          "image/jpeg",
          0.72,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(Error("Imagen no válida"));
      };
      img.src = url;
    });
  }
  window.VSFiles = {
    ready,
    all,
    put: async (kind, item) => {
      await ready;
      return upload(kind, item);
    },
    remove,
    replace,
    compressImage,
    upload,
    clear() {
      cache = [];
    },
    async refresh() {
      cache = (await VSAuth.json("/api/files")).files;
    },
  };
})();
