// Test 3 días: simula los 7 workflows con esperas aleatorias reales
// (0-180 min) + generación (40-90 min), imprime la línea de tiempo
// día por día y VERIFICA:
//   A) Ninguna publicación de YouTube comparte fecha+hora (ni mismo canal ni cruzado)
//   B) Ninguna publicación cae en horario malo (antes de 12:00 o desde 23:00)
//   C) Barrido exhaustivo: cada 5 min de finalización posible, 3 días
const src = require("fs").readFileSync("scripts/subir_youtube.js", "utf8");
const bloque = src.slice(src.indexOf("const FRANJAS_PICO_COLOMBIA"), src.lastIndexOf("// ---", src.indexOf("3. Subir")));

function crearSig(frList) {
  return new Function("process", `${bloque}\nreturn siguienteFranja;`)({
    env: { PUBLISH_FRANJAS: frList, PUBLISH_AUTO: "true" },
  });
}

const WFS = [
  { n: "Short súpérate (mañana)", corto: "S.süp-am", cronCO: 6 + 18 / 60, fr: "13:30,16:00", fb: true },
  { n: "Short biblia (mañana)", corto: "S.bib-am", cronCO: 8 + 22 / 60, fr: "12:30,15:00", fb: true },
  { n: "Súpérate largo", corto: "S.largo", cronCO: 14 + 33 / 60, fr: "19:00,20:30", fb: false },
  { n: "Biblia largo", corto: "B.largo", cronCO: 16 + 37 / 60, fr: "18:30,21:30", fb: false },
  { n: "Tecnología", corto: "Tec", cronCO: 17 + 52 / 60, fr: "19:30,22:45", fb: true },
  { n: "Short súpérate (noche)", corto: "S.süp-pm", cronCO: 18 + 42 / 60, fr: "17:00,22:00", fb: true },
  { n: "Short biblia (noche)", corto: "S.bib-pm", cronCO: 20 + 47 / 60, fr: "14:00,16:30", fb: true },
];

// Random con semilla (reproducible)
let semilla = 42;
const rnd = (min, max) => {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return min + (semilla / 2147483648) * (max - min);
};

const fmt = (utcMs) => {
  const d = new Date(utcMs - 5 * 3600e3); // a hora Colombia
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getUTCDay()];
  return `${dias} ${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

const COhora = (utcMs) => {
  const d = new Date(utcMs - 5 * 3600e3);
  return parseInt(String(d.getUTCHours()).padStart(2, "0"), 10);
};

// ============================================================
// PARTE 1: línea de tiempo de 3 días con esperas aleatorias
// ============================================================
console.log("════════ LÍNEA DE TIEMPO 3 DÍAS (espera aleatoria 0-180 min) ════════\n");

const publicaciones = []; // {wf, canal, iso, co}
for (let dia = 0; dia < 3; dia++) {
  console.log(`──────── DÍA ${dia + 1} ────────`);
  const eventos = [];
  for (const w of WFS) {
    const sig = crearSig(w.fr);
    const baseCO = Date.UTC(2026, 9, 5 + dia, 5, 0); // 00:00 CO
    const cron = baseCO + w.cronCO * 3600e3;
    const espera = Math.round(rnd(0, 180));
    const gen = Math.round(rnd(40, 90));
    const inicio = cron + espera * 60e3;
    const fin = inicio + gen * 60e3;

    const realNow = Date.now;
    Date.now = () => fin;
    const isoYt = sig();
    Date.now = realNow;
    if (!isoYt) { console.log(`  !! ${w.n}: SIN FRANJA`); continue; }

    publicaciones.push({ wf: w.corto, canal: w.n, iso: isoYt, co: fmt(Date.parse(isoYt)) });
    eventos.push(
      `  ${w.n.padEnd(24)} cron ${fmt(cron).slice(5)} +${espera}min → arranca ${fmt(inicio).slice(5)}, lista ${fmt(fin).slice(5)}` +
        (w.fb ? ` → FB: ${fmt(fin).slice(5)}` : "") +
        `\n  ${"".padEnd(24)}    ⮑ YouTube PUBLICA: ${fmt(Date.parse(isoYt))}`
    );
  }
  for (const e of eventos.sort()) console.log(e);
  console.log("");
}

// ============================================================
// PARTE 2: verificaciones
// ============================================================
console.log("════════ VERIFICACIONES ════════\n");

// A) choques en la línea de tiempo
const porFecha = new Map();
for (const p of publicaciones) {
  if (!porFecha.has(p.co)) porFecha.set(p.co, []);
  porFecha.get(p.co).push(p.wf);
}
let choques = 0;
for (const [hora, wfs] of porFecha) {
  if (wfs.length > 1) { console.log(`CHOQUE: ${hora} → ${wfs.join(" + ")}`); choques++; }
}
console.log(`A) Choques en 3 días: ${choques === 0 ? "ninguno ✓" : `${choques} ✗`}`);

// B) horarios malos
const malos = publicaciones.filter((p) => {
  const h = COhora(Date.parse(p.iso));
  return h < 12 || h >= 23;
});
console.log(`B) Horarios malos (<12:00 o >=23:00): ${malos.length === 0 ? "ninguno ✓" : malos.map((m) => m.co).join(", ") + " ✗"}`);

// C) barrido exhaustivo: cada 5 min de finalización, 3 días
const productores = new Map();
let sinFranja = 0;
for (let dia = 0; dia < 3; dia++) {
  for (const w of WFS) {
    const sig = crearSig(w.fr);
    const baseCO = Date.UTC(2026, 9, 5 + dia, 5, 0);
    const start = baseCO + w.cronCO * 3600e3;
    for (let min = 40; min <= 270; min += 5) {
      const fin = start + min * 60e3;
      const realNow = Date.now;
      Date.now = () => fin;
      const iso = sig();
      Date.now = realNow;
      if (!iso) { sinFranja++; continue; }
      const key = fmt(Date.parse(iso));
      if (!productores.has(key)) productores.set(key, new Set());
      productores.get(key).add(`${w.corto}@D${dia}`);
      const h = COhora(Date.parse(iso));
      if (h < 12 || h >= 23) { console.log(`HORA MALA EXHAUSTIVO: ${w.corto} → ${key}`); malos.push({}); }
    }
  }
}
let choquesExh = 0;
for (const [hora, prods] of productores) {
  if (prods.size > 1) { console.log(`CHOQUE EXHAUSTIVO: ${hora} → ${[...prods].join(" + ")}`); choquesExh++; }
}
console.log(`C) Barrido exhaustivo (${WFS.length} workflows × 47 horarios × 3 días): choques=${choquesExh === 0 ? "ninguno ✓" : choquesExh + " ✗"}, sin franja=${sinFranja === 0 ? "0 ✓" : sinFranja + " ✗"}${malos.length === 0 ? ", horas malas=0 ✓" : ""}`);

const ok = choques === 0 && choquesExh === 0 && sinFranja === 0 && malos.length === 0;
console.log(`\n${ok ? "✅ TEST 3 DÍAS: TODO OK" : "❌ TEST FALLÓ"}`);
process.exit(ok ? 0 : 1);
