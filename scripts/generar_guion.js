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

const formato = canalConfig.formato || "horizontal"; // "vertical" = short
const esShort = formato === "vertical";

const estiloImagenes = canalConfig.estilo_imagenes ||
  "una mezcla de imágenes conceptuales relacionadas al tema y planos atmosféricos genéricos (no busques capturas de pantalla literales de apps o interfaces, esas no existen en bancos de fotos)";

const instruccionesFormato = esShort
  ? `Este es un YOUTUBE SHORT (video vertical corto). Reglas específicas:
- Un SOLO punto/idea, no desarrolles varios temas, ve directo a lo más impactante
- El gancho debe estar en la PRIMERA frase, sin ninguna introducción, la gente decide en 1-2 segundos si sigue viendo
- Ritmo rápido, frases cortas, sin relleno de ningún tipo
- Cierre muy breve, casi inmediato después del dato principal`
  : `Este es un video largo. Desarrolla el tema con ejemplos y contexto suficiente.`;

const promo = canalConfig.promocion;
const instruccionPromocion =
  promo && promo.activa
    ? `\nCuando conecte de forma natural con el tema (no en todos los videos, solo cuando tenga sentido real), puedes mencionar de forma MUY sutil y casual tu canal de ofertas de tecnología en Telegram — nunca como venta forzada, nunca con tono de anuncio o vendedor. Debe sonar como un comentario espontáneo de pasada, tipo "por cierto, en mi canal de Telegram comparto ofertas así" — sin insistir, sin urgencia, sin palabras tipo "no te lo pierdas" o "aprovecha ya". Si el tema no se presta naturalmente para mencionarlo, mejor NO lo menciones esa vez.`
    : "";

const systemPrompt = `Eres guionista experto en contenido viral de YouTube en español.
Escribes guiones para narración en voz colombiana, estilo: ${canalConfig.estilo}.
${instruccionesFormato}${instruccionPromocion}
Tu guion debe:
- Enganchar en la primera frase (sin saludos tipo "hola a todos"). VARÍA el tipo de gancho cada vez: a veces una pregunta directa, a veces un dato impactante, a veces una afirmación polémica, a veces una historia corta — NUNCA uses la misma fórmula de apertura en cada guion
- Ir directo al contenido, sin relleno
- Tener ritmo natural para ser leído en voz alta
- VARÍA también el cierre: a veces una reflexión, a veces una pregunta al oyente, a veces un dato final sorprendente — no repitas siempre la misma frase de despedida
- Longitud objetivo: ${palabrasObjetivo} palabras. ${esShort ? "No te pases de esta cantidad, un short debe ser corto y directo." : `ESTO ES IMPORTANTE: nunca entregues menos de ${Math.round(palabrasObjetivo * 0.9)} palabras, desarrolla el tema con ejemplos y contexto suficiente para llegar a la longitud pedida, no lo resumas de forma corta.`}
- NUNCA uses markdown ni símbolos especiales (nada de *, #, _, guiones para listas, etc). Es texto plano que se va a leer en voz alta palabra por palabra, cualquier símbolo se escucharía literal.

Responde ÚNICAMENTE en formato JSON válido, sin texto adicional, sin markdown, con esta estructura exacta:
{
  "titulo": "título llamativo, máx 60 caracteres, con gancho${esShort ? ", incluye la palabra Shorts o #Shorts al final" : ""}",
  "guion": "el guion completo listo para narrar",
  "descripcion": "descripción para YouTube/Facebook escrita en primera persona, como si TÚ (el dueño del canal) la escribieras a mano, tono natural y conversacional, NO genérica ni de plantilla, 2-4 líneas conectadas específicamente al tema del video (no frases que sirvan para cualquier video)${esShort ? ". Incluye #Shorts entre los hashtags" : ""}${promo && promo.activa ? `. Al final, de forma SUTIL (no como anuncio), menciona el canal de ofertas: '🔥 ${promo.link_telegram}'` : ""}. Cierra con 4-6 hashtags relacionados específicamente al tema del video (no genéricos como #video o #viral, deben ser sobre el contenido real, ej: si el tema es sobre baterías de celular, usar #Android #TipsAndroid #Bateria #Tecnologia, etc.)",
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
      max_completion_tokens: 3200,
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
// 3.5. Segunda pasada: "editor" que pule el guion para que suene
// más natural en voz alta (corrige frases raras, repeticiones,
// cosas que un locutor humano jamás diría así). No cambia el
// contenido ni los datos, solo la redacción.
// ------------------------------------------------------------
async function pulirGuion(guionOriginal) {
  const tokensEstimados = Math.min(2200, Math.ceil(guionOriginal.split(/\s+/).length * 2) + 200);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Eres un editor de guiones para narración en voz alta. Te dan un texto y tu trabajo es SOLO pulir la redacción: corregir frases que suenen raras, artificiales o repetitivas cuando se leen en voz alta, mejorar la fluidez natural. NO cambies datos, hechos, ni el largo del texto de forma significativa, NO agregues ni quites contenido, NO uses markdown ni símbolos. Responde ÚNICAMENTE con el texto pulido, sin explicaciones ni comentarios.",
        },
        { role: "user", content: guionOriginal },
      ],
      temperature: 0.4, // menos creatividad acá, es edición, no reescritura libre
      max_completion_tokens: tokensEstimados,
    }),
  });

  if (!response.ok) {
    // Si falla la pulida, no es grave: seguimos con el guion original
    console.log("⚠️  No se pudo pulir el guion, se usa la versión original");
    return guionOriginal;
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ------------------------------------------------------------
// 4. Ejecutar y guardar output
// ------------------------------------------------------------
(async () => {
  try {
    let resultado;
    const MAX_INTENTOS = 3;
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      try {
        resultado = await generarGuion();
        break;
      } catch (err) {
        const esLimiteDeTasa = err.message.includes("rate_limit_exceeded");
        const esFaltaDeEspacio = err.message.includes("max completion tokens") || err.message.includes("json_validate_failed");
        if ((esLimiteDeTasa || esFaltaDeEspacio) && intento < MAX_INTENTOS) {
          const espera = esLimiteDeTasa ? 20000 : 3000 * intento;
          console.log(`⚠️  Intento ${intento} falló (${esLimiteDeTasa ? "límite de tasa" : "sin espacio"}), esperando ${espera / 1000}s y reintentando...`);
          await new Promise((r) => setTimeout(r, espera));
        } else {
          throw err;
        }
      }
    }

    console.log("✏️  Puliendo redacción del guion...");
    const guionOriginal = resultado.guion;
    const guionPulido = await pulirGuion(guionOriginal);

    const palabrasOriginal = guionOriginal.split(/\s+/).length;
    const palabrasPulido = guionPulido.trim().split(/\s+/).length;

    // Si la versión pulida quedó vacía o perdió más de la mitad del
    // contenido, algo salió mal (respuesta rota de Groq) — nos quedamos
    // con el guion original en vez de arruinar el video
    if (guionPulido.trim().length === 0 || palabrasPulido < palabrasOriginal * 0.5) {
      console.log("⚠️  La versión pulida se ve incompleta, se usa el guion original sin pulir");
      resultado.guion = guionOriginal;
    } else {
      resultado.guion = guionPulido;
    }

    const outputDir = path.join(__dirname, "..", "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const outputData = {
      canal: canalConfig.nombre_canal,
      voz: canalConfig.voz,
      formato,
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
