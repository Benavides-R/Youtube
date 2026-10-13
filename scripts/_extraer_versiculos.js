// node scripts/_extraer_versiculos.js
// Script de un solo uso: descarga los libros necesarios de la RV1909
// (aruljohn/Reina-Valera, MIT para el código, texto de dominio público)
// y escribe config/biblia_rv1909.json con una clave por versículo.
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..");
const OUT = path.join(BASE, "config", "biblia_rv1909.json");

// Mapeo: nombre canónico del manual -> nombre del archivo en el repo fuente
const LIBROS = {
  "Éxodo": "Éxodo",
  "Deuteronomio": "Deuteronomio",
  "Josué": "Josué",
  "Salmo": "Salmos",
  "Proverbios": "Proverbios",
  "Eclesiastés": "Eclesiástes",
  "Isaías": "Isaías",
  "Jeremías": "Jeremías",
  "Lamentaciones": "Lamentaciones",
  "Habacuc": "Habacuc",
  "Nahum": "Nahum",
  "Miqueas": "Miquéas",
  "Mateo": "San Mateo",
  "Marcos": "San M\u00e1rcos",
  "Lucas": "San L\u00facas",
  "Juan": "San Juan",
  "Romanos": "Romanos",
  "1 Corintios": "1 Corintios",
  "2 Corintios": "2 Corintios",
  "Gálatas": "Gálatas",
  "Efesios": "Efesios",
  "Filipenses": "Filipenses",
  "Colosenses": "Colosenses",
  "1 Tesalonicenses": "1 Tesalonicenses",
  "2 Timoteo": "2 Timoteo",
  "Hebreos": "Hebreos",
  "Santiago": "Santiago",
  "1 Pedro": "1 San Pedro",
  "1 Juan": "1 San Juan",
};

// Referencias necesarias: tarjetas (C1) + rangos expandidos (B2b)
const REFS_TARJETAS = [
  "Filipenses 4:7","Juan 14:27","Isaías 26:3","Salmo 29:11","Salmo 4:8","Salmo 46:10",
  "Salmo 23:1","Salmo 23:4","Salmo 34:18","Salmo 55:22","1 Pedro 5:7","Mateo 11:28",
  "Salmo 94:19","Salmo 121:2","Salmo 62:1","Isaías 41:10","Josué 1:9","Deuteronomio 31:6",
  "Salmo 27:1","Salmo 56:3","Proverbios 12:25","Colosenses 3:15","Juan 16:33","2 Timoteo 1:7",
  "Hebreos 11:1","Proverbios 3:5","Proverbios 3:6","Isaías 40:31","Marcos 11:24","Mateo 17:20",
  "Romanos 10:17","2 Corintios 5:7","Santiago 1:6","Salmo 37:5","Salmo 37:4","Salmo 118:8",
  "Jeremías 17:7","Isaías 55:8","Habacuc 2:4","Lucas 1:37","Mateo 19:26","Filipenses 4:13",
  "Salmo 20:7","Hebreos 11:6","Salmo 125:1","1 Juan 4:19","1 Juan 4:8","Juan 3:16",
  "Juan 13:34","Juan 15:12","Romanos 5:8","1 Corintios 13:13","1 Corintios 16:14","Efesios 4:32",
  "Colosenses 3:13","Proverbios 10:12","1 Pedro 4:8","Gálatas 5:14","1 Juan 3:18","Mateo 22:39",
  "Proverbios 15:1","Santiago 1:19","Proverbios 17:17","Proverbios 18:24","Lucas 6:31","Romanos 12:10",
  "Juan 15:13","Proverbios 27:17","Eclesiastés 4:9","Proverbios 4:7","Proverbios 3:13","Proverbios 2:6",
  "Santiago 1:5","Proverbios 4:23","Proverbios 16:32","Proverbios 16:18","Proverbios 11:2","Filipenses 2:3",
  "Miqueas 6:8","Salmo 119:105","Salmo 119:11","Proverbios 22:1","Proverbios 15:22","Proverbios 19:21",
  "Proverbios 21:5","Proverbios 13:20","Proverbios 18:21","Proverbios 17:22","1 Tesalonicenses 5:18",
  "Salmo 100:4","Salmo 107:1","Salmo 9:1","Salmo 118:24","Colosenses 3:23","Gálatas 6:9",
  "1 Corintios 15:58","2 Corintios 5:17","Isaías 43:18","Isaías 43:19","Lamentaciones 3:22",
  "Lamentaciones 3:23","Filipenses 3:13","Salmo 30:5","Romanos 8:28","Romanos 15:13","Romanos 12:12",
  "Jeremías 29:11","Salmo 139:14","Efesios 2:10","Salmo 90:12","Eclesiastés 3:1","Habacuc 2:3",
  "Salmo 126:5","Hebreos 6:19","Salmo 42:11","Salmo 31:24","Isaías 40:29","2 Corintios 12:9",
  "Salmo 73:26","Santiago 1:12","Juan 1:5","Mateo 5:14","Mateo 5:16","Salmo 91:1","Salmo 91:2",
  "Salmo 91:11","Salmo 121:7","Salmo 34:7","Salmo 18:2","Proverbios 18:10","Nahum 1:7",
  "Salmo 46:1","Salmo 28:7","Salmo 36:7","Éxodo 14:14","Deuteronomio 31:8","Salmo 127:1",
  "Josué 24:15","Proverbios 22:6","Filipenses 4:19","Mateo 6:33","Salmo 23:6","Salmo 84:11",
  "Mateo 7:7","Salmo 145:18","Salmo 16:8",
];

