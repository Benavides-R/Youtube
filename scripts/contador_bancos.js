// scripts/contador_bancos.js
// Resumen de consumo del banco de ideas de un canal: usadas / total.
// "Usada" = idea cuyo id (o tema_clave, para metas antiguas sin id) aparece
// en historial/<config>_meta.json; incluye las descartadas porque ya no
// vuelven a salir. Sirve para controlar cuándo empieza la repetición.
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..");

function resumenBanco(nombreConfig) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BASE, "config", `${nombreConfig}.json`), "utf-8"));
    const bancoRel = cfg.v2 && cfg.v2.banco;
    if (!bancoRel) return null;
    const banco = JSON.parse(fs.readFileSync(path.join(BASE, bancoRel), "utf-8"));
    const ideas = banco.ideas || [];
    const metaPath = path.join(BASE, "historial", `${nombreConfig}_meta.json`);
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf-8")) : [];
    const ids = new Set(meta.map((m) => m.idea_id).filter(Boolean));
    const temas = new Set(meta.map((m) => m.tema_clave).filter(Boolean));
    const usadas = ideas.filter((i) => ids.has(i.id) || (i.tema_clave && temas.has(i.tema_clave))).length;
    return { usadas, total: ideas.length, restantes: ideas.length - usadas };
  } catch (e) {
    return null;
  }
}

function lineaContador(nombreConfig) {
  const r = resumenBanco(nombreConfig);
  if (!r) return null;
  let linea = `💡 Ideas usadas: ${r.usadas}/${r.total} (quedan ${r.restantes} nuevas)`;
  if (r.restantes === 0) linea += `\n⚠️ Banco agotado: de aquí en adelante se reciclan ideas viejas`;
  else if (r.restantes <= 5) linea += `\n⚠️ Quedan pocas ideas nuevas (${r.restantes})`;
  return linea;
}

module.exports = { resumenBanco, lineaContador };
