// scripts/generar_tarjeta_v2.js
const fs = require("fs");
const path = require("path");
const S = require("./seleccion_ideas");
const F = require("./formato_textos");
const { cargarBanco } = require("./banco");
const { llamarGroqJSON } = require("./generar_guion_v2");

const BASE = path.join(__dirname, "..");
const HISTORIAL_DIR = path.join(BASE, "historial");

function leerJSON(ruta, defecto) {
  try { return JSON.parse(fs.readFileSync(ruta, "utf-8")); } catch { return defecto; }
}
function elegirAlAzar(lista, n) {
  const copia = [...lista];
  const salida = [];
  while (copia.length && salida.length < n) salida.push(copia.splice(Math.floor(Math.random() * copia.length), 1)[0]);
  return salida;
}

async function ejecutar(cfg, nombreConfig) {
  const v2 = cfg.v2 || {};
  if (!v2.tipo || !v2.perfil || !v2.banco) throw new Error('El config con "flujo_v2" necesita v2.tipo, v2.perfil y v2.banco');
  const p = require(`./perfiles/${v2.perfil}`);
  const dryRun = process.env.DRY_RUN === "1";
  const hoy = Date.now();
  const fecha = new Date(hoy).toISOString().slice(0, 10);
  const META = path.join(HISTORIAL_DIR, `${nombreConfig}_meta.json`);
  fs.mkdirSync(HISTORIAL_DIR, { recursive: true });

  const meta = leerJSON(META, []);
  const banco = cargarBanco(BASE, v2);
  const opciones = {
    banco, meta, subNichos: cfg.sub_nichos, hoy,
    diasTema: v2.cooldown_dias ?? 1, diasPasaje: v2.cooldown_pasaje_dias || 0, reciclar: true,
  };
  const sel = S.elegirIdeaDelBanco(opciones) || S.elegirIdeaDelBanco({ ...opciones, diasTema: 0, diasPasaje: 0 });
  if (!sel) throw new Error("El banco de tarjetas no tiene ideas utilizables");
  const idea = sel.idea;
  const subNicho = sel.sub_nicho;
  console.log(`Tarjeta ${idea.id}: ${idea.pasaje || idea.frase}`);

  // Párrafo de la descripción (único uso del LLM)
  let parrafo, hashtags;
  try {
    const user = v2.tipo === "biblia"
      ? `VERSÍCULO: "${idea.verso}"\nREFERENCIA: ${idea.pasaje}`
      : `FRASE: ${idea.frase}\nORIGEN: ${idea.autor}\nIDEA DE FONDO: ${idea.dato_central || idea.frase}\nENFOQUE: ${idea.enfoque || ""}`;
    const r = await llamarGroqJSON(p.tarjeta_sistema, user, 0.7);
    parrafo = F.limpiarParrafo(r.descripcion);
    hashtags = F.sanearHashtags(r.hashtags, v2.hashtags_default);
  } catch (e) {
    console.log(`⚠️  Falló la descripción con IA (${e.message}); se usa una descripción simple.`);
    parrafo = v2.tipo === "biblia" ? "Un versículo para meditar hoy y llevar contigo." : "Una idea para aplicar hoy mismo.";
    hashtags = F.sanearHashtags([], v2.hashtags_default);
  }
  const descripcion = F.armarDescripcionFacebook(parrafo, null, hashtags, v2.cierre_facebook, null);
  const lista = (v2.fotos && (v2.fotos[subNicho.clave] || v2.fotos.default)) || ["sunrise over mountains"];
  const fotos = elegirAlAzar(lista, 4);

  let salida, nombreArchivo;
  if (v2.tipo === "biblia") {
    nombreArchivo = "cita.json";
    salida = { verso: idea.verso, referencia: `${idea.pasaje} (${v2.traduccion_etiqueta || "RV1909"})`, descripcion, palabras_clave_imagen: fotos };
  } else {
    nombreArchivo = "frase.json";
    salida = { frase: idea.frase, autor: idea.autor || "Superate777", sin_comillas: true, descripcion, palabras_clave_imagen: fotos };
  }

  if (dryRun) {
    console.log(JSON.stringify(salida, null, 2));
    return salida;
  }
  const outputDir = path.join(BASE, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, nombreArchivo), JSON.stringify(salida, null, 2), "utf-8");
  meta.push({ fecha, titulo: idea.frase || idea.pasaje, tema_clave: idea.tema_clave, sub_nicho: subNicho.clave, idea_id: idea.id, pasaje: idea.pasaje || null });
  fs.writeFileSync(META, JSON.stringify(meta.slice(-400), null, 2), "utf-8");
  console.log(`✅ Tarjeta lista: ${nombreArchivo}`);
  return salida;
}

module.exports = { ejecutar };
