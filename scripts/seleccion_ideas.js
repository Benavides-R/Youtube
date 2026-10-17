// scripts/seleccion_ideas.js
const DIA = 24 * 3600 * 1000;

function validas(meta) {
  return meta.filter((m) => m.estado !== "descartada");
}

function diasDesde(fechaISO, hoy) {
  return (hoy - Date.parse(fechaISO)) / DIA;
}

function temasEnEnfriamiento(meta, hoy, dias = 14) {
  return new Set(validas(meta).filter((m) => m.tema_clave && diasDesde(m.fecha, hoy) < dias).map((m) => m.tema_clave));
}

function pasajesEnEnfriamiento(meta, hoy, dias) {
  return new Set(validas(meta).filter((m) => m.pasaje && diasDesde(m.fecha, hoy) < dias).map((m) => m.pasaje));
}

// Más tiempo sin usarse primero; si nunca se usó cuenta como el más antiguo; empate -> orden de la lista.
function ordenSubNichos(subNichos, meta) {
  const ultimo = {};
  validas(meta).forEach((m) => {
    if (m.sub_nicho) ultimo[m.sub_nicho] = Math.max(ultimo[m.sub_nicho] || 0, Date.parse(m.fecha));
  });
  return subNichos
    .map((s, i) => ({ s, i, t: ultimo[s.clave] || 0 }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.s);
}

function elegirFormula(formulas, meta) {
  if (!formulas || !formulas.length) return null;
  const ultimo = {};
  validas(meta).forEach((m) => {
    if (m.formula) ultimo[m.formula] = Math.max(ultimo[m.formula] || 0, Date.parse(m.fecha));
  });
  return formulas
    .map((f, i) => ({ f, i, t: ultimo[f] || 0 }))
    .sort((a, b) => a.t - b.t || a.i - b.i)[0].f;
}

// Devuelve { idea, sub_nicho } o null (null = plan B si el canal lo tiene, o error si no).
// tituloUsado: opcional, función (titulo) => bool. Descarta ideas cuyo título ya se parece
// a uno publicado (similitud de palabras clave), aunque tengan otra clave de tema.
function elegirIdeaDelBanco({ banco, meta, subNichos, hoy = Date.now(), diasTema = 14, diasPasaje = 0, reciclar = false, tituloUsado = null }) {
  const usadasTodas = new Set(meta.map((m) => m.idea_id).filter(Boolean)); // incluye descartadas
  const descartadas = new Set(meta.filter((m) => m.estado === "descartada").map((m) => m.idea_id));
  const enfriando = temasEnEnfriamiento(meta, hoy, diasTema);
  const pasajesFrios = diasPasaje > 0 ? pasajesEnEnfriamiento(meta, hoy, diasPasaje) : new Set();
  const habilitada = (i) =>
    (!i.requiere_verificacion || i.verificada === true) &&
    !descartadas.has(i.id) &&
    !enfriando.has(i.tema_clave) &&
    !(i.pasaje && pasajesFrios.has(i.pasaje)) &&
    !(i.titulo && tituloUsado && tituloUsado(i.titulo));
  const ultimoUso = (id) =>
    Math.max(0, ...validas(meta).filter((m) => m.idea_id === id).map((m) => Date.parse(m.fecha)));

  for (const sn of ordenSubNichos(subNichos, meta)) {
    if (sn.usa_noticias) return null; // le toca el turno a noticias (plan B)
    const delSub = banco.filter((i) => i.sub_nicho === sn.clave && habilitada(i));
    const nuevas = delSub.filter((i) => !usadasTodas.has(i.id));
    if (nuevas.length) return { idea: nuevas[0], sub_nicho: sn };
    if (reciclar && delSub.length) {
      delSub.sort((a, b) => ultimoUso(a.id) - ultimoUso(b.id)); // la usada hace más tiempo
      // Una idea reciclada se vuelve a titular con el LLM para que el video no salga igual
      return { idea: { ...delSub[0], reciclada: true, titulo: null, gancho: null }, sub_nicho: sn };
    }
  }
  return null;
}

module.exports = { temasEnEnfriamiento, pasajesEnEnfriamiento, ordenSubNichos, elegirFormula, elegirIdeaDelBanco, diasDesde };
