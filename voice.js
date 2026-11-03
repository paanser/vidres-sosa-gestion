"use strict";
(() => {
  const dialog = document.querySelector("#editor"),
    form = document.querySelector("#form");
  const button = document.querySelector("#voice-start"),
    stop = document.querySelector("#voice-stop"),
    apply = document.querySelector("#voice-apply"),
    transcript = document.querySelector("#voice-transcript"),
    message = document.querySelector("#voice-message");
  const aiButton = document.querySelector("#voice-ai");
  let accessCode = "";
  const SESSION_KEY = "vidres-ai-access-session";
  try {
    accessCode = sessionStorage.getItem(SESSION_KEY) || "";
  } catch {}
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null,
    listening = false,
    base = "";
  const setMessage = (s) => (message.textContent = s);
  const clean = (s) =>
    String(s || "")
      .trim()
      .replace(/^[\s,.;:]+|[\s,.;:]+$/g, "")
      .replace(/\s+/g, " ");
  const specs = [
    {
      key: "cliente",
      re: /\b(?:el cliente(?: se llama| es)?|la clienta(?: se llama| es)?|(?:se llama|a nombre de|es para|para el señor|para la señora|para la clienta|para el cliente|cliente|clienta|nombre del cliente)\s*)/gi,
    },
    {
      key: "direccion",
      re: /\b(?:direcci[oó]n(?: es)?|domicilio(?: es)?|(?:est[aá]|queda|vive|viven|est[aá] ubicado|est[aá] situada)\s+en|en la direcci[oó]n|en (?:la )?(?:calle|avenida|av\.?|paseo|plaza|rambla|carretera|camino|pol[ií]gono)\b)/gi,
    },
    {
      key: "descripcion",
      re: /\b(?:hay que|tenemos que|se tiene que|necesita(?:mos)?|quiere(?:n)?|trabajo(?: a realizar)?(?: es)?|descripci[oó]n(?: es)?|(?:vamos a|toca)\s+(?:instalar|cambiar|colocar|sustituir|reparar|medir))/gi,
    },
    {
      key: "responsable",
      re: /\b(?:responsable(?: es)?|lo har[aá]|lo hace|lo lleva|se encarga|operario(?: es)?|t[eé]cnico(?: es)?)/gi,
    },
    {
      key: "notas",
      re: /\b(?:observaciones|notas|comentarios|importante|ten en cuenta|avisar que)/gi,
    },
    {
      key: "fecha",
      re: /\b(?:fecha prevista|fecha(?: es)?|para el d[ií]a|el d[ií]a)\s*/gi,
    },
    { key: "estado", re: /\b(?:estado(?: es)?|situaci[oó]n(?: es)?)\s*/gi },
  ];
  const street =
    /\b(?:calle|avenida|av\.?|paseo|plaza|rambla|carretera|camino|pol[ií]gono)\b/i;
  const action =
    /\b(?:cambiar|sustituir|instalar|colocar|reparar|medir|montar|fabricar|poner|quitar|retirar|hacer|presupuestar)\b/i;
  function parse(text) {
    const found = [];
    for (const spec of specs) {
      spec.re.lastIndex = 0;
      let m;
      while ((m = spec.re.exec(text)) !== null) {
        found.push({
          key: spec.key,
          start: m.index,
          end: m.index + m[0].length,
          raw: m[0],
        });
        if (m[0].length === 0) spec.re.lastIndex++;
      }
    }
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    const filtered = [];
    for (const f of found) {
      if (filtered.length && f.start < filtered[filtered.length - 1].end)
        continue;
      filtered.push(f);
    }
    const values = {},
      uncertain = [];
    for (let i = 0; i < filtered.length; i++) {
      const f = filtered[i],
        next = filtered[i + 1];
      let value = clean(text.slice(f.end, next ? next.start : text.length));
      value = value.replace(/^(?:es|ser[aá]|que|de|en|para|a)\s+/i, "").trim();
      if (
        f.key === "direccion" &&
        /\ben (?:la )?(?:calle|avenida|av\.?|paseo|plaza|rambla|carretera|camino|pol[ií]gono)\b/i.test(
          f.raw,
        )
      ) {
        const streetName = f.raw.match(
          /(?:calle|avenida|av\.?|paseo|plaza|rambla|carretera|camino|pol[ií]gono)/i,
        );
        if (streetName) value = streetName[0] + " " + value;
      }
      if (f.key === "cliente")
        value = value.replace(/^(?:de|del|la|el)\s+/i, "");
      if (value && !values[f.key]) values[f.key] = value;
    }
    // Detect a street even when it was spoken without "dirección".
    if (!values.direccion) {
      const m = text.match(
        /\b(?:calle|avenida|av\.?|paseo|plaza|rambla|carretera|camino|pol[ií]gono)\s+[^,.;\n]+/i,
      );
      if (m) values.direccion = clean(m[0]);
    }
    // For unstructured speech, infer the task from a recognizable work verb.
    if (!values.descripcion) {
      const sentences = text
        .split(/[.;\n]/)
        .map(clean)
        .filter(Boolean);
      const candidate = sentences.find((s) => action.test(s));
      if (candidate)
        values.descripcion = candidate.replace(
          /^(?:pues|mira|hola|bueno|tengo un trabajo|nuevo parte|necesito un parte)\s*,?\s*/i,
          "",
        );
    }
    if (!values.cliente) {
      const m = text.match(
        /\b(?:para|de)\s+((?:don|doña|señor|señora)\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})(?=\s*[,.;]|$)/,
      );
      if (m && !street.test(m[0])) values.cliente = clean(m[2]);
    }
    if (values.estado) {
      const s = values.estado.toLowerCase();
      const options = [...form.elements.estado.options].map((o) => o.value);
      values.estado =
        options.find((v) => v.toLowerCase() === s) ||
        options.find((v) => s.includes(v.toLowerCase())) ||
        "";
    }
    if (values.fecha) {
      const v = values.fecha.trim(),
        es = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? v
        : es
          ? es[3] + "-" + es[2].padStart(2, "0") + "-" + es[1].padStart(2, "0")
          : "";
      if (iso && !Number.isNaN(new Date(iso + "T12:00:00").getTime()))
        values.fecha = iso;
      else {
        uncertain.push("fecha");
        delete values.fecha;
      }
    }
    for (const k of ["cliente", "direccion", "descripcion"]) {
      if (values[k] && values[k].length > form.elements[k].maxLength) {
        uncertain.push(k);
        values[k] = values[k].slice(0, form.elements[k].maxLength);
      }
    }
    if (!values.descripcion && text.trim()) uncertain.push("descripción");
    return { values, uncertain };
  }
  function stopListening() {
    if (recognition && listening) recognition.stop();
    listening = false;
    button.disabled = false;
    stop.disabled = true;
  }
  button.addEventListener("click", () => {
    if (!Recognition) {
      setMessage(
        "Este navegador no ofrece reconocimiento automático. Usa el micrófono del teclado para dictar en el cuadro de texto.",
      );
      transcript.focus();
      return;
    }
    base = transcript.value.trim();
    recognition = new Recognition();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let final = "",
        interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const part = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += part + " ";
        else interim += part;
      }
      if (final) base = (base + " " + final).trim();
      transcript.value = (base + " " + interim).trim();
    };
    recognition.onerror = (event) => {
      setMessage(
        event.error === "not-allowed"
          ? "Permiso de micrófono denegado."
          : "No se pudo reconocer la voz (" +
              event.error +
              "). Puedes dictar con el teclado.",
      );
      stopListening();
    };
    recognition.onend = () => {
      listening = false;
      button.disabled = false;
      stop.disabled = true;
    };
    try {
      recognition.start();
      listening = true;
      button.disabled = true;
      stop.disabled = false;
      setMessage("Escuchando. Detén el dictado cuando termines.");
    } catch {
      setMessage(
        "No se pudo activar el micrófono. Usa el dictado del teclado.",
      );
    }
  });
  stop.addEventListener("click", stopListening);
  aiButton.addEventListener("click", async () => {
    stopListening();
    const endpoint = window.VIDRES_AI_ENDPOINT;
    if (!endpoint) {
      setMessage(
        "La IA todavía no está conectada. Falta configurar el servidor Cloudflare. Puedes usar «Rellenar campos para revisar» mientras tanto.",
      );
      return;
    }
    const text = transcript.value.trim();
    if (text.length < 5) {
      setMessage("Primero dicta un parte de al menos cinco caracteres.");
      return;
    }
    if (!accessCode) {
      accessCode =
        window.prompt(
          "Código privado de acceso IA (se recordará durante esta sesión):",
        ) || "";
      if (!accessCode) return;
      try {
        sessionStorage.setItem(SESSION_KEY, accessCode);
      } catch {}
    }
    aiButton.disabled = true;
    setMessage("Interpretando el parte con IA…");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Access-Code": accessCode,
        },
        body: JSON.stringify({ text }),
      });
      const raw = await response.text();
      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        throw new Error(
          "El servidor respondió HTTP " +
            response.status +
            " con una respuesta no válida.",
        );
      }
      if (!response.ok) {
        if (response.status === 401) {
          accessCode = "";
          try {
            sessionStorage.removeItem(SESSION_KEY);
          } catch {}
        }
        throw new Error(
          "HTTP " +
            response.status +
            ": " +
            (result.error || "No se pudo interpretar"),
        );
      }
      let count = 0;
      for (const k of [
        "cliente",
        "descripcion",
        "direccion",
        "responsable",
        "fecha",
        "estado",
        "notas",
      ]) {
        const field = form.elements[k],
          value = result.fields?.[k];
        if (field && typeof value === "string" && value.trim()) {
          if (k === "fecha" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
          if (
            k === "estado" &&
            ![...field.options].some((o) => o.value === value)
          )
            continue;
          field.value = value.slice(
            0,
            field.maxLength > 0 ? field.maxLength : 1000,
          );
          count++;
        }
      }
      try {
        const key = "vidres-ai-success-" + new Date().toISOString().slice(0, 7);
        localStorage.setItem(
          key,
          String(Number(localStorage.getItem(key) || 0) + 1),
        );
        window.dispatchEvent(new Event("vidres-ai-usage"));
      } catch {}
      setMessage(
        "IA: " +
          count +
          " campos identificados. Revisa cliente, dirección, medidas y fecha antes de pulsar Guardar.",
      );
    } catch (err) {
      const network =
        err instanceof TypeError ||
        /Load failed|Failed to fetch|NetworkError/i.test(err.message);
      setMessage(
        network
          ? "Error de conexión con Cloudflare (no es necesariamente la contraseña). Comprueba la URL del Worker y los registros de peticiones. Detalle: " +
              err.message
          : "No se ha podido usar la IA: " +
              err.message +
              ". Puedes utilizar el método básico.",
      );
    } finally {
      aiButton.disabled = false;
    }
  });
  apply.addEventListener("click", () => {
    stopListening();
    const text = transcript.value.trim();
    if (!text) {
      setMessage("Primero dicta o escribe el parte.");
      return;
    }
    const { values, uncertain } = parse(text);
    let count = 0;
    for (const k of [
      "cliente",
      "descripcion",
      "direccion",
      "responsable",
      "fecha",
      "estado",
      "notas",
    ]) {
      if (values[k] && form.elements[k]) {
        form.elements[k].value = values[k].slice(
          0,
          form.elements[k].maxLength > 0 ? form.elements[k].maxLength : 1000,
        );
        count++;
      }
    }
    if (!values.descripcion && !values.notas)
      form.elements.notas.value = text.slice(0, 1000);
    setMessage(
      "He identificado " +
        count +
        " campos. " +
        (uncertain.length
          ? "Revisa especialmente: " + uncertain.join(", ") + ". "
          : "") +
        "Comprueba los datos antes de Guardar; el análisis automático puede equivocarse.",
    );
    form.elements.cliente.focus();
  });
  dialog.addEventListener("close", () => {
    stopListening();
    transcript.value = "";
    setMessage(
      "Puedes hablar con naturalidad: «Tengo que cambiar un cristal para Marta López en la calle Mayor 15. Lo hará Pau»",
    );
  });
})();
