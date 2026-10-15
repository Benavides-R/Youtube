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

// Diccionario léxico RV1909 -> lenguaje actual de Colombia.
// Solo vocabulario arcaico que hoy suena raro o se malentiende (sobrepuja,
// apretura, congoja, caridad=en amor, socorro, salud= salvación, etc.).
// NO cambia el significado ni las ideas; NO es una re-traducción tipo NVI.
// Cada entrada respeta los límites de palabra para no tocar derivados vivos.
const LEXICO = [
  // Frases o palabras con género/contexto que hay que cuidar
  [/\bLa caridad\b/gu, "El amor"],
  [/\bla caridad\b/gu, "el amor"],
  [/\bcon caridad\b/gu, "con amor"],
  [/\bcaridad\b/gu, "amor"],                    // resto: "tuviere caridad", "ferviente caridad"
  [/\bno se huelga\b/gu, "no se goza"],
  [/\bhuélgase\b/gu, "se goza"],
  [/\bes sufrida\b/gu, "es paciente"],
  [/\bes benigna\b/gu, "es bondadoso"],         // 1 Cor 13:4: tras "La caridad"->"El amor", el adjetivo va en masculino
  [/\bmi salud\b/gu, "mi salvación"],           // en la RV1909 "salud" acá es salvación, no salud física
  [/\bmenester es\b/gu, "es necesario"],
  [/\bBástate mi gracia\b/gu, "Mi gracia te basta"],
  [/\bhallarémos\b/gu, "hallaremos"],
  // "sustancia" con dos sentidos distintos: certeza (Hebreos 11:1) y bienes (Proverbios 3:9)
  [/\bLa sustancia de las cosas\b/gu, "La certeza de las cosas"],
  [/\bla sustancia de las cosas\b/gu, "la certeza de las cosas"],
  [/\bde tu sustancia\b/gu, "de tus bienes"],
  // Vocabulario arcaico suelto
  [/\bsobrepuja\b/gu, "sobrepasa"],
  [/\bapretura\b/gu, "angustia"],
  [/\bsocorro\b/gu, "ayuda"],
  // congoj: por palabra completa (el viejo /congoj/ generaba "anguistiéis", inexistente)
  // reflexivo conservando el vosotros: "os congojéis/os congojáis" -> "os angustiéis/os angustiáis"
  [/\bOs congojéis\b/gu, "Os angustiéis"],
  [/\bos congojéis\b/gu, "os angustiéis"],
  [/\bOs congojáis\b/gu, "Os angustiáis"],
  [/\bos congojáis\b/gu, "os angustiáis"],
  [/\bcongojoso\b/gu, "angustioso"],
  [/\bcongoje\b/gu, "angustie"],
  [/\bcongoja\b/gu, "angustia"],
  [/\bgalardonador\b/gu, "recompensador"],
  [/\bzahiere\b/gu, "reprende"],
  [/\bmancebos\b/gu, "jóvenes"],
  [/\bmozos\b/gu, "muchachos"],
  [/\baquesta\b/gu, "esta"],
  [/\besotra\b/gu, "otra"],
  [/\balfolíes\b/gu, "graneros"],
  [/\bhenchir\b/gu, "llenar"],
  [/\bendechar\b/gu, "lamentar"],
  [/\badarga\b/gu, "baluarte"],
  [/\bdeléitate\b/gu, "regocíjate"],
  [/\bjactanciosa\b/gu, "presumido"],           // 1 Cor 13:4: va tras "el amor" (masculino)
  [/\bhinchada\b/gu, "envanecido"],
  [/\baltivez\b/gu, "arrogancia"],
  [/\bresbalo\b/gu, "resbalón"],
  [/\bsazón\b/gu, "tiempo"],
  [/\bconfortar\b/gu, "fortalecer"],
  [/\bconfortarán\b/gu, "fortalecerán"],
  [/\bconfortaos\b/gu, "fortaleceos"],
  [/\bempero\b/gu, "pero"],
  [/\bEmpero\b/gu, "Pero"],
  // Arcaismos sueltos que aún sobreviven a la tarjeta (RV1909; se conserva el vosotros)
  [/\bpresto\b/gu, "pronto"],                    // Isaías 43:19
  [/\bdesampar/gu, "abandon"],                   // desampará/desamparé/desamparen -> abandonará/...
  [/\bsolicitud\b/gu, "preocupación"],           // 1 Pedro 5:7 "vuestra solicitud"
  [/\bespavoreceré/gu, "espantaré"],            // Salmo 27:1 (sin \b final: "é" no es \w)
  [/\bensalzarme he\b/gu, "me exaltaré"],        // Salmo 46:10 (futuro perifrástico "he")
  [/\basegurarme he\b/gu, "confiaré"],           // Salmo 91:2
  [/\bjuntamente\b/gu, "juntas"],                // Romanos 8:28 "obran juntas"
];

