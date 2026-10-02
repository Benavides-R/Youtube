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
// 2.6. Publicación programada a hora pico
// ------------------------------------------------------------
// Antes los videos quedaban PRIVADOS para siempre si nadie los
// publicaba a mano → no sumaban vistas ni subs. Ahora se agenda
// con publishAt a la siguiente franja pico (hora Colombia, UTC-5):
// el video sale solo sin intervención humana.
// Desactiva con PUBLISH_AUTO=false (queda privado como antes).
const FRANJAS_PICO_COLOMBIA = (process.env.PUBLISH_FRANJAS || "12:30,18:30,21:00")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [h, m] = s.split(":").map((n) => parseInt(n, 10));
    return { h, m: isNaN(m) ? 0 : m };
  })
  .filter((f) => !isNaN(f.h))
  .sort((a, b) => a.h - b.h || a.m - b.m);

// Devuelve el timestamp ISO (UTC) de la siguiente franja pico, o null.
// Mínimo 20 minutos en el futuro: le da tiempo a YouTube a procesar
// el video antes de la hora de publicación.
function siguienteFranja() {
  if (process.env.PUBLISH_AUTO === "false" || FRANJAS_PICO_COLOMBIA.length === 0) return null;
  const ahora = Date.now();
  const margenMs = 20 * 60 * 1000;
  for (let dias = 0; dias <= 2; dias++) {
    const base = new Date(ahora + dias * 86400000);
    for (const f of FRANJAS_PICO_COLOMBIA) {
      // hora Colombia = UTC-5 → UTC = colombia + 5 (Date.UTC desborda solo)
      const ts = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), f.h + 5, f.m);
      if (ts >= ahora + margenMs) return new Date(ts).toISOString();
    }
  }
  return null;
}

// ------------------------------------------------------------
// 3. Subir el video
// ------------------------------------------------------------
async function subirVideo() {
  console.log(`📤 Subiendo: "${guionData.titulo}"...`);

  const tags = sanitizarTags(guionData.tags);
  const descripcion = agregarCapitulos(guionData.descripcion);
  const publishAt = siguienteFranja();
  if (publishAt) {
    console.log(`🗓️  Publicación programada: ${new Date(publishAt).toLocaleString("es-CO", { timeZone: "America/Bogota", weekday: "long", hour: "2-digit", minute: "2-digit" })} (hora Colombia)`);
  } else {
    console.log("🔒  Sin programación — quedará privado (publica desde YouTube Studio)");
  }

  const armarBody = (tagsFinales, programado) => ({
    snippet: {
      title: guionData.titulo,
      description: descripcion,
      tags: tagsFinales,
      categoryId: "28", // "Science & Technology" — cámbialo según el canal
    },
    status: {
      privacyStatus: "private", // con publishAt DEBE ser private (YouTube lo hace público solo)
      selfDeclaredMadeForKids: false,
      ...(programado ? { publishAt } : {}),
    },
  });

  // Cada intento necesita su propio stream (el anterior queda consumido)
  const intentar = (tagsFinales, programado) =>
    youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: armarBody(tagsFinales, programado),
      media: { body: fs.createReadStream(VIDEO_PATH) },
    });

  // Degradación en escalera: tags+programado → sin tags → sin programación.
  // El video NUNCA se pierde por metadatos rechazados.
  let response = null;
  let quedanTags = tags.length > 0;
  let programado = publishAt !== null;
  for (let intento = 1; intento <= 3 && !response; intento++) {
    try {
      response = await intentar(quedanTags ? tags : [], programado);
    } catch (err) {
      const motivo = `${err.message} ${JSON.stringify(err.errors || "")}`;
      if (quedanTags && /invalidTags/i.test(motivo)) {
        console.log("⚠️  YouTube rechazó los tags (invalidTags) — reintentando SIN tags...");
        quedanTags = false;
      } else if (programado && /publishAt|publish_at|invalid.*schedul/i.test(motivo)) {
        console.log("⚠️  YouTube rechazó la publicación programada — subiendo privado...");
        programado = false;
      } else {
        throw err;
      }
    }
  }

  const videoId = response.data.id;
  const enHorario = Boolean(publishAt && programado);

  const resultadoPath = path.join(BASE_DIR, "output", "resultado_subida.json");
  fs.writeFileSync(
    resultadoPath,
    JSON.stringify(
      {
        videoId,
        titulo: guionData.titulo,
        canal: guionData.canal,
        fecha: new Date().toISOString(),
        publicado_en: enHorario ? publishAt : null,
      },
      null,
      2
    )
  );

  console.log(`\n✅ Video subido con éxito`);
  console.log(`🔗 https://youtube.com/watch?v=${videoId}`);
  if (enHorario) {
    console.log(`🗓️  Se hará público solo el ${new Date(publishAt).toLocaleString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} (hora Colombia).`);
  } else {
    console.log(`⚠️  Está en modo PRIVADO. Publícalo desde YouTube Studio cuando lo revises.`);
  }

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
