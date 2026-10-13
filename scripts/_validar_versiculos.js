// node scripts/_validar_versiculos.js
const fs = require("fs");
const path = require("path");
const { expandirRango, adaptarTexto } = require("./banco");
const BASE = path.join(__dirname, "..");
const textos = JSON.parse(fs.readFileSync(path.join(BASE, "config", "biblia_rv1909.json"), "utf-8"));
const refs = new Set();
for (const archivo of ["config/banco_tarjetas_biblia.json", "config/banco_ideas_biblia_largo.json"]) {
  const ruta = path.join(BASE, archivo);
  if (!fs.existsSync(ruta)) { console.log(`(omitido, aún no existe: ${archivo})`); continue; }
  const ideas = JSON.parse(fs.readFileSync(ruta, "utf-8")).ideas;
  for (const i of ideas) {
    if (i.pasaje && !i.pasajes) expandirRango(i.pasaje).forEach((r) => refs.add(r));
    (i.pasajes || []).forEach((p) => expandirRango(p).forEach((r) => refs.add(r)));
  }
}
let faltan = 0, conJehova = 0, largos = [];
for (const r of refs) {
  if (!textos[r]) { console.log("FALTA:", r); faltan++; continue; }
  const adaptado = adaptarTexto(textos[r]);
  if (/Jehov/i.test(textos[r])) { conJehova++; console.log(`ADAPTADO ${r}: ${adaptado}`); }
  const n = adaptado.split(/\s+/).length;
  if (n > 30) largos.push(`${r} (${n} palabras)`);
}
console.log(`Versículos requeridos: ${refs.size} | faltan: ${faltan} | con Jehová adaptado: ${conJehova}`);
if (largos.length) console.log("Más de 30 palabras (no sirven para tarjeta, sí para el video largo):", largos.join(", "));
process.exit(faltan ? 1 : 0);
