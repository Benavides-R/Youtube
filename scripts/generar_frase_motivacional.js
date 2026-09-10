/**
 * generar_frase_motivacional.js
 * ------------------------------------------------------------
 * Genera una frase motivacional (estoicismo, superación,
 * algo de Biblia) con descripción humanizada para la tarjeta
 * de imagen de Superate777.
 *
 * Uso:
 *   GROQ_API_KEY=xxx node scripts/generar_frase_motivacional.js
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
const CONFIG_PATH = path.join(BASE_DIR, "config", "canal_superate_imagen.json");
const HISTORIAL_PATH = path.join(BASE_DIR, "historial", "canal_superate_imagen.json");
const HISTORIAL_FRASES_PATH = path.join(BASE_DIR, "historial", "canal_superate_imagen_frases.json");

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

// Anti-repetición de temas
let historial = [];
if (fs.existsSync(HISTORIAL_PATH)) {
  try { historial = JSON.parse(fs.readFileSync(HISTORIAL_PATH, "utf-8")); } catch { historial = []; }
}
let disponibles = config.temas.filter((t) => !historial.includes(t));
if (disponibles.length === 0) disponibles = config.temas;
const temaElegido = disponibles[Math.floor(Math.random() * disponibles.length)];
const nuevoHistorial = historial.includes(temaElegido) ? historial : [...historial, temaElegido];

// Anti-repetición de frases exactas
let historialFrases = [];
if (fs.existsSync(HISTORIAL_FRASES_PATH)) {
  try { historialFrases = JSON.parse(fs.readFileSync(HISTORIAL_FRASES_PATH, "utf-8")); } catch { historialFrases = []; }
}
const ultimasFrases = historialFrases.slice(-25);
const excluirFrases = ultimasFrases.length > 0
  ? `NO uses ninguna de estas frases que ya se usaron recientemente: ${ultimasFrases.join(" | ")}. Elige una diferente.`
  : "";

const systemPrompt = `Eres un experto en desarrollo personal, filosofía estoica y libros de superación que crea contenido para tarjetas motivacionales en redes sociales.
${excluirFrases}
Cuando el tema pide una frase de un autor específico (Joseph Murphy, Brian Tracy, Napoleon Hill, Jim Rohn, Tony Robbins, Stephen Covey, Dale Carnegie, Og Mandino, Robin Sharma, Paulo Coelho, Marco Aurelio, Epicteto, Séneca), elige una frase REAL y RECONOCIDA de ese autor — que la gente que conoce sus libros la reconozca o que suene auténtica a su estilo. Si no tienes certeza de la frase exacta, parafrasea fielmente el concepto central de ese autor en su estilo característico.
Responde ÚNICAMENTE en formato JSON válido, sin markdown, con esta estructura exacta:
{
  "frase": "la frase motivacional EN ESPAÑOL, máx 20 palabras, elegante e impactante, fiel al estilo del autor o concepto pedido. SIEMPRE en español, nunca en inglés ni otro idioma",
  "autor": "el nombre exacto del autor o fuente (ej: 'Joseph Murphy', 'Brian Tracy', 'Marco Aurelio', 'Proverbios 3:5') — SIEMPRE incluir",
  "descripcion": "descripción para Facebook escrita EXACTAMENTE como si tú (el dueño del canal) la escribieras a mano ahora mismo, reflexionando brevemente sobre esta frase y por qué te impactó. Tono cálido y directo, 2-3 líneas, lenguaje simple y cotidiano. Termina con SOLO 2-3 hashtags específicos al tema, nunca genéricos. NUNCA incluyas links ni URLs.",
  "palabras_clave_imagen": ["4 a 6 palabras cortas EN INGLÉS para buscar foto de fondo atmosférica en Pexels, estilo: ${config.estilo_imagenes}. IMPORTANTE: busca SOLO imágenes de naturaleza, paisajes o personas en silueta — NUNCA uses términos como 'quote', 'text', 'motivation poster', 'success text' ni nada que pueda devolver fotos con texto impreso en inglés visible, ya que el canal es en español"]
}`;

async function generarFrase() {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Tema: ${temaElegido}` },
      ],
      temperature: 0.85,
      max_completion_tokens: 1000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  for (const campo of ["frase", "autor", "descripcion", "palabras_clave_imagen"]) {
    if (!parsed[campo]) throw new Error(`Falta el campo "${campo}" en la respuesta`);
  }
  return parsed;
}

(async () => {
  try {
    console.log(`🎯 Tema elegido: ${temaElegido}`);
    let resultado;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        resultado = await generarFrase();
        break;
      } catch (err) {
        const esLimiteDeTasa = err.message.includes("rate_limit_exceeded");
        const esFaltaEspacio = err.message.includes("json_validate_failed") || err.message.includes("max completion tokens");
        if ((esLimiteDeTasa || esFaltaEspacio) && intento < 3) {
          const espera = esLimiteDeTasa ? 20000 : 3000 * intento;
          console.log(`⚠️  Intento ${intento} falló, esperando ${espera / 1000}s...`);
          await new Promise((r) => setTimeout(r, espera));
        } else throw err;
      }
    }

    // Guardar historial
    if (!fs.existsSync(path.dirname(HISTORIAL_PATH))) fs.mkdirSync(path.dirname(HISTORIAL_PATH), { recursive: true });
    fs.writeFileSync(HISTORIAL_PATH, JSON.stringify(nuevoHistorial, null, 2));
    const nuevoHistorialFrases = [...historialFrases, resultado.frase].slice(-25);
    fs.writeFileSync(HISTORIAL_FRASES_PATH, JSON.stringify(nuevoHistorialFrases, null, 2));

    const outputDir = path.join(BASE_DIR, "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "frase.json"), JSON.stringify(resultado, null, 2));

    console.log(`✅ Frase generada: "${resultado.frase}" — ${resultado.autor}`);
  } catch (err) {
    console.error("❌ Error generando la frase:", err.message);
    process.exit(1);
  }
})();
