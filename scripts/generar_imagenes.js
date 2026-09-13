/**
 * generar_imagenes.js
 * ------------------------------------------------------------
 * Lee output/guion.json y usa "palabras_clave_imagenes" (frases
 * concretas en inglés que la IA sacó del guion) para buscar
 * fotos MUY relacionadas en Pexels, en vez de un tema genérico.
 * Reparte las búsquedas entre todas las palabras clave, así el
 * video tiene variedad y no repite la misma búsqueda.
 *
 * Uso:
 *   PEXELS_API_KEY=xxx node generar_imagenes.js
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

if (!PEXELS_API_KEY) {
  console.error("❌ Falta PEXELS_API_KEY en las variables de entorno");
  process.exit(1);
}

const BASE_DIR = path.join(__dirname, "..");
const GUION_PATH = path.join(BASE_DIR, "output", "guion.json");
const IMAGENES_DIR = path.join(BASE_DIR, "output", "imagenes");

// Cada imagen se muestra ~7 segundos en el video final
const SEGUNDOS_POR_IMAGEN = 7;

// Qué proporción de las escenas intenta usar un clip de video real en vez
// de una foto fija -- el resto sigue siendo foto (con su zoom Ken Burns de
// siempre). No es 100% video porque el banco de clips de Pexels es más
// chico que el de fotos, y porque mezclar los dos formatos rompe la
// monotonía visual mejor que solo uno de los dos.
const PROPORCION_VIDEOS = 0.35;

// ------------------------------------------------------------
// 1. Cargar el guion generado
// ------------------------------------------------------------
if (!fs.existsSync(GUION_PATH)) {
  console.error(`❌ No se encontró ${GUION_PATH}. Corre primero generar_guion.js`);
  process.exit(1);
}

const guionData = JSON.parse(fs.readFileSync(GUION_PATH, "utf-8"));

// Compatibilidad: si el guion es viejo y no trae palabras_clave_imagenes,
// usamos el tema como respaldo (así no se rompe con guiones anteriores)
const palabrasClave =
  guionData.palabras_clave_imagenes && guionData.palabras_clave_imagenes.length > 0
    ? guionData.palabras_clave_imagenes
    : [guionData.tema];

// Calculamos cuántas imágenes necesitamos según la duración estimada
const palabras = guionData.guion.split(/\s+/).length;
const duracionEstimadaSeg = (palabras / 150) * 60;
const cantidadImagenes = Math.max(3, Math.ceil(duracionEstimadaSeg / SEGUNDOS_POR_IMAGEN));

console.log(`🔍 Palabras clave: ${palabrasClave.join(", ")}`);
console.log(`🖼️  Necesitamos ~${cantidadImagenes} imágenes (video de ~${Math.round(duracionEstimadaSeg)}s)`);

// ------------------------------------------------------------
// 2. Buscar en Pexels
// ------------------------------------------------------------
async function buscarImagenes(query, cantidad, orientacion) {
  const paginaAlAzar = Math.floor(Math.random() * 12) + 1; // pág 1 a 12, mucha más variedad
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query
  )}&per_page=${cantidad}&orientation=${orientacion}&page=${paginaAlAzar}`;

  const response = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pexels API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.photos;
}

// Pexels también tiene un banco de VIDEOS gratis, con la misma API key --
// esto es lo que permite mezclar clips de video reales con las fotos fijas,
// en vez de que todo el video sea solo fotos con zoom.
async function buscarVideos(query, cantidad, orientacion) {
  const paginaAlAzar = Math.floor(Math.random() * 6) + 1; // menos stock que fotos, páginas más cortas
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
    query
  )}&per_page=${cantidad}&orientation=${orientacion}&page=${paginaAlAzar}`;

  const response = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });

  if (!response.ok) return []; // los videos son un "extra" -- si falla, seguimos solo con fotos

  const data = await response.json();
  return data.videos || [];
}

// De los varios archivos que Pexels ofrece por video (distintas
// resoluciones), elegimos el más liviano que aún se vea bien -- no tiene
// sentido descargar 4K si el video final va a quedar en 1080p o menos.
function elegirArchivoDeVideo(video, anchoObjetivo) {
  const candidatos = (video.video_files || []).filter((f) => f.file_type === "video/mp4");
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => Math.abs(a.width - anchoObjetivo) - Math.abs(b.width - anchoObjetivo));
  return candidatos[0];
}

// ------------------------------------------------------------
// 3. Descargar cada imagen a disco
// ------------------------------------------------------------
async function descargarImagen(url, destino) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destino, buffer);
}

async function descargarVideo(url, destino) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destino, buffer);
}

// ------------------------------------------------------------
// 4. Ejecutar todo: buscar en CADA palabra clave, repartiendo
//    cuántas imágenes se piden a cada una, para tener variedad
// ------------------------------------------------------------
(async () => {
  try {
    if (!fs.existsSync(IMAGENES_DIR)) fs.mkdirSync(IMAGENES_DIR, { recursive: true });
    fs.readdirSync(IMAGENES_DIR).forEach((f) => fs.unlinkSync(path.join(IMAGENES_DIR, f)));

    const orientacion = guionData.formato === "vertical" ? "portrait" : "landscape";
    const ANCHO_OBJETIVO = guionData.formato === "vertical" ? 1080 : 1920;
    const porPalabraClave = Math.max(2, Math.ceil(cantidadImagenes / palabrasClave.length));
    let fotos = [];
    const idsVistos = new Set();

    // Buscamos en TODAS las palabras clave (no paramos apenas alcanzamos
    // el número que necesitamos) para tener más candidatos entre los
    // cuales elegir los más relevantes, no solo los primeros que llegaron
    for (const clave of palabrasClave) {
      try {
        const resultados = await buscarImagenes(clave, porPalabraClave, orientacion);
        for (const foto of resultados) {
          if (!idsVistos.has(foto.id)) {
            idsVistos.add(foto.id);
            fotos.push(foto);
          }
        }
        console.log(`  🔎 "${clave}" → ${resultados.length} fotos`);
      } catch (err) {
        console.log(`  ⚠️  Falló la búsqueda de "${clave}": ${err.message}`);
      }
    }

    if (fotos.length === 0) {
      console.error("❌ Pexels no encontró ninguna imagen con esas palabras clave.");
      process.exit(1);
    }

    // Filtro de relevancia: Pexels da una descripción ("alt") de cada
    // foto. Le damos prioridad a las que mencionan alguna palabra clave
    // o el tema — así descartamos las claramente ajenas sin usar IA extra
    const palabrasRelevancia = [
      ...palabrasClave.flatMap((p) => p.toLowerCase().split(/\s+/)),
      ...guionData.tema.toLowerCase().split(/\s+/),
    ].filter((p) => p.length > 3); // ignoramos palabras muy cortas (the, and, de, la, etc)

    function puntajeRelevancia(foto) {
      const alt = (foto.alt || "").toLowerCase();
      if (!alt) return 0;
      return palabrasRelevancia.filter((p) => alt.includes(p)).length;
    }

    // Mezclamos al azar PRIMERO, y ordenamos por relevancia después — así
    // seguimos priorizando lo más relacionado al tema, pero entre fotos
    // igual de relevantes el orden cambia cada vez (evita repetir siempre
    // las mismas fotos "genéricas" que le pegan a cualquier tema)
    for (let i = fotos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fotos[i], fotos[j]] = [fotos[j], fotos[i]];
    }
    fotos.sort((a, b) => puntajeRelevancia(b) - puntajeRelevancia(a));
    const conDescripcion = fotos.filter((f) => f.alt).length;
    console.log(`  📋 ${conDescripcion}/${fotos.length} fotos con descripción, ordenadas por relevancia al tema (con variedad)`);

    if (fotos.length < cantidadImagenes) {
      console.log(`⚠️  Solo ${fotos.length} imágenes distintas encontradas. Se repetirán para completar.`);
      const fotosOriginales = [...fotos];
      while (fotos.length < cantidadImagenes) {
        fotos.push(fotosOriginales[fotos.length % fotosOriginales.length]);
      }
    } else {
      fotos = fotos.slice(0, cantidadImagenes);
    }

    // ------------------------------------------------------------
    // 4.5. Buscar videos para una parte de las escenas (mismo criterio
    // de palabras clave que las fotos, banco distinto de Pexels)
    // ------------------------------------------------------------
    let videos = [];
    const idsVideosVistos = new Set();
    for (const clave of palabrasClave) {
      try {
        const resultados = await buscarVideos(clave, 4, orientacion);
        for (const video of resultados) {
          if (!idsVideosVistos.has(video.id)) {
            idsVideosVistos.add(video.id);
            videos.push(video);
          }
        }
      } catch {
        // los videos son un extra -- si Pexels Videos falla, seguimos solo con fotos
      }
    }
    for (let i = videos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [videos[i], videos[j]] = [videos[j], videos[i]];
    }

    const cantidadVideosDeseada = Math.round(cantidadImagenes * PROPORCION_VIDEOS);
    const cantidadVideosReal = Math.min(cantidadVideosDeseada, videos.length);
    console.log(`  🎥 ${videos.length} videoclips encontrados, usando ${cantidadVideosReal} de ${cantidadImagenes} escenas`);

    // Armamos la lista final de escenas: unas serán "video", el resto
    // "foto" -- se mezclan al azar para que no queden todos los clips de
    // video juntos al principio o al final.
    const escenas = [];
    for (let i = 0; i < cantidadVideosReal; i++) {
      const archivo = elegirArchivoDeVideo(videos[i], ANCHO_OBJETIVO);
      if (archivo) escenas.push({ tipo: "video", url: archivo.link });
    }
    const fotosRestantes = cantidadImagenes - escenas.length;
    for (let i = 0; i < fotosRestantes; i++) {
      escenas.push({ tipo: "foto", url: fotos[i].src.large2x });
    }
    for (let i = escenas.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [escenas[i], escenas[j]] = [escenas[j], escenas[i]];
    }

    let i = 1;
    for (const escena of escenas) {
      const numero = String(i).padStart(2, "0");
      if (escena.tipo === "video") {
        const destino = path.join(IMAGENES_DIR, `escena_${numero}.mp4`);
        await descargarVideo(escena.url, destino);
        console.log(`  ✅ escena_${numero}.mp4 (video) descargada`);
      } else {
        const destino = path.join(IMAGENES_DIR, `escena_${numero}.jpg`);
        await descargarImagen(escena.url, destino);
        console.log(`  ✅ escena_${numero}.jpg (foto) descargada`);
      }
      i++;
    }

    console.log(`\n✅ ${escenas.length} escenas descargadas en: ${IMAGENES_DIR}`);
  } catch (err) {
    console.error("❌ Error descargando imágenes:", err.message);
    process.exit(1);
  }
})();
