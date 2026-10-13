// node scripts/confirmar_meta.js canal_tecnologia
const fs = require("fs");
const path = require("path");
const nombre = process.argv[2];
const dir = path.join(__dirname, "..", "historial");
const pend = path.join(dir, `pendiente_${nombre}.json`);
const metaPath = path.join(dir, `${nombre}_meta.json`);
if (!fs.existsSync(pend)) { console.log("Sin pendiente, nada que confirmar"); process.exit(0); }
const p = JSON.parse(fs.readFileSync(pend, "utf-8"));
let m = [];
try { m = JSON.parse(fs.readFileSync(metaPath, "utf-8")); } catch {}
m.push(p);
fs.writeFileSync(metaPath, JSON.stringify(m.slice(-120), null, 2), "utf-8");
fs.unlinkSync(pend);
console.log("Tema confirmado:", p.titulo);
