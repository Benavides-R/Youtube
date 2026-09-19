/**
 * marcar_ofertas_usadas.js
 * ------------------------------------------------------------
 * Se corre como último paso del workflow, DESPUÉS de que las cards se
 * enviaron a Telegram. Toma output/elegidas.json (los links que arma
 * obtener_ofertas.js) y recién ahí los agrega al registro definitivo
 * data/ofertas_procesadas.json.
 *
 * Si el workflow falla antes de llegar aquí (generar cards, enviar a
 * Telegram), este paso nunca corre -- las ofertas quedan sin marcar y se
 * vuelven a intentar en la siguiente corrida.
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const BASE_DIR = path.join(__dirname, "..");
const ELEGIDAS_PATH = path.join(BASE_DIR, "output", "elegidas.json");
const PROCESADAS_PATH = path.join(BASE_DIR, "data", "ofertas_procesadas.json");

if (!fs.existsSync(ELEGIDAS_PATH)) {
  console.log("ℹ️  No había ofertas elegidas en esta corrida, nada que marcar.");
  process.exit(0);
}

const DIAS_BLOQUEO_REPETIDO = 3;

const elegidas = JSON.parse(fs.readFileSync(ELEGIDAS_PATH, "utf-8"));

let procesadas = [];
if (fs.existsSync(PROCESADAS_PATH)) {
  try {
    procesadas = JSON.parse(fs.readFileSync(PROCESADAS_PATH, "utf-8"));
  } catch {
    procesadas = [];
  }
}

const ahora = new Date().toISOString();
const nuevas = elegidas.map((link) => ({ link, fecha: ahora }));
const corte = Date.now() - DIAS_BLOQUEO_REPETIDO * 24 * 3600 * 1000;
const vigentes = procesadas.filter((p) => typeof p === "object" && p.fecha && new Date(p.fecha).getTime() > corte);

// Si un link ya estaba vigente, se actualiza su fecha en vez de duplicarlo
const linksNuevos = new Set(nuevas.map((n) => n.link));
const actualizadas = [...vigentes.filter((v) => !linksNuevos.has(v.link)), ...nuevas];

fs.mkdirSync(path.dirname(PROCESADAS_PATH), { recursive: true });
fs.writeFileSync(PROCESADAS_PATH, JSON.stringify(actualizadas, null, 2));

console.log(`✅ ${elegidas.length} ofertas marcadas como usadas por ${DIAS_BLOQUEO_REPETIDO} días (cards ya enviadas a Telegram)`);
