// scripts/banco.js
const fs = require("fs");
const path = require("path");

function leerIdeas(BASE, rel) {
  return JSON.parse(fs.readFileSync(path.join(BASE, rel), "utf-8")).ideas;
}

// "Salmo 23:1-6" -> ["Salmo 23:1", ..., "Salmo 23:6"]
function expandirRango(ref) {
  const m = String(ref).match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return [ref];
  const [, libro, cap, v1, v2] = m;
  const salida = [];
  for (let v = Number(v1); v <= Number(v2 || v1); v++) salida.push(`${libro} ${cap}:${v}`);
  return salida;
}

// La RV1909 dice "Jehová"; el canal usa "el Señor".
function adaptarTexto(t) {
  let s = String(t).replace(/\s+/g, " ").trim();
  // Ortografía antigua de la RV1909: imperativos con tilde final (Veníd, Cesád, conocéd) -> Venid, Cesad, conoced
  s = s.replace(/([áéíóú])d(?![\p{L}])/gu, (m, v) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u" }[v]) + "d");
  s = s.replace(/\b([Aa]) Jehová/g, (m, a) => (a === "A" ? "Al Señor" : "al Señor"));
  s = s.replace(/\b([Dd]e) Jehová/g, (m, d) => (d === "D" ? "Del Señor" : "del Señor"));
  s = s.replace(/Jehová/g, "el Señor");
  s = s.replace(/^el Señor/, "El Señor");
  s = s.replace(/([.!?;:]\s+)el Señor/g, (m, p) => (/[.!?]/.test(p) ? p + "El Señor" : m));
  return s;
}

function textoDePasaje(textos, ref) {
  const partes = [];
  for (const r of expandirRango(ref)) {
    if (!textos[r]) return null;
    partes.push({ ref: r, texto: adaptarTexto(textos[r]) });
  }
  return partes;
}

// Devuelve el banco ya resuelto. Si una idea no se puede resolver, se marca como NO utilizable.
function cargarBanco(BASE, v2) {
  const ideas = leerIdeas(BASE, v2.banco);
  const fuentes = {};
  (v2.fuentes || []).forEach((rel) => leerIdeas(BASE, rel).forEach((i) => { fuentes[i.id] = i; }));
  const rutaTextos = v2.textos ? path.join(BASE, v2.textos) : null;
  const textos = rutaTextos && fs.existsSync(rutaTextos) ? JSON.parse(fs.readFileSync(rutaTextos, "utf-8")) : null;
  const inutilizable = (i, motivo) => ({ ...i, requiere_verificacion: true, verificada: false, _motivo: motivo });

  return ideas.map((i) => {
    if (i.desde) {
      const s = fuentes[i.desde];
      if (!s) return inutilizable(i, `fuente ${i.desde} no encontrada`);
      return { ...i, dato_central: s.dato_central, enfoque: i.enfoque || s.enfoque, requiere_verificacion: !!s.requiere_verificacion, verificada: s.verificada };
    }
    if (i.bundle) {
      const piezas = i.bundle.map((id) => fuentes[id]);
      if (piezas.some((p) => !p)) return inutilizable(i, "pieza del bundle no encontrada");
      const req = piezas.some((p) => p.requiere_verificacion);
      const ok = piezas.every((p) => !p.requiere_verificacion || p.verificada === true);
      const secciones = piezas
        .map((p, n) => `SECCIÓN ${n + 1}: ${p.titulo}\nDato: ${p.dato_central}\nEnfoque: ${p.enfoque}`)
        .join("\n\n");
      return { ...i, dato_central: secciones, requiere_verificacion: req, verificada: req ? ok : undefined };
    }
    if (i.pasajes) {
      if (!textos) return inutilizable(i, "falta config/biblia_rv1909.json");
      const bloques = [];
      for (const ref of i.pasajes) {
        const partes = textoDePasaje(textos, ref);
        if (!partes) return inutilizable(i, `faltan versículos de ${ref}`);
        bloques.push(`${ref} (Reina-Valera 1909, adaptada):\n` + partes.map((p) => `${p.ref.replace(/^.*:/, "")}. ${p.texto}`).join("\n"));
      }
      return { ...i, pasaje: i.pasajes.join("; "), dato_central: `TEXTO BÍBLICO (único origen de lo que dice el pasaje):\n${bloques.join("\n\n")}`, requiere_verificacion: false };
    }
    if (i.pasaje && v2.tipo === "biblia") { // tarjetas de versículo
      if (!textos) return inutilizable(i, "falta config/biblia_rv1909.json");
      const partes = textoDePasaje(textos, i.pasaje);
      if (!partes) return inutilizable(i, `falta el texto de ${i.pasaje}`);
      const verso = partes.map((p) => p.texto).join(" ");
      if (v2.max_palabras_verso && verso.split(/\s+/).length > v2.max_palabras_verso) return inutilizable(i, "verso demasiado largo para la tarjeta");
      return { ...i, verso, dato_central: verso, requiere_verificacion: false };
    }
    return i;
  });
}

module.exports = { expandirRango, adaptarTexto, textoDePasaje, cargarBanco };
