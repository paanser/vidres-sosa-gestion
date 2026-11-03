"use strict";
(() => {
  const key = "vs-tariffs-prototype-v1";
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLocaleLowerCase("es");
  function merge(current, items) {
    const result = [],
      index = new Map();
    for (const item of [...current, ...items]) {
      const name = norm(item.name);
      if (!name) continue;
      if (index.has(name)) {
        const i = index.get(name);
        result[i] = { ...result[i], ...item, id: result[i].id };
      } else {
        index.set(name, result.length);
        result.push({ ...item });
      }
    }
    return result;
  }
  window.vidresTariffs = { merge, key };
})();
