// node scripts/_validar_banco.js config/canal_biblia_imagen.json
const fs = require("fs");
const path = require("path");
const { cargarBanco } = require("./banco");
const BASE = path.join(__dirname, "..");
const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
const v2 = cfg.v2;
const largo = (cfg.formato || "horizontal") !== "vertical" && !v2.tipo;
const crudas = JSON.parse(fs.readFileSync(path.join(BASE, v2.banco), "utf-8")).ideas;
const resueltas = cargarBanco(BASE, v2);
const claves = new Set(cfg.sub_nichos.map((s) => s.clave));
const ids = new Set();
let errores = 0;
const err = (m) => { console.log("ERROR " + m); errores++; };
for (const i of crudas) {
  for (const c of ["id", "sub_nicho", "tema_clave"]) if (!i[c] || typeof i[c] !== "string") err(`${i.id}: falta ${c}`);
  if (ids.has(i.id)) err(`id repetido ${i.id}`);
  ids.add(i.id);
  if (!claves.has(i.sub_nicho)) err(`${i.id}: sub_nicho desconocido ${i.sub_nicho}`);
  const esTarjeta = !!v2.tipo;
  if (esTarjeta) {
    if (v2.tipo === "biblia" && !i.pasaje) err(`${i.id}: falta pasaje`);
    if (v2.tipo === "superate" && !i.frase) err(`${i.id}: falta frase`);
    if (v2.tipo === "superate" && !i.autor) err(`${i.id}: falta autor (usa 'Superate777' si es original)`);
    if (v2.tipo === "superate" && i.frase && i.frase.split(/\s+/).length > 22) err(`${i.id}: frase de más de 22 palabras`);
  } else {
    for (const c of ["dato_central", "enfoque"]) if (!i.bundle && !i.pasajes && (!i[c] || typeof i[c] !== "string")) err(`${i.id}: falta ${c}`);
    if ((i.titulo && !i.gancho) || (!i.titulo && i.gancho)) err(`${i.id}: título y gancho van juntos o ninguno`);
    if (i.titulo && /#shorts/i.test(i.titulo)) err(`${i.id}: el título no lleva #Shorts`);
    if (i.titulo && i.titulo.length > (largo ? 60 : 52)) err(`${i.id}: título largo (${i.titulo.length})`);
    if (largo && !i.bundle && !i.pasajes) err(`${i.id}: un video largo necesita bundle o pasajes`);
  }
}
const usables = resueltas.filter((i) => !i.requiere_verificacion || i.verificada === true).length;
resueltas.filter((i) => i._motivo).forEach((i) => console.log(`AVISO ${i.id}: no utilizable (${i._motivo})`));
console.log(`Ideas: ${crudas.length} | usables ahora: ${usables} | errores: ${errores}`);
process.exit(errores ? 1 : 0);
