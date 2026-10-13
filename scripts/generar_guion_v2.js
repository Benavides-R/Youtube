// scripts/generar_guion_v2.js
// Motor de guiones v2 para canales de shorts. Se activa con "flujo_v2": true en el config del canal.
const fs = require("fs");
const path = require("path");
const { buscarCandidatos } = require("./buscar_temas");
const S = require("./seleccion_ideas");
const F = require("./formato_textos");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const BASE = path.join(__dirname, "..");
const HISTORIAL_DIR = path.join(BASE, "historial");

function leerJSON(ruta, defecto) {
  try { return JSON.parse(fs.readFileSync(ruta, "utf-8")); } catch { return defecto; }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Misma configuración de llamada que usa generar_guion.js (max_completion_tokens, json_object, reintento por límite de tasa).
async function llamarGroqJSON(system, user, temperature) {
  const MAX = 5;
  for (let intento = 1; intento <= MAX; intento++) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature,
          max_completion_tokens: 4000,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Groq API error ${r.status}: ${t.slice(0, 300)}`);
      }
      const data = await r.json();
      return JSON.parse(data.choices[0].message.content);
    } catch (e) {
      const msg = String(e.message);
      const limite = /rate_limit_exceeded|Rate limit reached|Groq API error 429/i.test(msg);
      const formato = msg.includes("json_validate_failed") || msg.includes("max completion tokens") || e instanceof SyntaxError;
      if ((limite || formato) && intento < MAX) {
        // TPM de Groq se mide por ventana de 60s: si el sugerido es corto,
        // igual esperamos bastante para salir de la ventana; escala con el intento.
        const m = msg.match(/try again in (\d+(?:\.\d+)?)s/i);
        const sugeridoMs = m ? Math.ceil(parseFloat(m[1]) * 1000) : 20000;
        const espera = limite
          ? Math.max(30000, sugeridoMs + 10000) + (intento - 1) * 15000
          : 3000 * intento;
        console.log(`⚠️  Intento ${intento} falló (${limite ? "límite de tasa" : "formato"}), esperando ${Math.round(espera / 1000)}s y reintentando...`);
        await dormir(espera);
        continue;
      }
      throw e;
    }
  }
}

// ---------- Esquemas y prompts compartidos (lo propio de cada canal vive en scripts/perfiles/) ----------
const ESQUEMA_IDEAS = `Responde ÚNICAMENTE con JSON válido, sin markdown:
{"ideas":[{
  "titulo": "máximo 52 caracteres, sin #Shorts",
  "gancho": "primera frase del video",
  "dato_central": "el hecho verificable en una frase",
  "enfoque": "cómo contarlo en una o dos frases",
  "fuente": "número del material o conocimiento_estable",
  "tema_clave": "1 a 2 palabras en minúscula sin tildes, con guion bajo si son dos",
  "puntajes": {"gancho": 1, "novedad": 1, "verificabilidad": 1, "utilidad": 1}
}]}
Los puntajes van de 1 a 5. Genera EXACTAMENTE 10 ideas.`;

const ESQUEMA_TITULOS = `Responde ÚNICAMENTE con JSON válido, sin markdown:
{"opciones":[{"titulo":"máximo 52 caracteres, sin #Shorts","gancho":"primera frase del video","puntajes":{"gancho":1,"claridad":1,"curiosidad":1}}]}
Genera EXACTAMENTE 5 opciones distintas entre sí. Los puntajes van de 1 a 5.`;

const BASE_VERIFICACION = `Eres verificador de hechos de un canal de YouTube Shorts. Recibes un GUION, el DATO CENTRAL aprobado (con su enfoque) y el MATERIAL permitido.

Revisa cada afirmación del guion y marca como "sin respaldo" TODA cifra, porcentaje, precio, fecha, nombre propio, caso, estudio o estadística que no aparezca en el dato central, el enfoque o el material, y toda afirmación que sea falsa o exagerada. La frase final que invita al canal de ofertas (si existe) no se revisa.

Si hay afirmaciones sin respaldo, reescribe el guion eliminándolas o suavizándolas, manteniendo el gancho, el tono hablado colombiano, la longitud (más o menos 10 palabras) y la frase final de promoción si existe. El guion corregido va en texto plano, sin markdown ni símbolos.

Responde ÚNICAMENTE con JSON válido:
{"ok": true, "afirmaciones_sin_respaldo": [], "guion_corregido": ""}
"ok" es false si encontraste algo sin respaldo; en ese caso "guion_corregido" trae el guion completo ya corregido.`;

const promptIdeacion = (p) => `${p.ideacion_rol}\n\n${p.ideacion_reglas}\n\n${ESQUEMA_IDEAS}`;
const promptTitulos = (p) => `${p.titulos_rol}\n\n${p.titulos_reglas}\n\n${ESQUEMA_TITULOS}`;
const promptVerificacion = (p) => BASE_VERIFICACION + (p.verificacion_extra ? `\n\n${p.verificacion_extra}` : "");

function systemPromptGuion(cfg, p) {
  const palabras = Math.round((cfg.duracion_objetivo_seg / 60) * 150);
  const min = Math.round(palabras * 0.9);
  const max = Math.round(palabras * 1.1);
  const promo = cfg.promocion;
  const cierre = promo && promo.activa
    ? `AL FINAL, en TODOS los videos, cierra con UNA sola frase corta invitando a conocer el canal de ofertas, dicha como se lo contarías a un amigo: natural, relajada, nunca como anuncio. VARÍA la frase en cada video; por ejemplo: "si te interesa ahorrar, en mi perfil tengo un canal de ofertas", "en mi perfil de YouTube hay un canal de ofertas con descuentos diarios" o "el enlace lo dejo en los comentarios". NUNCA menciones URLs ni nombres exactos de canales en el audio.`
    : "";
  const estiloImg = cfg.estilo_imagenes || p.imagenes_ejemplos;
  return `Eres guionista experto en YouTube Shorts en español, para narración en voz colombiana. Estilo: ${cfg.estilo}.

${p.guion_hechos}

${p.guion_estructura} ${cierre}

${p.guion_prohibidas}

LONGITUD: entre ${min} y ${max} palabras (objetivo ${palabras}). Frases cortas, ritmo hablado, sin relleno.
FORMATO DEL TEXTO: texto plano para leer en voz alta. NUNCA uses markdown ni símbolos especiales (*, #, _, guiones de lista).

${p.ejemplos_tono}

Responde ÚNICAMENTE con JSON válido, sin markdown, con esta estructura exacta:
{
  "titulo": "copia el título de la idea tal cual, sin #Shorts",
  "guion": "el guion completo listo para narrar",
  "descripcion": "${p.descripcion_regla}",
  "hashtags": ["2 hashtags específicos del tema real, con # al inicio, nunca genéricos como #video o #viral"],
  "tags": ["15 a 25 tags de búsqueda en español, variaciones y sinónimos del tema que la gente buscaría en YouTube, sin repetir el título exacto"],
  "texto_miniatura": "${p.texto_miniatura_regla}",
  "palabras_clave_imagenes": ["6 a 10 frases cortas EN INGLÉS para buscar fotos de stock. Estilo de imágenes para este canal: ${estiloImg}. Deben ser concretas y fotografiables (personas, objetos, lugares, paisajes). PROHIBIDO pedir logos, marcas, interfaces, capturas de pantalla o representaciones literales de personajes o escenas bíblicas, porque no existen en bancos de fotos"]
}`;
}

function userPromptGuion(idea, cfg) {
  const material = idea.material_citado
    ? `${idea.material_citado.fuente} | ${idea.material_citado.titulo} | ${idea.material_citado.resumen}`
    : "ninguno: usa solo el dato central y el enfoque";
  return `IDEA ELEGIDA:
Título: ${idea.titulo}
Gancho: ${idea.gancho}
${idea.pasaje ? `Pasaje bíblico (cita esta referencia exacta, tal cual): ${idea.pasaje}\n` : ""}Dato central (aprobado): ${idea.dato_central}
Enfoque: ${idea.enfoque || ""}
Sub-nicho: ${idea.sub_nicho}${idea.formula ? ` | Fórmula: ${idea.formula}` : ""}

MATERIAL DE REFERENCIA (único origen de hechos junto con el dato central):
${material}

Canal: ${cfg.nombre_canal}`;
}

// ---------- Etapas ----------
async function ideacionConLLM({ subNicho, formula, material, angulos, enfriando, rendimiento, p }) {
  const user = [
    `SUB-NICHO: ${subNicho.nombre}`,
    formula ? `FÓRMULA: ${formula}` : "",
    `MATERIAL:\n${material.length ? material.map((m, i) => `[${i + 1}] ${m.fuente} | ${m.titulo} | ${m.resumen}`).join("\n") : "(sin material: usa solo conocimiento_estable)"}`,
    `TÍTULOS YA USADOS: ${angulos.join(" | ")}`,
    `TEMAS EN ENFRIAMIENTO: ${[...enfriando].join(", ")}`,
    rendimiento && rendimiento.mejores && rendimiento.mejores.length
      ? `SHORTS QUE MEJOR FUNCIONARON (entiende el patrón, no los copies): ${rendimiento.mejores.slice(0, 5).map((v) => v.titulo).join(" | ")}\nLOS QUE PEOR: ${(rendimiento.peores || []).slice(0, 5).map((v) => v.titulo).join(" | ")}`
      : "",
  ].filter(Boolean).join("\n\n");
  const r = await llamarGroqJSON(promptIdeacion(p), user, 0.8);
  const suma = (q) => (q.gancho || 0) + (q.novedad || 0) + (q.verificabilidad || 0) + (q.utilidad || 0);
  const buenas = (r.ideas || []).filter(
    (i) => i && i.titulo && i.gancho && i.dato_central && i.puntajes && i.puntajes.verificabilidad >= 4 &&
      F.largoTituloOk(i.titulo) && !enfriando.has(i.tema_clave) && !angulos.some((a) => F.similares(a, i.titulo))
  );
  if (!buenas.length) throw new Error("La ideación no produjo ideas válidas");
  buenas.sort((a, b) => suma(b.puntajes) - suma(a.puntajes));
  const mejor = buenas[0];
  const n = Number(mejor.fuente);
  const citado = Number.isInteger(n) && material[n - 1] ? material[n - 1] : null;
  return { ...mejor, id: null, sub_nicho: subNicho.clave, formula, material_citado: citado, enfoque: mejor.enfoque || "" };
}

// Para ideas del banco que no traen título/gancho (Biblia) o que se reciclaron: el LLM propone 5 y el código elige.
async function completarIdea(idea, p, angulos) {
  const user = `IDEA:
${idea.pasaje ? `Pasaje: ${idea.pasaje}\n` : ""}Dato central: ${idea.dato_central}
Enfoque: ${idea.enfoque || ""}

TÍTULOS YA USADOS: ${angulos.join(" | ")}`;
  const r = await llamarGroqJSON(promptTitulos(p), user, 0.8);
  const prohibidos = /^(descubre|incre[ií]ble|el secreto)/i;
  const suma = (q) => (q.gancho || 0) + (q.claridad || 0) + (q.curiosidad || 0);
  const opciones = (r.opciones || []).filter(
    (o) => o && o.titulo && o.gancho && F.largoTituloOk(o.titulo) && !prohibidos.test(o.titulo.trim()) &&
      !angulos.some((a) => F.similares(a, o.titulo))
  );
  if (!opciones.length) throw new Error("No se obtuvieron títulos válidos para la idea " + (idea.id || ""));
  opciones.sort((a, b) => suma(b.puntajes || {}) - suma(a.puntajes || {}));
  return { ...idea, titulo: opciones[0].titulo.replace(/#shorts/gi, "").trim(), gancho: opciones[0].gancho.trim() };
}

async function guionVerificado(idea, cfg, p) {
  const system = systemPromptGuion(cfg, p);
  const user = userPromptGuion(idea, cfg);
  let salida = await llamarGroqJSON(system, user, 0.7);
  for (const campo of ["guion", "descripcion", "tags", "texto_miniatura", "palabras_clave_imagenes"]) {
    if (!salida[campo]) throw new Error(`Falta el campo "${campo}" en la respuesta de Groq`);
  }
  for (let intento = 0; intento < 2; intento++) {
    // Pausa entre llamadas: el TPM de Groq es por ventana de 60s, y el flujo
    // hace guion + verificación; sin espacio se agota la cuota en ráfaga.
    await dormir(15000);
    const v = await llamarGroqJSON(
      promptVerificacion(p),
      `DATO CENTRAL: ${idea.dato_central}\nENFOQUE: ${idea.enfoque || ""}\n${idea.pasaje ? `PASAJE: ${idea.pasaje}\n` : ""}MATERIAL PERMITIDO: ${idea.material_citado ? idea.material_citado.titulo + " | " + idea.material_citado.resumen : "ninguno"}\nGUION:\n${salida.guion}`,
      0.2
    );
    if (v.ok === true) return salida;
    if (typeof v.guion_corregido === "string" && v.guion_corregido.trim().length >= 200) {
      salida.guion = v.guion_corregido.trim();
    } else {
      salida = await llamarGroqJSON(system, user, 0.7);
    }
  }
  return null; // no se pudo verificar
}

// YouTube limita los tags a 500 caracteres en total (misma lógica que generar_guion.js)
function recortarTags(tags) {
  let t = (Array.isArray(tags) ? tags : []).map((x) => String(x).trim().replace(/^,|,$/g, "")).filter(Boolean);
  let total = t.join(",").length;
  while (t.length > 1 && total > 500) { t.pop(); total = t.join(",").length; }
  if (total > 500) t = [t[0].slice(0, 499)];
  return t;
}

async function ejecutar(cfg, nombreConfig) {
  if (!GROQ_API_KEY) throw new Error("Falta GROQ_API_KEY");
  const v2 = cfg.v2 || {};
  if (!v2.perfil || !v2.banco) throw new Error('El config con "flujo_v2" necesita v2.perfil y v2.banco');
  const p = require(`./perfiles/${v2.perfil}`);
  const dryRun = process.env.DRY_RUN === "1";
  const hoy = Date.now();
  const fechaHoy = new Date(hoy).toISOString().slice(0, 10);
  const META = path.join(HISTORIAL_DIR, `${nombreConfig}_meta.json`);
  const PENDIENTE = path.join(HISTORIAL_DIR, `pendiente_${nombreConfig}.json`);
  const ANGULOS = path.join(HISTORIAL_DIR, `${nombreConfig}_angulos.json`);
  fs.mkdirSync(HISTORIAL_DIR, { recursive: true });

  const meta = leerJSON(META, []);
  const banco = leerJSON(path.join(BASE, v2.banco), { ideas: [] }).ideas;
  const angulos = leerJSON(ANGULOS, []).slice(-40);
  const rendimiento = v2.rendimiento ? leerJSON(path.join(BASE, v2.rendimiento), null) : null;
  const diasTema = v2.cooldown_dias ?? 14;
  const diasPasaje = v2.cooldown_pasaje_dias || 0;
  const opcionesBanco = { banco, meta, subNichos: cfg.sub_nichos, hoy, diasTema, diasPasaje, reciclar: !!v2.reciclar };

  for (let t = 1; t <= 3; t++) {
    let sel = S.elegirIdeaDelBanco(opcionesBanco);
    let idea, subNicho;
    if (sel) {
      idea = { ...sel.idea, material_citado: null };
      subNicho = sel.sub_nicho;
    } else if (v2.plan_b) {
      subNicho = S.ordenSubNichos(cfg.sub_nichos, meta)[0];
      const formula = S.elegirFormula(cfg.formulas, meta);
      const material = await buscarCandidatos(cfg.feeds);
      console.log(`Plan B: sub-nicho ${subNicho.clave}, ${material.length} noticias disponibles`);
      idea = await ideacionConLLM({ subNicho, formula, material, angulos, enfriando: S.temasEnEnfriamiento(meta, hoy, diasTema), rendimiento, p });
    } else {
      // Sin plan B: se relajan los enfriamientos y se permite reciclar antes de rendirse
      sel = S.elegirIdeaDelBanco({ ...opcionesBanco, diasTema: 0, diasPasaje: 0, reciclar: true });
      if (!sel) throw new Error("El banco no tiene ideas utilizables: hay que ampliarlo o verificar más ideas");
      console.log("⚠️  Se relajaron los enfriamientos de temas para poder elegir una idea");
      idea = { ...sel.idea, material_citado: null };
      subNicho = sel.sub_nicho;
    }
    if (!idea.titulo || !idea.gancho) idea = await completarIdea(idea, p, angulos);
    console.log(`Intento ${t}: idea ${idea.id || "(LLM)"} | ${idea.titulo}`);

    let salida = null;
    try {
      salida = await guionVerificado(idea, cfg, p);
    } catch (e) {
      // Un límite de tasa no es culpa de la idea: no quemarla, fallar y que reintente el workflow
      if (/rate_limit_exceeded|Rate limit reached|Groq API error 429/i.test(String(e.message))) throw e;
      console.log(`⚠️  Falló la generación del guion: ${e.message}`);
    }
    if (!salida) {
      console.log("Se descarta esta idea (no pasó la verificación).");
      if (idea.id) {
        meta.push({ fecha: fechaHoy, idea_id: idea.id, estado: "descartada" });
        if (!dryRun) fs.writeFileSync(META, JSON.stringify(meta, null, 2), "utf-8");
      }
      continue;
    }

    const promo = cfg.promocion;
    const hashtags = F.sanearHashtags(salida.hashtags, v2.hashtags_default);
    const parrafo = F.limpiarParrafo(salida.descripcion);
    const inicial = v2.linea_inicial && idea.pasaje ? v2.linea_inicial.replace("{pasaje}", idea.pasaje) : null;
    const tituloFinal = F.ajustarTitulo(idea.titulo);

    const outputData = {
      canal: cfg.nombre_canal,
      voz: cfg.voz,
      formato: cfg.formato || "horizontal",
      tema: idea.titulo,
      fecha_generacion: new Date().toISOString(),
      titulo: tituloFinal,
      guion: String(salida.guion).trim(),
      descripcion: F.armarDescripcion(parrafo, promo, hashtags, inicial),
      descripcion_facebook: F.armarDescripcionFacebook(parrafo, promo, hashtags, v2.cierre_facebook, inicial),
      hashtags,
      tags: recortarTags(salida.tags),
      texto_miniatura: salida.texto_miniatura,
      palabras_clave_imagenes: salida.palabras_clave_imagenes,
    };

    if (dryRun) {
      console.log(JSON.stringify(outputData, null, 2));
      console.log(`📝 Palabras: ${outputData.guion.split(/\s+/).length}`);
      return outputData;
    }

    const outputDir = path.join(BASE, "output");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "guion.json"), JSON.stringify(outputData, null, 2), "utf-8");
    // Registro pendiente: se confirma en el meta solo si YouTube subió el video (scripts/confirmar_meta.js)
    fs.writeFileSync(
      PENDIENTE,
      JSON.stringify({
        fecha: fechaHoy, titulo: tituloFinal, tema_clave: idea.tema_clave, sub_nicho: subNicho.clave,
        formula: idea.formula || null, idea_id: idea.id || null, pasaje: idea.pasaje || null,
        fuente: idea.material_citado ? idea.material_citado.fuente : "conocimiento_estable",
      }, null, 2),
      "utf-8"
    );
    fs.writeFileSync(ANGULOS, JSON.stringify([...angulos, tituloFinal].slice(-40), null, 2), "utf-8");
    console.log(`✅ Guion generado: ${tituloFinal}`);
    console.log(`📝 Palabras: ${outputData.guion.split(/\s+/).length}`);
    return outputData;
  }
  throw new Error("No se pudo generar un guion verificado tras 3 intentos");
}

module.exports = { ejecutar };
