// node scripts/_test_seleccion.js config/canal_tecnologia.json 40 1   (config, días, corridas por día)
const fs = require("fs");
const path = require("path");
const S = require("./seleccion_ideas");
const cfgPath = process.argv[2];
const dias = Number(process.argv[3] || 40);
const porDia = Number(process.argv[4] || 1);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
const v2 = cfg.v2;
const banco = JSON.parse(fs.readFileSync(path.join(__dirname, "..", v2.banco), "utf-8")).ideas;
const metaPath = path.join(__dirname, "..", "historial", `${path.basename(cfgPath, ".json")}_meta.json`);
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf-8")) : [];
const diasTema = v2.cooldown_dias ?? 14;
const diasPasaje = v2.cooldown_pasaje_dias || 0;
const inicio = Date.parse("2026-10-12");
const filas = [];
for (let d = 0; d < dias; d++) {
  for (let k = 0; k < porDia; k++) {
    const hoy = inicio + d * 86400000 + k * 6 * 3600000;
    const fecha = new Date(hoy).toISOString().slice(0, 10);
    let sel = S.elegirIdeaDelBanco({ banco, meta, subNichos: cfg.sub_nichos, hoy, diasTema, diasPasaje, reciclar: !!v2.reciclar });
    let origen = "banco";
    if (!sel && !v2.plan_b) { sel = S.elegirIdeaDelBanco({ banco, meta, subNichos: cfg.sub_nichos, hoy, diasTema: 0, diasPasaje: 0, reciclar: true }); origen = "RELAJADO"; }
    if (sel) {
      if (sel.idea.reciclada) origen = origen === "RELAJADO" ? "RELAJADO+RECICLADA" : "RECICLADA";
      meta.push({ fecha, titulo: sel.idea.titulo || sel.idea.pasaje, tema_clave: sel.idea.tema_clave, sub_nicho: sel.sub_nicho.clave, idea_id: sel.idea.id, pasaje: sel.idea.pasaje || null });
      filas.push({ dia: d + 1, corrida: k + 1, origen, sub_nicho: sel.sub_nicho.clave, tema: sel.idea.tema_clave, id: sel.idea.id });
    } else {
      filas.push({ dia: d + 1, corrida: k + 1, origen: "PLAN B (noticias/LLM)", sub_nicho: "-", tema: "-", id: "-" });
    }
  }
}
console.table(filas);
const conteo = {};
filas.forEach((f) => { conteo[f.origen] = (conteo[f.origen] || 0) + 1; });
console.log("Resumen:", conteo);
// Control: ningún tema_clave se repite dentro de su ventana, salvo corridas marcadas como RELAJADO
let fallos = 0;
const usados = filas.filter((f) => f.id !== "-" && !String(f.origen).startsWith("RELAJADO"));
for (let i = 0; i < usados.length; i++)
  for (let j = i + 1; j < usados.length; j++) {
    const ti = usados[i].dia * porDia + usados[i].corrida, tj = usados[j].dia * porDia + usados[j].corrida;
    if (usados[i].tema === usados[j].tema && (tj - ti) / porDia < diasTema) { console.log("TEMA REPETIDO", usados[i], usados[j]); fallos++; }
  }
console.log(fallos ? `FALLOS: ${fallos}` : "OK: sin repeticiones dentro de la ventana de enfriamiento");
process.exit(fallos ? 1 : 0);
