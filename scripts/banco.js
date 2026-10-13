// scripts/banco.js — utilidades compartidas de bancos de ideas
// (versión inicial para Parte A; se amplía en Parte B1 con cargarBanco)

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
  s = s.replace(/\b([Aa]) Jehová/g, (m, a) => (a === "A" ? "Al Señor" : "al Señor"));
  s = s.replace(/\b([Dd]e) Jehová/g, (m, d) => (d === "D" ? "Del Señor" : "del Señor"));
  s = s.replace(/Jehová/g, "el Señor");
  s = s.replace(/^el Señor/, "El Señor");
  s = s.replace(/([.!?;:]\s+)el Señor/g, (m, p) => (/[.!?]/.test(p) ? p + "El Señor" : m));
  return s;
}

module.exports = { expandirRango, adaptarTexto };
