/**
 * subir_youtube.js
 * ------------------------------------------------------------
 * Sube output/video_final.mp4 a YouTube, usando el título,
 * descripción y tags que ya generamos en output/guion.json.
 * Requiere haber corrido antes autorizar_youtube.js una vez.
 *
 * Uso:
 *   node scripts/subir_youtube.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const BASE_DIR = path.join(__dirname, "..");
const CREDENTIALS_PATH = path.join(BASE_DIR, "config", "credentials.json");
const TOKEN_PATH = path.join(BASE_DIR, "config", "token.json");
const VIDEO_PATH = path.join(BASE_DIR, "output", "video_final.mp4");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");

// ------------------------------------------------------------
// 1. Validaciones
// ------------------------------------------------------------
for (const [nombre, ruta] of [
  ["credentials.json", CREDENTIALS_PATH],
  ["token.json (corre autorizar_youtube.js primero)", TOKEN_PATH],
  ["video_final.mp4 (corre ensamblar_video.js primero)", VIDEO_PATH],
  ["guion.json", GUION_PATH],
]) {
  if (!fs.existsSync(ruta)) {
    console.error(`❌ Falta: ${nombre}`);
    process.exit(1);
  }
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
const guionData = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));

const { client_id, client_secret } = credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost:3000/oauth2callback");
oAuth2Client.setCredentials(token);

const youtube = google.youtube({ version: "v3", auth: oAuth2Client });

// ------------------------------------------------------------
// 2. Capítulos (solo videos largos — ver generar_audio.py)
// ------------------------------------------------------------
function formatearTimestamp(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function agregarCapitulos(descripcion) {
  const capitulosPath = path.join(BASE_DIR, "output", "capitulos.json");
  if (!fs.existsSync(capitulosPath)) return descripcion;

  try {
    const { capitulos } = JSON.parse(fs.readFileSync(capitulosPath, "utf-8"));
    if (!Array.isArray(capitulos) || capitulos.length < 3) return descripcion;

    const bloque = [
      "⏱️ Momentos clave:",
      ...capitulos.map((c) => `${formatearTimestamp(c.segundos)} ${c.titulo}`),
    ].join("\n");

    // YouTube exige el primer capítulo en 0:00 y los timestamps en la
    // descripción — el bloque va al final, después de los hashtags.
    console.log(`📑 Agregando ${capitulos.length} capítulos a la descripción`);
    return `${descripcion.trim()}\n\n${bloque}`;
  } catch (err) {
    console.log(`⚠️  No se pudo leer capitulos.json (${err.message}) — se sube sin capítulos`);
    return descripcion;
  }
}

// ------------------------------------------------------------
// 2.5. Tags seguros para la API de YouTube
// ------------------------------------------------------------
// La API responde "invalidTags" si un tag tiene caracteres riesgosos
// (", \, <, >, {, }, |), si el total se pasa del límite real (YouTube
// cuenta los espacios con sobrecarga, así que 500 exactos se rechaza),
// o si la IA devolvió los tags como string en vez de array.
function sanitizarTags(bruto) {
  let lista = Array.isArray(bruto) ? bruto : typeof bruto === "string" ? bruto.split(",") : [];
  const limpio = [];
  for (let t of lista) {
    if (typeof t !== "string") t = String(t ?? "");
    t = t
      .replace(/["\\<>{}|]/g, "") // caracteres que YouTube rechaza
      .replace(/[\u0000-\u001F\u007F]/g, "") // caracteres de control
      .replace(/\s+/g, " ")
      .trim();
    if (t && !limpio.includes(t)) limpio.push(t);
  }
  // Margen de 450 (no 500): los espacios cuentan con sobrecarga del lado
  // de YouTube y 495 "nuestros" pueden ser >500 para ellos.
  let total = limpio.join(",").length;
  while (limpio.length > 1 && total > 450) {
    limpio.pop();
    total = limpio.join(",").length;
  }
  if (total > 450 && limpio.length > 0) {
    limpio.splice(1);
    limpio[0] = limpio[0].slice(0, 449);
  }
  console.log(`🏷️  Tags listos: ${limpio.length} (${limpio.join(",").length}/450 caracteres)`);
  return limpio;
}

// ------------------------------------------------------------
// 3. Subir el video
// ------------------------------------------------------------
async function subirVideo() {
  console.log(`📤 Subiendo: "${guionData.titulo}"...`);

  const tags = sanitizarTags(guionData.tags);
  const descripcion = agregarCapitulos(guionData.descripcion);

  const armarBody = (tagsFinales) => ({
    snippet: {
      title: guionData.titulo,
      description: descripcion,
      tags: tagsFinales,
      categoryId: "28", // "Science & Technology" — cámbialo según el canal
    },
    status: {
      privacyStatus: "private", // por seguridad: empieza en privado
      selfDeclaredMadeForKids: false,
    },
  });

  // Cada intento necesita su propio stream (el anterior queda consumido)
  const intentar = (tagsFinales) =>
    youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: armarBody(tagsFinales),
      media: { body: fs.createReadStream(VIDEO_PATH) },
    });

  let response;
  try {
    response = await intentar(tags);
  } catch (err) {
    const motivo = `${err.message} ${JSON.stringify(err.errors || "")}`;
    if (/invalidTags/i.test(motivo) && tags.length > 0) {
      // El video NO se pierde por los tags: último reintento sin ellos.
      console.log("⚠️  YouTube rechazó los tags (invalidTags) — reintentando SIN tags...");
      response = await intentar([]);
    } else {
      throw err;
    }
  }

  const videoId = response.data.id;

  const resultadoPath = path.join(BASE_DIR, "output", "resultado_subida.json");
  fs.writeFileSync(
    resultadoPath,
    JSON.stringify(
      {
        videoId,
        titulo: guionData.titulo,
        canal: guionData.canal,
        fecha: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`\n✅ Video subido con éxito`);
  console.log(`🔗 https://youtube.com/watch?v=${videoId}`);
  console.log(`⚠️  Está en modo PRIVADO. Cámbialo a público desde YouTube Studio cuando lo revises.`);

  const miniaturaPath = path.join(BASE_DIR, "output", "miniatura.jpg");
  if (fs.existsSync(miniaturaPath)) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: { body: fs.createReadStream(miniaturaPath) },
      });
      console.log(`🖼️  Miniatura personalizada subida`);
    } catch (err) {
      console.log(`⚠️  No se pudo subir la miniatura (algunas cuentas necesitan verificación por teléfono en YouTube): ${err.message}`);
    }
  }
}

subirVideo().catch((err) => {
  console.error("❌ Error subiendo el video:", err.message);
  process.exit(1);
});
