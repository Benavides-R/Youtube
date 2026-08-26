/**
 * generar_guion.js
 * ------------------------------------------------------------
 * Elige un tema al azar (según el canal) y genera con Groq:
 *   - título optimizado para YouTube
 *   - guion completo (para TTS)
 *   - descripción
 *   - tags
 *
 * Uso:
 *   GROQ_API_KEY=xxx node generar_guion.js <canal_config.json>
 *
 * Output:
 *   Escribe output/guion.json con toda la data lista para
 *   el siguiente módulo (generar_audio.py)
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

if (!GROQ_API_KEY) {
  console.error("❌ Falta GROQ_API_KEY en las variables de entorno");
  process.exit(1);
}

// ------------------------------------------------------------
// 1. Cargar configuración del canal
// ------------------------------------------------------------
const configPath = process.argv[2];
if (!configPath) {
  console.error("❌ Uso: node generar_guion.js <ruta_config_canal.json>");
  process.exit(1);
}

const canalConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
// Ejemplo de canalConfig esperado:
// {
//   "nombre_canal": "Datos Curiosos MX",
//   "voz": "es-MX-JorgeNeural",
//   "duracion_objetivo_seg": 60,
//   "temas": ["historia de México", "curiosidades del espacio", "datos de animales", ...],
//   "estilo": "informal, directo, con datos sorprendentes, tono mexicano"
// }

// ------------------------------------------------------------
// Historial: evita repetir tema hasta agotar toda la lista
// ------------------------------------------------------------
const nombreConfig = path.basename(configPath, ".json");
const HISTORIAL_DIR = path.join(__dirname, "..", "historial");
const HISTORIAL_PATH = path.join(HISTORIAL_DIR, `${nombreConfig}.json`);

if (!fs.existsSync(HISTORIAL_DIR)) fs.mkdirSync(HISTORIAL_DIR, { recursive: true });

let historial = [];
if (fs.existsSync(HISTORIAL_PATH)) {
  try {
    historial = JSON.parse(fs.readFileSync(HISTORIAL_PATH, "utf-8"));
  } catch {
    historial = [];
  }
}

function elegirTemaSinRepetir(temas, historialUsados) {
  let disponibles = temas.filter((t) => !historialUsados.includes(t));
  if (disponibles.length === 0) {
    // Ya se usaron todos, reiniciamos la vuelta
    disponibles = temas;
    historialUsados = [];
  }
  const idx = Math.floor(Math.random() * disponibles.length);
  const elegido = disponibles[idx];
  const nuevoHistorial = [...historialUsados, elegido];
  return { elegido, nuevoHistorial };
}

const { elegido: temaElegido, nuevoHistorial } = elegirTemaSinRepetir(canalConfig.temas, historial);
fs.writeFileSync(HISTORIAL_PATH, JSON.stringify(nuevoHistorial, null, 2), "utf-8");
console.log(`🎯 Tema elegido: ${temaElegido}`);
console.log(`📋 Temas usados en esta vuelta: ${nuevoHistorial.length}/${canalConfig.temas.length}`);

// ------------------------------------------------------------
// 2. Prompt para Groq
// ------------------------------------------------------------
const palabrasObjetivo = Math.round((canalConfig.duracion_objetivo_seg / 60) * 150);
// ~150 palabras por minuto hablado a ritmo normal

const estiloImagenes = canalConfig.estilo_imagenes ||
  "una mezcla de imágenes conceptuales relacionadas al tema y planos atmosféricos genéricos (no busques capturas de pantalla literales de apps o interfaces, esas no existen en bancos de fotos)";

const systemPrompt = `Eres guionista experto en contenido viral de YouTube en español.
Escribes guiones para narración en voz colombiana, estilo: ${canalConfig.estilo}.
Tu guion debe:
- Enganchar en la primera frase (sin saludos tipo "hola a todos"). VARÍA el tipo de gancho cada vez: a veces una pregunta directa, a veces un dato impactante, a veces una afirmación polémica, a veces una historia corta — NUNCA uses la misma fórmula de apertura en cada guion
- Ir directo al contenido, sin relleno
- Tener ritmo natural para ser leído en voz alta
- VARÍA también el cierre: a veces una reflexión, a veces una pregunta al oyente, a veces un dato final sorprendente — no repitas siempre la misma frase de despedida
- Terminar con un cierre que invite a seguir el canal (sin ser genérico tipo "no olvides suscribirte")
- Longitud objetivo: ${palabrasObjetivo} palabras. ESTO ES IMPORTANTE: nunca entregues menos de ${Math.round(palabrasObjetivo * 0.9)} palabras, desarrolla el tema con ejemplos y contexto suficiente para llegar a la longitud pedida, no lo resumas de forma corta.
- NUNCA uses markdown ni símbolos especiales (nada de *, #, _, guiones para listas, etc). Es texto plano que se va a leer en voz alta palabra por palabra, cualquier símbolo se escucharía literal.

Responde ÚNICAMENTE en formato JSON válido, sin texto adicional, sin markdown, con esta estructura exacta:
{
  "titulo": "título llamativo, máx 60 caracteres, con gancho",
  "guion": "el guion completo listo para narrar",
  "descripcion": "descripción para YouTube, 2-3 líneas, con contexto y llamado a la acción",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "texto_miniatura": "SOLO 3 A 5 PALABRAS en mayúsculas, muy impactante y corto, tipo miniatura de YouTube (ej: 'EL ERROR QUE NADIE VE', 'ESTO CAMBIA TODO'). Debe generar curiosidad extrema, distinto al título completo",
  "palabras_clave_imagenes": ["6 a 10 palabras o frases cortas EN INGLÉS para buscar fotos de stock. Estilo de imágenes para este canal: ${estiloImagenes}"]
}`;

const userPrompt = `Tema: ${temaElegido}
Canal: ${canalConfig.nombre_canal}`;

// ------------------------------------------------------------
// 3. Llamada a la API de Groq
// ------------------------------------------------------------
async function generarGuion() {
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
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9, // más creatividad, cada video debe sentirse distinto
      max_completion_tokens: 2200,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`No se pudo parsear la respuesta de Groq como JSON:\n${content}`);
  }

  // Validación básica de estructura
  const camposRequeridos = ["titulo", "guion", "descripcion", "tags", "texto_miniatura", "palabras_clave_imagenes"];
  for (const campo of camposRequeridos) {
    if (!parsed[campo]) {
      throw new Error(`Falta el campo "${campo}" en la respuesta de Groq`);
    }
  }

  return parsed;
}

// ------------------------------------------------------------
// 4. Ejecutar y guardar output
// ------------------------------------------------------------
(async () => {
  try {
    let resultado;
    try {
      resultado = await generarGuion();
    } catch (err) {
      const esLimiteDeTasa = err.message.includes("rate_limit_exceeded");
      const esFaltaDeEspacio = err.message.includes("max completion tokens") || err.message.includes("json_validate_failed");
      if (esLimiteDeTasa || esFaltaDeEspacio) {
        const espera = esLimiteDeTasa ? 20000 : 2000;
        console.log(`⚠️  ${esLimiteDeTasa ? "Límite de tasa alcanzado" : "Groq se quedó sin espacio"}, esperando ${espera / 1000}s y reintentando...`);
        await new Promise((r) => setTimeout(r, espera));
        resultado = await generarGuion();
      } else {
        throw err;
      }
    }

    const outputDir = path.join(__dirname, "..", "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const outputData = {
      canal: canalConfig.nombre_canal,
      voz: canalConfig.voz,
      tema: temaElegido,
      fecha_generacion: new Date().toISOString(),
      ...resultado,
    };

    const outputPath = path.join(outputDir, "guion.json");
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");

    console.log(`✅ Guion generado: ${outputData.titulo}`);
    console.log(`📝 Palabras: ${outputData.guion.split(/\s+/).length}`);
    console.log(`💾 Guardado en: ${outputPath}`);
  } catch (err) {
    console.error("❌ Error generando el guion:", err.message);
    process.exit(1);
  }
})();
