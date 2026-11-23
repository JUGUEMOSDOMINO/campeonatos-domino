/* Lector del PDF «Clasificación Partida N» que sacan los organizadores desde Access. Saca de él lo mismo que la Hoja de resumen (assets/resumen.js
   lo valida y lo convierte en el JSON de la web): nombre, fecha, partidas y, por cada grupo, una fila por pareja.
   Dos pasos, los dos sin tocar el navegador, para poder probarlos en Node:
   - lineas(paginas): junta los textos sueltos de cada página (con su posición) en líneas, de arriba abajo y de izquierda a derecha.
   - interpretar(lineas): reconoce cabecera, grupos y filas. Lo que no encaja no se descarta: queda en lineasMalas.
   leerPdf(bytes, pdfjs) los une con pdf.js (assets/vendor, copia local; el módulo lo pasa quien llama). */
(function (raiz) {
  'use strict';

  const MAX_PAGINAS = 30;
  const MILES = '\\d{1,3}(?:\\.\\d{3})+|\\d+';
  // Posición, Nº de pareja, «Jugador 1 - Jugador 2», Ganadas, Perdidas, Dif. Puntos (puede ser negativa), P. Favor, P. Contra
  const FILA = new RegExp(`^(\\d{1,3})\\s+(\\d{1,3})\\s+(\\S.*?)\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(-?(?:${MILES}))\\s+(${MILES})\\s+(${MILES})$`);
  const RELLENO = /^X{2,}\s+X{2,}\s*-\s*Z{2,}\s+Z{2,}$/i;
  const ENCABEZADO = /^Posici[oó]n\s+Pareja\b/i;
  const PARTIDA = /^Clasificaci[oó]n\s+Partida\s*:?\s*(\d+)\b/i;
  const GRUPO = /^Grupo\s+(\S+)$/i;
  const FECHA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

  const cifra = (t) => parseInt(t.replace(/\./g, ''), 10);
  const limpia = (t) => String(t).replace(/\s+/g, ' ').trim();

  function fechaIso(t) {
    const m = FECHA.exec(t);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : null;
  }

  /* paginas: una lista por página de { str, x, y, w } (x e y de la esquina inferior izquierda del texto, w su ancho; la y crece hacia arriba, como en pdf.js).
     Devuelve [{ t, pag, n }]: el texto de cada línea, la página (desde 1) y el número de línea dentro de la página. */
  function lineas(paginas) {
    const out = [];
    paginas.forEach((items, i) => {
      const util = items.filter((it) => it && typeof it.str === 'string' && it.str.trim() !== '');
      util.sort((a, b) => b.y - a.y || a.x - b.x);
      const filas = [];
      for (const it of util) {
        const f = filas[filas.length - 1];
        if (f && Math.abs(f.y - it.y) <= 3) f.items.push(it); else filas.push({ y: it.y, items: [it] });
      }
      filas.forEach((f, k) => {
        f.items.sort((a, b) => a.x - b.x);
        let t = '', fin = null;
        for (const it of f.items) {
          if (fin !== null && it.x - fin > 1.5 && !/\s$/.test(t) && !/^\s/.test(it.str)) t += ' ';
          t += it.str;
          fin = it.x + it.w;
        }
        out.push({ t: limpia(t), pag: i + 1, n: k + 1 });
      });
    });
    return out;
  }

  function interpretar(ls) {
    const r = { origen: 'pdf', estructura: [], celdasError: [], largas: [], datos: { nombre: null, fecha: null, lugar: null, organizador: null, partidas: null },
      grupos: { A: [], B: [] }, sust: [], lineasMalas: [], rellenos: 0, paginas: ls.reduce((m, l) => Math.max(m, l.pag), 0) };
    const mala = (l, motivo) => r.lineasMalas.push({ pag: l.pag, n: l.n, t: l.t.slice(0, 70), motivo });
    let grupo = null, primera = true;
    const ficticias = [];
    for (const l of ls) {
      if (l.t === '') continue;
      const esPrimera = primera; primera = false;
      let m;
      if (ENCABEZADO.test(l.t)) continue;
      if ((m = PARTIDA.exec(l.t))) { if (r.datos.partidas === null) r.datos.partidas = parseInt(m[1], 10); continue; }
      if (FECHA.test(l.t)) { if (r.datos.fecha === null) r.datos.fecha = fechaIso(l.t) || l.t; continue; }
      if ((m = GRUPO.exec(l.t))) { grupo = m[1].toUpperCase(); continue; }
      if (esPrimera && !FILA.test(l.t)) { r.datos.nombre = l.t; continue; }
      if ((m = FILA.exec(l.t))) {
        if (RELLENO.test(m[3])) {      // el descanso de una pareja: CUENTA, es una pareja más, la última del A (nunca pasa al B); sin licencias y sin puntos
          r.rellenos++;
          ficticias.push({ _donde: `página ${l.pag}, línea ${l.n}`, _ref: l.n, _hoja: 'PDF', puesto: +m[1], num: +m[2], pareja: limpia(m[3]), zona: null, pg: +m[4], pp: +m[5],
            dif: m[6][0] === '-' ? -cifra(m[6].slice(1)) : cifra(m[6]), pf: cifra(m[7]), pc: cifra(m[8]), lic1: null, lic2: null, ret: null, caso: null, ficticia: true });
          continue;
        }
        if (grupo === null) { mala(l, 'es una fila de la clasificación, pero antes no sale ningún «Grupo»'); continue; }
        if (grupo !== 'A' && grupo !== 'B') { mala(l, `es del grupo ${grupo}: solo caben el grupo A y el B`); continue; }
        r.grupos[grupo].push({ _donde: `página ${l.pag}, línea ${l.n}`, _ref: l.n, _hoja: 'PDF', puesto: +m[1], num: +m[2], pareja: limpia(m[3]), zona: null, pg: +m[4], pp: +m[5],
          dif: m[6][0] === '-' ? -cifra(m[6].slice(1)) : cifra(m[6]), pf: cifra(m[7]), pc: cifra(m[8]), lic1: null, lic2: null, ret: null, caso: null });
        continue;
      }
      mala(l, 'no es una fila de la clasificación ni una cabecera que conozcamos');
    }
    r.grupos.A.push(...ficticias);   // el PDF trae su puesto (la última del A); el B empieza después
    return r;
  }

  // Lee el PDF entero. pdfjs: el módulo de assets/vendor/pdf.min.mjs, con su workerSrc ya puesto.
  async function leerPdf(bytes, pdfjs) {
    let doc;
    const tarea = pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, enableXfa: false, verbosity: 0 });
    try {
      doc = await tarea.promise;
    } catch (e) {
      tarea.destroy();
      throw new Error('No se ha podido leer el PDF. ¿Está dañado, tiene contraseña o es de otro programa?');
    }
    try {
      if (doc.numPages > MAX_PAGINAS) throw new Error(`Este PDF tiene ${doc.numPages} páginas: demasiadas para ser una clasificación. ¿Es el PDF de «Clasificación Partida»?`);
      const paginas = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pag = await doc.getPage(i);
        const tc = await pag.getTextContent();
        paginas.push(tc.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })));
        pag.cleanup();
      }
      const ls = lineas(paginas);
      if (!ls.some((l) => l.t)) throw new Error('Este PDF no tiene texto que se pueda leer (¿es una foto o un escaneo?). Pide al organizador el PDF que sale directamente de Access.');
      return interpretar(ls);
    } finally {
      tarea.destroy();
    }
  }

  const API = { lineas, interpretar, leerPdf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.ClasifPdf = API;
})(typeof window !== 'undefined' ? window : globalThis);
