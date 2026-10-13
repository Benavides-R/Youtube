// node scripts/_validar_banco.js
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("config/canal_tecnologia.json", "utf-8"));
const banco = JSON.parse(fs.readFileSync("config/banco_ideas_tecnologia.json", "utf-8")).ideas;
const claves = new Set(cfg.sub_nichos.map((s) => s.clave));
const ids = new Set();
let errores = 0;
const campos = ["id", "sub_nicho", "formula", "titulo", "gancho", "dato_central", "enfoque", "verificar", "tema_clave"];
for (const i of banco) {
  for (const c of campos) if (!i[c] || typeof i[c] !== "string") { console.log(`ERROR ${i.id}: falta ${c}`); errores++; }
  if (ids.has(i.id)) { console.log(`ERROR id repetido ${i.id}`); errores++; }
  ids.add(i.id);
  if (!claves.has(i.sub_nicho)) { console.log(`ERROR ${i.id}: sub_nicho desconocido ${i.sub_nicho}`); errores++; }
  if (`${i.titulo} #Shorts`.length > 60) { console.log(`ERROR ${i.id}: título largo (${i.titulo.length})`); errores++; }
  if (/#shorts/i.test(i.titulo)) { console.log(`ERROR ${i.id}: el título no lleva #Shorts`); errores++; }
}
const usables = banco.filter((i) => !i.requiere_verificacion || i.verificada === true).length;
console.log(`Ideas: ${banco.length} | usables ahora: ${usables} | errores: ${errores}`);
process.exit(errores ? 1 : 0);