// Rangos de los videos largos (B2b) — se expanden versículo por versículo
const RANGOS_LARGO = [
  "Salmo 23:1-6","Mateo 6:9-13","Filipenses 4:4-9","Josué 1:1-9","Salmo 121:1-8",
  "Mateo 5:3-12","1 Corintios 13:1-8","Isaías 40:25-31","Salmo 91:1-10","Lucas 15:11-24",
  "Efesios 4:25-32","Proverbios 3:1-12","Mateo 6:25-34","Santiago 1:2-8","Salmo 139:1-14",
  "Lucas 10:25-37","Colosenses 3:12-17","Eclesiastés 3:1-8","Mateo 7:1-12","Romanos 12:9-18",
  "Hebreos 11:1-6","1 Pedro 5:5-11","Gálatas 5:22-25","Romanos 5:1-5",
];

function expandirRango(ref) {
  const m = String(ref).match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return [ref];
  const [, libro, cap, v1, v2] = m;
  const salida = [];
  for (let v = Number(v1); v <= Number(v2 || v1); v++) salida.push(`${libro} ${cap}:${v}`);
  return salida;
}

function limpiarTexto(t) {
  return String(t).replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

async function descargarLibro(archivoFuente) {
  const url = `https://raw.githubusercontent.com/aruljohn/Reina-Valera/main/${encodeURIComponent(archivoFuente)}.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} al descargar ${archivoFuente}`);
  const buf = await r.arrayBuffer();
  return JSON.parse(Buffer.from(buf).toString("utf-8"));
}

async function main() {
  // Expandir todos los rangos y unir con las refs de tarjetas
  const refsSet = new Set(REFS_TARJETAS);
  for (const r of RANGOS_LARGO) expandirRango(r).forEach((x) => refsSet.add(x));
  const refs = [...refsSet];

  // Determinar qué libros necesitamos
  const librosNecesarios = new Set();
  for (const ref of refs) {
    const m = ref.match(/^(.+?)\s+\d+:\d+$/);
    if (m) librosNecesarios.add(m[1]);
  }

  console.log(`Libros necesarios: ${librosNecesarios.size}`);
  console.log(`Versículos requeridos: ${refs.length}`);

  // Descargar y procesar cada libro
  const resultado = {};
  let faltantes = [];
  for (const libroCanonico of [...librosNecesarios].sort()) {
    const archivoFuente = LIBROS[libroCanonico];
    if (!archivoFuente) {
      console.log(`⚠️  Sin mapeo para libro: ${libroCanonico}`);
      continue;
    }
    process.stdout.write(`Descargando ${archivoFuente}... `);
    const data = await descargarLibro(archivoFuente);
    console.log(`${data.chapters.length} capítulos`);

    // Indexar versículos por "Libro Cap:V"
    for (const ch of data.chapters) {
      for (const v of ch.verses) {
        const clave = `${libroCanonico} ${ch.chapter}:${v.verse}`;
        resultado[clave] = limpiarTexto(v.text);
      }
    }
  }

  // Filtrar solo las referencias necesarias
  const final = {};
  for (const ref of refs) {
    if (resultado[ref]) {
      final[ref] = resultado[ref];
    } else {
      faltantes.push(ref);
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(final, null, 2), "utf-8");
  console.log(`\n✅ Escrito ${OUT}`);
  console.log(`   Versículos incluidos: ${Object.keys(final).length}`);
  if (faltantes.length) {
    console.log(`   ⚠️  Faltan ${faltantes.length}:`);
    faltantes.forEach((f) => console.log(`     ${f}`));
    process.exit(1);
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
