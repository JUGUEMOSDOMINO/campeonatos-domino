/* Lector de la exportación a Excel del informe de clasificación de Access (hoja «PX_05_Clasificacion_Exportar»). Es la entrada principal de los
   organizadores que llevan el campeonato en Access; el PDF (clasifpdf.js) es la alternativa. Deja lo mismo que la Hoja de resumen y el PDF, para que
   assets/resumen.js lo valide y lo convierta en el JSON de la web.
   - Las columnas se buscan por su nombre en la fila 1, no por su posición.
   - La fila ya viene ordenada por clasificación dentro de cada grupo (DET_GRUPO): el puesto es el orden de la fila en su grupo.
   - El Excel no dice cuántas partidas hubo: se deducen de ganadas + perdidas en el grupo A.
   - Licencia «46/0921» = FVD nº 921. Vacía o de otra provincia (02/, 08/, 30/…) = no federado FVD: NO. La original queda en licOrig.
   - La pareja «XXX XXX - ZZZ ZZZ» es de relleno: se ignora y se cuenta.
   Lo que no encaja (cifra que no es número, fecha o nombre distinto en otra fila, grupo que no es A ni B, licencia mal escrita, jugador sin nombre) no se
   descarta: queda en lineasMalas y la validación lo bloquea. Sin dependencias del navegador: lo usan publicar.html, leer_torneo.html y las pruebas. */
(function (raiz) {
  'use strict';

  const HOJA = 'PX_05_Clasificacion_Exportar';
  const COLS = { fecha: 'DET_TORNEO', nombre: 'TOR_NOMBRE', grupo: 'DET_GRUPO', pg: 'SumaDeDET_GANADAS', pp: 'SumaDeDET_PERDIDAS', dif: 'SumaDeDET_DIFERENCIA',
    pf: 'SumaDeDET_PUNTOSF', pc: 'SumaDeDET_PUNTOSC', num: 'DET_PAREJA', lic1: 'JUGADORES.JUG_LICENCIA', n1: 'PT_JUGADOR1', lic2: 'JUGADORES_1.JUG_LICENCIA', n2: 'PT_JUGADOR2' };
  const RELLENO = /^X{2,}\s+X{2,}\s*-\s*Z{2,}\s+Z{2,}$/i;
  const limpia = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

  const es = (libro) => !!libro && Array.isArray(libro.SheetNames) && libro.SheetNames.includes(HOJA);

  function fechaIso(v) {
    let d = null;
    if (v instanceof Date) d = v;
    else if (typeof v === 'number' && v > 0) d = new Date(Math.round((v - 25569) * 864e5));
    else if (typeof v === 'string') { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim()); if (m) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); }
    if (!d || isNaN(d)) return null;
    const a = d.getUTCFullYear();
    return a < 2000 || a > 2100 ? null : `${a}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // «46/0921» → 921. Vacía o de otra provincia → 'NO'. Algo que no es una licencia → null (mal escrita).
  function licencia(v) {
    const t = limpia(v);
    if (t === '') return 'NO';
    const m = /^(\d{2})\s*\/\s*(.*)$/.exec(t);
    if (!m) return null;
    if (m[1] !== '46') return 'NO';
    return /^\d{1,4}$/.test(m[2]) && +m[2] >= 1 ? +m[2] : null;
  }

  const entero = (v) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN);

  function leer(libro, XLSX) {
    const r = { origen: 'access', estructura: [], celdasError: [], largas: [], datos: { nombre: null, fecha: null, lugar: null, organizador: null, partidas: null },
      grupos: { A: [], B: [] }, sust: [], lineasMalas: [], rellenos: 0, partidasDeducidas: false };
    const ws = libro.Sheets && libro.Sheets[HOJA];
    if (!ws) { r.estructura.push(`falta la hoja ${HOJA}`); return r; }
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const cab = (filas[0] || []).map((c) => limpia(c));
    const col = {};
    for (const [k, nombre] of Object.entries(COLS)) { col[k] = cab.indexOf(nombre); if (col[k] < 0) r.estructura.push(`falta la columna ${nombre}`); }
    if (r.estructura.length) return r;
    const mala = (n, motivo) => r.lineasMalas.push({ pag: null, n, t: '', motivo });
    let fecha0 = null, nombre0 = null;
    for (let i = 1; i < filas.length; i++) {
      const f = filas[i], n = i + 1, v = (k) => f[col[k]];
      if (f.every((x) => x === null || x === '')) continue;
      const nombres = [limpia(v('n1')), limpia(v('n2'))];
      if (RELLENO.test(nombres.join(' - '))) { r.rellenos++; continue; }
      const g = limpia(v('grupo')).toUpperCase();
      if (g !== 'A' && g !== 'B') { mala(n, `el grupo es «${limpia(v('grupo'))}»: solo caben el A y el B`); continue; }
      const cifras = {};
      const nm = [];
      for (const k of ['pg', 'pp', 'dif', 'pf', 'pc', 'num']) { cifras[k] = entero(v(k)); if (isNaN(cifras[k])) nm.push(COLS[k]); }
      if (nm.length) { mala(n, `${nm.join(', ')} no es un número entero`); continue; }
      if (!nombres[0] || !nombres[1]) { mala(n, 'falta el nombre de un jugador'); continue; }
      const l1 = licencia(v('lic1')), l2 = licencia(v('lic2'));
      if (l1 === null || l2 === null) { mala(n, `la licencia «${limpia(l1 === null ? v('lic1') : v('lic2'))}» no tiene la forma 46/0921`); continue; }
      const iso = fechaIso(v('fecha')), nom = limpia(v('nombre'));
      if (fecha0 === null) { fecha0 = iso; nombre0 = nom; r.datos.fecha = iso || limpia(v('fecha')); r.datos.nombre = nom || null; }
      else if (iso !== fecha0 || nom !== nombre0) { mala(n, 'la fecha o el nombre del campeonato no es el de las otras filas'); continue; }
      r.grupos[g].push({ _donde: `fila ${n}`, _ref: n, _hoja: HOJA, puesto: r.grupos[g].length + 1, num: cifras.num, pareja: nombres.join(' - '), nombres, zona: null, pg: cifras.pg,
        pp: cifras.pp, dif: cifras.dif, pf: cifras.pf, pc: cifras.pc, lic1: l1, lic2: l2, licOrig: [limpia(v('lic1')), limpia(v('lic2'))], ret: null, caso: null });
    }
    // partidas: las que suman ganadas + perdidas en el grupo A (la cifra más repetida)
    const cuenta = new Map();
    for (const x of r.grupos.A) cuenta.set(x.pg + x.pp, (cuenta.get(x.pg + x.pp) || 0) + 1);
    if (cuenta.size) { r.datos.partidas = [...cuenta].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]; r.partidasDeducidas = true; }
    return r;
  }

  const API = { HOJA, es, leer, licencia, fechaIso };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.ClasifAccess = API;
})(typeof window !== 'undefined' ? window : globalThis);
