// node scripts/_validar_banco.js config/canal_tecnologia.json
const fs = require("fs");
const path = require("path");
const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
const banco = JSON.parse(fs.readFileSync(path.join(__dirname, "..", cfg.v2.banco), "utf-8")).ideas;
const claves = new Set(cfg.sub_nichos.map((s) => s.clave));
const ids = new Set();
let errores = 0;
const err = (m) => { console.log("ERROR " + m); errores++; };
for (const i of banco) {
  for (const c of ["id", "sub_nicho", "dato_central", "enfoque", "tema_clave"]) if (!i[c] || typeof i[c] !== "string") err(`${i.id}: falta ${c}`);
  if (ids.has(i.id)) err(`id repetido ${i.id}`);
  ids.add(i.id);
  if (!claves.has(i.sub_nicho)) err(`${i.id}: sub_nicho desconocido ${i.sub_nicho}`);
  if ((i.titulo && !i.gancho) || (!i.titulo && i.gancho)) err(`${i.id}: título y gancho van juntos o ninguno`);
  if (i.titulo && `${i.titulo} #Shorts`.length > 60) err(`${i.id}: título largo (${i.titulo.length})`);
  if (i.titulo && /#shorts/i.test(i.titulo)) err(`${i.id}: el título no lleva #Shorts`);
  if (cfg.v2.perfil === "biblia" && !i.pasaje) err(`${i.id}: falta pasaje`);
}
const usables = banco.filter((i) => !i.requiere_verificacion || i.verificada === true).length;
console.log(`Ideas: ${banco.length} | usables ahora: ${usables} | errores: ${errores}`);
process.exit(errores ? 1 : 0);
