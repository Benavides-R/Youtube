/**
 * generar_cita_biblica.js
 * ------------------------------------------------------------
 * Genera un versículo del día + descripción humanizada, listo
 * para convertirse en una tarjeta de imagen. Es independiente
 * del pipeline de videos — no lo toca ni depende de él.
 *
 * Uso:
 *   GROQ_API_KEY=xxx node scripts/generar_cita_biblica.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

if (!GROQ_API_KEY) {
  console.error("❌ Falta GROQ_API_KEY");
  process.exit(1);
}

const BASE_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BASE_DIR, "config", "canal_biblia_imagen.json");
const HISTORIAL_PATH = path.join(BASE_DIR, "historial", "canal_biblia_imagen.json");
const HISTORIAL_VERSICULOS_PATH = path.join(BASE_DIR, "historial", "canal_biblia_imagen_versiculos.json");

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

// Anti-repetición, igual que en generar_guion.js
let historial = [];
if (fs.existsSync(HISTORIAL_PATH)) {
  try {
    historial = JSON.parse(fs.readFileSync(HISTORIAL_PATH, "utf-8"));
  } catch {
    historial = [];
  }
}
let disponibles = config.temas.filter((t) => !historial.includes(t));
if (disponibles.length === 0) disponibles = config.temas;
const temaElegido = disponibles[Math.floor(Math.random() * disponibles.length)];
const nuevoHistorial = historial.includes(temaElegido) ? historial : [...historial, temaElegido];

let historialVersiculos = [];
if (fs.existsSync(HISTORIAL_VERSICULOS_PATH)) {
  try {
    historialVersiculos = JSON.parse(fs.readFileSync(HISTORIAL_VERSICULOS_PATH, "utf-8"));
  } catch {
    historialVersiculos = [];
  }
}
// Solo guardamos las últimas 30 referencias, para no bloquear para siempre
const ultimasReferencias = historialVersiculos.slice(-30);
const excluirReferencias =
  ultimasReferencias.length > 0
    ? `NO uses ninguna de estas referencias que ya se usaron recientemente: ${ultimasReferencias.join(", ")}. Elige un versículo distinto a esos.`
    : "";

const systemPrompt = `Eres un experto en la Biblia que crea contenido para tarjetas de versículo en redes sociales.
IMPORTANTE sobre el lenguaje: usa una traducción con lenguaje universal/ecuménico (tipo Nueva Versión Internacional o Dios Habla Hoy), usando términos como "Dios", "Señor", "Padre", "Jesús". EVITA el nombre "Jehová" (específico de la traducción Reina-Valera y asociado a una denominación particular) — si el versículo que elegiste lo usa en esa traducción, elige la misma cita pero en una traducción que use "Señor" o "Dios" en su lugar, sin cambiar el significado ni inventar el texto.
${excluirReferencias}
Responde ÚNICAMENTE en formato JSON válido, sin markdown, con esta estructura exacta:
{
  "verso": "el texto EXACTO del versículo bíblico, corto (máx 25 palabras), en español, cita textual real y precisa",
  "referencia": "libro capítulo:versículo, ej: 'Filipenses 4:13'",
  "descripcion": "descripción para Facebook escrita EXACTAMENTE como si tú mismo la hubieras tecleado a mano ahora mismo, cálida y natural, reflexionando brevemente sobre este versículo y por qué lo elegiste hoy — algo personal, no genérico, 2-3 líneas, lenguaje simple y cotidiano. Termina con SOLO 2-3 hashtags (no más) relacionados específicamente al tema del versículo, nunca genéricos. NUNCA incluyas ningún link o URL.",
  "palabras_clave_imagen": ["4 a 6 palabras cortas EN INGLÉS para buscar una foto de fondo atmosférica en un banco de imágenes, estilo: ${config.estilo_imagenes}"]
}`;

async function generarCita() {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Tema: ${temaElegido}` },
      ],
      temperature: 0.8,
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices[0].message.content);

  for (const campo of ["verso", "referencia", "descripcion", "palabras_clave_imagen"]) {
    if (!parsed[campo]) throw new Error(`Falta el campo "${campo}" en la respuesta de Groq`);
  }
  return parsed;
}

(async () => {
  try {
    console.log(`🎯 Tema elegido: ${temaElegido}`);
    let resultado;
    const MAX_INTENTOS = 3;
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      try {
        resultado = await generarCita();
        break;
      } catch (err) {
        const esLimiteDeTasa = err.message.includes("rate_limit_exceeded");
        const esFaltaDeEspacio = err.message.includes("max completion tokens") || err.message.includes("json_validate_failed");
        if ((esLimiteDeTasa || esFaltaDeEspacio) && intento < MAX_INTENTOS) {
          const espera = esLimiteDeTasa ? 20000 : 3000 * intento;
          console.log(`⚠️  Intento ${intento} falló, esperando ${espera / 1000}s y reintentando...`);
          await new Promise((r) => setTimeout(r, espera));
        } else {
          throw err;
        }
      }
    }

    if (ultimasReferencias.includes(resultado.referencia)) {
      console.log(`⚠️  Repitió una referencia reciente (${resultado.referencia}), reintentando...`);
      resultado = await generarCita();
    }

    const nuevoHistorialVersiculos = [...historialVersiculos, resultado.referencia].slice(-30);
    if (!fs.existsSync(path.dirname(HISTORIAL_VERSICULOS_PATH))) fs.mkdirSync(path.dirname(HISTORIAL_VERSICULOS_PATH), { recursive: true });
    fs.writeFileSync(HISTORIAL_VERSICULOS_PATH, JSON.stringify(nuevoHistorialVersiculos, null, 2));

    if (!fs.existsSync(path.dirname(HISTORIAL_PATH))) fs.mkdirSync(path.dirname(HISTORIAL_PATH), { recursive: true });
    fs.writeFileSync(HISTORIAL_PATH, JSON.stringify(nuevoHistorial, null, 2));

    const outputDir = path.join(BASE_DIR, "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "cita.json"), JSON.stringify(resultado, null, 2));

    console.log(`✅ Versículo generado: "${resultado.verso}" — ${resultado.referencia}`);
  } catch (err) {
    console.error("❌ Error generando la cita:", err.message);
    process.exit(1);
  }
})();