// Nota: se conserva el "vosotros/vuestra/os" de la RV1909 tal cual (el dueño
// prefiere ese registro clásico). Solo se moderniza vocabulario raro (LEXICO).

// La RV1909 dice "Jehová"; el canal usa "el Señor".
function adaptarTexto(t, opts) {
  const adaptarJehova = !opts || opts.adaptarJehova !== false;
  let s = String(t).replace(/\s+/g, " ").trim();
  // Ortografía antigua de la RV1909: imperativos con tilde final (Veníd, Cesád, conocéd) -> Venid, Cesad, conoced
  s = s.replace(/([áéíóú])d(?![\p{L}])/gu, (m, v) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u" }[v]) + "d");
  // Imperativos reflexivos con tilde antigua (esforzáos, regocijáos) -> esforzaos, regocijaos
  s = s.replace(/([áé])os(?![\p{L}])/gu, (m, v) => ({ á: "a", é: "e" }[v]) + "os");
  // Modernizar vocabulario arcaico (manteniendo significado)
  for (const [re, nueva] of LEXICO) s = s.replace(re, nueva);
  if (adaptarJehova) {
    s = s.replace(/\b([Aa]) Jehová/g, (m, a) => (a === "A" ? "Al Señor" : "al Señor"));
    s = s.replace(/\b([Dd]e) Jehová/g, (m, d) => (d === "D" ? "Del Señor" : "del Señor"));
    s = s.replace(/Jehová/g, "el Señor");
    s = s.replace(/^el Señor/, "El Señor");
    s = s.replace(/([.!?;:]\s+)el Señor/g, (m, p) => (/[.!?]/.test(p) ? p + "El Señor" : m));
  }
  return s;
}

function textoDePasaje(textos, ref, opts) {
  const partes = [];
  for (const r of expandirRango(ref)) {
    if (!textos[r]) return null;
    partes.push({ ref: r, texto: adaptarTexto(textos[r], opts) });
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
  const adaptar = v2.adaptar_jehova !== false;      // true solo para la RV1909 (dice "Jehová")
  const opts = { adaptarJehova: adaptar };
  const nombreTraduccion = v2.traduccion_nombre || "Reina-Valera 1909";

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
        const partes = textoDePasaje(textos, ref, opts);
        if (!partes) return inutilizable(i, `faltan versículos de ${ref}`);
        bloques.push(`${ref} (${nombreTraduccion}):\n` + partes.map((p) => `${p.ref.replace(/^.*:/, "")}. ${p.texto}`).join("\n"));
      }
      return { ...i, pasaje: i.pasajes.join("; "), dato_central: `TEXTO BÍBLICO (único origen de lo que dice el pasaje):\n${bloques.join("\n\n")}`, requiere_verificacion: false };
    }
    if (i.pasaje && v2.tipo === "biblia") { // tarjetas de versículo
      if (!textos) return inutilizable(i, `falta config/biblia_rv1909.json`);
      const partes = textoDePasaje(textos, i.pasaje, opts);
      if (!partes) return inutilizable(i, `falta el texto de ${i.pasaje}`);
      const verso = partes.map((p) => p.texto).join(" ");
      if (v2.max_palabras_verso && verso.split(/\s+/).length > v2.max_palabras_verso) return inutilizable(i, "verso demasiado largo para la tarjeta");
      return { ...i, verso, dato_central: verso, requiere_verificacion: false };
    }
    return i;
  });
}

module.exports = { expandirRango, adaptarTexto, textoDePasaje, cargarBanco };
