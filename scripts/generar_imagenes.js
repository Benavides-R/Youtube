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
  const paginaAlAzar = Math.floor(Math.random() * 5) + 1; // pág 1 a 5, evita repetir siempre el mismo top de resultados
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

// ------------------------------------------------------------
// 3. Descargar cada imagen a disco
// ------------------------------------------------------------
async function descargarImagen(url, destino) {
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
    const porPalabraClave = Math.max(2, Math.ceil(cantidadImagenes / palabrasClave.length));
    let fotos = [];
    const idsVistos = new Set();

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
      if (fotos.length >= cantidadImagenes) break;
    }

    if (fotos.length === 0) {
      console.error("❌ Pexels no encontró ninguna imagen con esas palabras clave.");
      process.exit(1);
    }

    if (fotos.length < cantidadImagenes) {
      console.log(`⚠️  Solo ${fotos.length} imágenes distintas encontradas. Se repetirán para completar.`);
      const fotosOriginales = [...fotos];
      while (fotos.length < cantidadImagenes) {
        fotos.push(fotosOriginales[fotos.length % fotosOriginales.length]);
      }
    } else {
      fotos = fotos.slice(0, cantidadImagenes);
    }

    let i = 1;
    for (const foto of fotos) {
      const destino = path.join(IMAGENES_DIR, `imagen_${String(i).padStart(2, "0")}.jpg`);
      await descargarImagen(foto.src.large2x, destino);
      console.log(`  ✅ imagen_${String(i).padStart(2, "0")}.jpg descargada`);
      i++;
    }

    console.log(`\n✅ ${fotos.length} imágenes descargadas en: ${IMAGENES_DIR}`);
  } catch (err) {
    console.error("❌ Error descargando imágenes:", err.message);
    process.exit(1);
  }
})();
