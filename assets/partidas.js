/* Partidas (jornadas, en SP) de un Excel: la hoja WEB solo trae la que tiene seleccionada, pero las hojas de datos (_R1 a _R16) las tienen todas.
   Aquí se repite la lógica de _WEBC y de WEB para cualquier número k y se devuelve, por cada partida con datos, lo mismo que daría la hoja WEB con esa partida
   elegida (mismo contrato, mismos JSON). Las columnas de _R salen de las fórmulas de _WEBC, así que un cambio de columnas en el Excel no rompe nada;
   y si lo que sale para la partida de WEB no es idéntico a lo que trae la hoja, no se ofrece ninguna otra (mejor una que ninguna equivocada).
   Solo lee WEB, _WEBC y _R1…_R16 (más el valor de las dos semillas de sorteo). Nunca Licencias, PAREJAS, JUGADORES ni SUSTITUCIONES.
   Sin dependencias del navegador: lo usan publicar.html y las pruebas en Node. */
(function (raiz) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./contrato.js') : raiz.Contrato;
  const MAX_N = 16, FILAS = 201; // _WEBC y _R van de la fila 2 a la 201 (200 participantes)

  const valor = (ws, ref) => {
    const x = ws && ws[ref];
    if (!x || x.t === 'e') return null;
    let v = x.v;
    if (typeof v === 'string') { v = v.trim(); if (v === '') return null; }
    if (typeof v === 'boolean') v = v ? 1 : 0;
    return v === undefined ? null : v;
  };
  const num = (v) => (typeof v === 'number' ? v : null);
  const txt = (v) => (v == null ? null : String(v));
  const colN = (s) => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const colL = (n) => C.letra(n - 1);

  /* Nombres de las hojas que hacen falta para este libro (n = partidas previstas). */
  const hojasHacen = (n) => ['_WEBC', ...Array.from({ length: Math.min(n, MAX_N) }, (_, i) => ['_R' + (i + 1), 'P.' + (i + 1)]).flat()];

  /* Lee del libro (SheetJS) esas hojas y las semillas de sorteo. `libroWeb` es lo ya leído con solo WEB (trae los nombres definidos). */
  function leerHojas(XLSX, bytes, libroWeb, n) {
    const opc = { type: 'array', cellHTML: false, cellStyles: false, cellNF: false };
    // _WEBC con sus fórmulas (de ahí salen las columnas de _R; sin valor guardado, una fórmula solo aparece con sheetStubs) y el resto solo con valores, que es más rápido
    const hojas = { ...XLSX.read(bytes, { ...opc, sheets: '_WEBC', cellFormula: true, sheetStubs: true }).Sheets, ...XLSX.read(bytes, { ...opc, sheets: hojasHacen(n).slice(1) }).Sheets };
    const nombres = (libroWeb.Workbook && libroWeb.Workbook.Names) || [];
    const sem = {};
    for (const [clave, nom] of [['A', 'SEMILLA_A'], ['B', 'SEMILLA_B']]) {
      const e = nombres.find((x) => x.Name === nom);
      const m = e && /^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)$/.exec(e.Ref);
      if (!m || +m[3] > 12 || !/^SORTEO_[AB]$/.test(m[1])) { sem[clave] = null; continue; }
      const w = XLSX.read(bytes, { type: 'array', sheets: m[1], sheetRows: 12 });
      sem[clave] = num(valor(w.Sheets[m[1]], m[2] + m[3]));
    }
    hojas.semillas = sem;
    return hojas;
  }

  /* Columnas de _R que lee cada columna de _WEBC: sale de la fórmula CHOOSE(J_WEB,'_R1'!X2,'_R2'!X2,…) de su fila 2. */
  function mapa(webc) {
    const m = {}, esc = {};
    const chooseCol = (f) => { const r = /^CHOOSE\(J_WEB,'?_R1'?!\$?([A-Z]+)\$?(\d+),/.exec(f || ''); return r && { col: r[1], fila: +r[2], abs: /!\$[A-Z]+\$\d/.test(f) }; };
    for (let c = 1; c <= 70; c++) {
      const L = colL(c), h = valor(webc, L + '1'), f = webc[L + '2'] && webc[L + '2'].f;
      const x = chooseCol(f);
      if (h && x && !x.abs) m[h] = x.col;
      if (h === 'jug') { const j = /'?_R1'?!\$?([A-Z]+)2/.exec(f || ''); if (j) m.jugCol = j[1]; }
      if (h === 'jr' || /^BA$/.test(L)) { const r = /\$AT\$2:\$AT\$(\d+)/.exec(f || ''); if (r) m.finMesas = +r[1]; }
    }
    for (let r = 2; r <= 14; r++) { // escalares: etiqueta en A, valor en B (una celda de _R, o las líneas de P.k que empiezan por ✖ o ⚠)
      const e = valor(webc, 'A' + r), f = webc['B' + r] && webc['B' + r].f, x = chooseCol(f);
      const c = /^CHOOSE\(J_WEB,COUNTIF\('P\.1'!\$([A-Z]+)\$(\d+):\$[A-Z]+\$(\d+),"(.)\*"\)/.exec(f || '');
      if (e && x && x.abs) esc[e] = { col: x.col, fila: x.fila };
      else if (e && c) esc[e] = { p: true, col: c[1], f0: +c[2], f1: +c[3], ch: c[4] };
    }
    m.esc = esc;
    return m;
  }

  /* Una partida k a partir de las hojas. `raw` es lo que dio Contrato.leer de la hoja WEB. Devuelve un objeto con la forma de Contrato.leer, o { motivo } si no se puede. */
  function derivar(raw, H, k) {
    const webc = H._WEBC, R = H['_R' + k];
    if (!webc || !R) return { motivo: 'falta la hoja de la partida ' + k };
    const M = H.__mapa || (H.__mapa = mapa(webc));
    const meta0 = raw.meta, tipo = meta0.tipo, sp = tipo === 'sp', ind = tipo === 'individual';
    const rk = (col, f) => valor(R, col + f);
    const colR = (h) => M[h];
    const lee = (h, f) => (colR(h) ? rk(colR(h), f) : null);
    const tabla = (h) => { const a = [null]; for (let f = 2; f <= FILAS; f++) a.push(lee(h, f)); return a; };
    for (const h of ['grp', 'ckey', 'crank']) if (!colR(h)) return { motivo: 'no se encuentra la columna ' + h + ' de _WEBC' };
    const esc = (nom) => {
      const e = M.esc[nom];
      if (!e) return null;
      if (!e.p) return rk(e.col, e.fila);
      const P = H['P.' + k];
      if (!P) return undefined;
      let n = 0;
      for (let f = e.f0; f <= e.f1; f++) { const v = valor(P, e.col + f); if (typeof v === 'string' && v.startsWith(e.ch)) n++; }
      return n;
    };

    const grp = tabla('grp'), ckey = tabla('ckey'), crank = tabla('crank');
    const real = [null], retd = [null];
    for (let f = 2; f <= FILAS; f++) { real.push(valor(webc, 'E' + f)); retd.push(valor(webc, 'F' + f)); }
    const ret = tabla(sp ? 'absR' : 'fret'), faus = tabla('faus');
    const nA = ckey.filter((x) => typeof x === 'string' && x.startsWith('A|')).length;
    const nB = ckey.filter((x) => typeof x === 'string' && x.startsWith('B|')).length;
    const tA = num(esc('tA')) || 0;
    const complete = esc('complete'), pendT = esc('pendT'), fix = esc('fixOK'), errs = esc('errs'), avisos = esc('avisos');
    if (errs === undefined || avisos === undefined) return { motivo: 'falta la hoja P.' + k };

    /* --- meta de esta partida (lo demás es del campeonato y no cambia) --- */
    const sorteo = k === 1 ? 'A' : meta0.hay_b === 1 && k === meta0.jornada_b ? 'B' : null;
    const sem = (H.semillas || {})[sorteo];
    let sin = 0;
    if (fix !== 1 && sorteo) { if (sem == null) return { motivo: 'no se puede saber si el sorteo de la partida ' + k + ' está hecho' }; sin = sem === 0 ? 1 : 0; }
    const cal = (raw.calendario || []).find((x) => x.jornada === k);
    const meta = { ...meta0, jornada: k, jornada_completa: complete, mesas_pendientes: pendT, sorteo, sin_sortear: sin, emparejamiento: fix === 1 ? 'fijado' : 'provisional',
      plazo_desde: sp && cal ? cal.desde : null, plazo_hasta: sp && cal ? cal.hasta : null, errores: errs, avisos };

    /* --- participantes --- */
    const sust = raw.sustituciones || [];
    const nombreSP = (s, p) => { // el nombre del jugador p de la pareja s en la partida k (SP: cambia con las sustituciones)
      const col = colR(p === 1 ? 'x1' : 'x2'), code = (f) => num(f);
      const cod = (kk) => code(valor(H['_R' + kk], col + (s + 1)));
      const filaWeb = raw.participantes.find((x) => x.id === s) || {};
      const web = p === 1 ? filaWeb.j1_nombre : filaWeb.j2_nombre;
      const busca = (desde) => sust.find((x) => x.id === s && x.desde === desde);
      const c = cod(k);
      if (c) { const e = busca(Math.floor(c / 1000)); return e ? { v: e.entra_nombre } : { falta: true }; }
      let primera = null;
      for (let kk = 1; kk <= meta0.jornada; kk++) { const cc = H['_R' + kk] ? cod(kk) : null; if (cc) { const d = Math.floor(cc / 1000); if (primera == null || d < primera) primera = d; } }
      if (primera == null) return { v: web };
      const e = busca(primera);
      return e ? { v: e.sale_nombre } : { falta: true };
    };
    const participantes = [];
    for (let s = 1; s <= 200; s++) {
      if (real[s] !== 1) continue;
      const f = s + 1, W = (c) => txt(valor(webc, c + f));
      let n1, n2, a1, a2, zona;
      if (sp) {
        const x = nombreSP(s, 1), y = nombreSP(s, 2);
        if (x.falta || y.falta) return { motivo: 'la partida ' + k + ' usa una sustitución que la hoja WEB no trae' };
        n1 = x.v; n2 = y.v; a1 = txt(lee('ap1', f)); a2 = txt(lee('ap2', f)); zona = txt(lee('zone', f));
      } else { n1 = W('U'); a1 = W('V'); n2 = W('W'); a2 = W('X'); zona = W('Y'); }
      const corto = ind ? ((n1 || '') + ' ' + (a1 || '')).trim() : (a1 || '') + '-' + (a2 || '');
      participantes.push({ id: s, j1_nombre: n1 || null, j1_apellido1: a1 || null, j2_nombre: ind ? null : n2 || null, j2_apellido1: ind ? null : a2 || null,
        corto: corto || null, zona: zona || null, grupo: txt(grp[s]), ret: ret[s] === 1 ? 1 : 0, ret_desde: ret[s] === 1 ? num(retd[s]) : null, _ref: s + 3 });
    }

    /* --- clasificación --- */
    const pend = tabla('pend'), tf = tabla('TF'), tc = tabla('TC'), tie = tabla('tie');
    const gan = tabla(sp ? 'EG' : 'PG'), jugSP = tabla('EJ'), pg = tabla('PG'), pp = tabla('PP'), ka = tabla('Ka'), ntie = tabla('ntie');
    const jug = (s) => {
      if (sp) return jugSP[s];
      let t = 0;
      for (let i = 1; i <= k; i++) if (i >= (grp[s] === 'B' ? meta0.jornada_b || 1 : 1)) t += num(valor(H['_R' + i], M.jugCol + (s + 1))) || 0;
      return t;
    };
    const slotDe = (g, p) => ckey.indexOf(g + '|' + p, 1);
    const otra = (s) => { // C.I. con n (SP)
      if (ntie[s] !== 1) return 0;
      const nx = slotDe(grp[s], (crank[s] || 0) + 1), pv = slotDe(grp[s], (crank[s] || 0) - 1);
      return nx > 0 && ka[nx] === ka[s] ? nx : pv > 0 && ka[pv] === ka[s] ? pv : 0;
    };
    const clasificacion = [];
    for (let i = 1; i <= nA + nB; i++) {
      const g = i <= nA ? 'A' : 'B', p = i <= nA ? i : i - nA, s = slotDe(g, p);
      if (s <= 0) { clasificacion.push({ grupo: g, puesto: p, id: null, jug: null, gan: null, pg: null, pp: null, dp: null, tf: null, tc: null, dt: null, pendiente: null, desempate: null, _ref: i + 3 }); continue; }
      const o = sp ? otra(s) : 0;
      clasificacion.push({ grupo: g, puesto: p, id: s, jug: jug(s), gan: gan[s], pg: sp ? pg[s] : null, pp: sp ? pp[s] : null, dp: sp ? pg[s] - pp[s] : null,
        tf: tf[s], tc: tc[s], dt: tf[s] - tc[s], pendiente: pend[s], desempate: sp ? (o ? 'C.I. con ' + o : null) : txt(tie[s]), _ref: i + 3 });
    }

    /* --- emparejamientos --- */
    const T = {}; for (const h of ['t_tex', 't_tgrp', 't_tph', 't_tauto', 't_tdone', 't_lpf', 't_rpf', 't_i1', 't_i2', 't_d1', 't_d2', 't_lslot', 't_rslot', 't_tlab']) T[h] = tabla(h);
    const done = tabla('done'), pf = tabla('pf'), win = tabla('win'), pgs = tabla('pgs'), tfs = tabla('tfs');
    const fin = Math.min(M.finMesas || 101, FILAS), puntos = meta0.puntos_ausencia;
    const mesas = [];
    for (let s = 1; s <= fin - 1; s++) {
      if (T.t_tex[s] !== 1) continue;
      const g = T.t_tgrp[s];
      let desc, izq1, izq2 = 0, dcha1, dcha2 = 0, est, aus = null;
      const esRet = (x) => (x ? ret[x] === 1 : false);
      if (sp) {
        const l = T.t_lslot[s] || 0, r = T.t_rslot[s] || 0, lab = T.t_tlab[s];
        desc = l > 200 || r > 200 ? 1 : 0;
        izq1 = desc ? (l > 200 ? r : l) : l > 0 ? l : r;
        dcha1 = desc ? 0 : l > 0 ? r : 0;
        est = lab === 'DESCANSA' ? (ret[Math.max(1, izq1)] === 1 ? 'no_cuenta' : 'descanso') : lab === 'NO CUENTA (dos retiradas)' ? 'no_cuenta' : lab === 'RETIRADA' ? 'retirada'
          : lab === 'NO DISPUTADO' ? 'nd' : lab === 'PENDIENTE' || lab === 'SIN RIVAL' ? 'pendiente' : lab === 'INCOMPARECENCIA' ? 'incomparecencia' : 'jugada';
      } else if (ind) {
        desc = 0;
        const q = (x) => (!x || x > 200 ? 0 : x);
        izq1 = q(T.t_i1[s]); izq2 = q(T.t_i2[s]); dcha1 = q(T.t_d1[s]); dcha2 = q(T.t_d2[s]);
        const inc = (T.t_lpf[s] === puntos && T.t_rpf[s] === 0) || (T.t_lpf[s] === 0 && T.t_rpf[s] === puntos);
        est = T.t_tauto[s] === 1 ? 'ausencia' : T.t_tdone[s] === 0 ? 'pendiente' : inc ? 'incomparecencia' : 'jugada';
        if (est === 'ausencia') aus = [izq1, izq2, dcha1, dcha2].filter((x) => x && faus[x] === 1).join(',') || null;
      } else {
        const i1 = T.t_i1[s] || 0, d1 = T.t_d1[s] || 0;
        desc = i1 > 200 || d1 > 200 ? 1 : 0;
        izq1 = desc ? (i1 > 200 ? d1 : i1) : i1;
        dcha1 = desc ? 0 : d1;
        const inc = (T.t_lpf[s] === puntos && T.t_rpf[s] === 0) || (T.t_lpf[s] === 0 && T.t_rpf[s] === puntos);
        est = desc ? (esRet(izq1) ? 'no_cuenta' : 'descanso') : esRet(izq1) && esRet(dcha1) ? 'no_cuenta' : esRet(izq1) || esRet(dcha1) ? 'retirada'
          : T.t_tdone[s] === 0 ? 'pendiente' : inc ? 'incomparecencia' : 'jugada';
      }
      const clave = (g === 'A' ? 0 : sp ? 10000 : 10000000) + (desc ? (sp ? 5000 : 5000000) : sp ? 0 : (T.t_tph[s] || 0) * 1000) + s;
      mesas.push({ s, g, desc, izq1, izq2, dcha1, dcha2, est, aus, clave });
    }
    mesas.forEach((m) => { m.ord = mesas.filter((x) => x.clave < m.clave).length + 1; });
    const emparejamientos = [];
    for (let r = 1; r <= mesas.length + 1; r++) {
      const m = mesas.find((x) => x.ord === r);
      if (!m) continue;
      const sinRes = m.est === 'pendiente' || m.est === 'no_cuenta' || m.est === 'ausencia';
      const dato = (x, t) => (sinRes || !x ? null : done[x] === 1 ? t[x] : null);
      emparejamientos.push({ grupo: m.g, mesa: m.desc ? null : sp ? m.s : T.t_tph[m.s], mesa_grupo: m.desc ? null : (sp ? m.s : T.t_tph[m.s]) - (m.g === 'B' ? tA : 0),
        izq1: m.izq1 || null, izq2: m.izq2 || null, dcha1: m.dcha1 || null, dcha2: m.dcha2 || null, estado: m.est, ausentes: m.aus,
        p_izq: dato(m.izq1, win), p_dcha: dato(m.dcha1, win), t_izq: dato(m.izq1, pf), t_dcha: dato(m.dcha1, pf), _ref: r + 3 });
      if (sp) { const e = emparejamientos[emparejamientos.length - 1]; e.p_izq = m.izq1 && done[m.izq1] === 1 ? pgs[m.izq1] : null; e.p_dcha = m.dcha1 && done[m.dcha1] === 1 ? pgs[m.dcha1] : null; e.t_izq = m.izq1 && done[m.izq1] === 1 ? tfs[m.izq1] : null; e.t_dcha = m.dcha1 && done[m.dcha1] === 1 ? tfs[m.dcha1] : null; }
    }

    const out = { ...raw, meta, participantes, clasificacion, emparejamientos, sustituciones: sust.filter((x) => x.desde <= k), estructura: [], celdasError: [], largas: [], tipos: [] };
    if (sp && raw.calendario) out.calendario = raw.calendario;
    return out;
  }

  // La columna `h` de _WEBC (por slot) en la partida k, según las fórmulas de _WEBC.
  const tablaCon = (H, k, h) => {
    const col = (H.__mapa || (H.__mapa = mapa(H._WEBC)))[h], R = H['_R' + k], a = [];
    if (col && R) for (let f = 2; f <= FILAS; f++) a.push(valor(R, col + f));
    return a;
  };
  const sinPub = (j) => JSON.stringify({ ...j, publicado: null, jornadas: undefined });
  const RESULTADOS = ['jugada', 'incomparecencia', 'retirada', 'nd'];

  /* Todas las partidas con datos. `hojas` puede ser null (un Excel que solo trae la hoja WEB): entonces solo sale la de WEB.
     Devuelve { partidas: [{ k, raw, json, conDatos, mesas }], aviso, omitidas } con las partidas de menor a mayor; `omitidas` son las que tienen resultados y no se pueden sacar. */
  function listar(raw, hojas) {
    const base = C.construir(raw, null), k0 = base.jornada.numero, n = base.torneo.n_jornadas;
    const solo = (aviso) => ({ partidas: [{ k: k0, raw, json: base, conDatos: true, mesas: base.emparejamientos.length }], aviso, omitidas: [] });
    if (!hojas || !hojas._WEBC) return solo(null);
    if (!Number.isInteger(k0) || !Number.isInteger(n)) return solo(null);
    const prueba = derivar(raw, hojas, k0);
    if (prueba.motivo) return solo('No se han podido sacar las demás partidas del Excel (' + prueba.motivo + '). Solo se ofrece la que tiene la hoja WEB.');
    if (sinPub(C.construir(prueba, null)) !== sinPub(base)) return solo('No se han podido sacar las demás partidas del Excel: lo que sale de sus hojas de datos no coincide con la hoja WEB. Solo se ofrece la que tiene la hoja WEB.');
    const partidas = [], omitidas = [];
    for (let k = 1; k <= Math.min(n, MAX_N); k++) {
      if (k === k0) { partidas.push({ k, raw, json: base, conDatos: true, mesas: base.emparejamientos.length }); continue; }
      let d;
      try { d = derivar(raw, hojas, k); } catch (e) { d = { motivo: e.message }; }
      if (d.motivo) { if (tablaCon(hojas, k, 'done').some((x) => x === 1)) omitidas.push(k); continue; } // con resultados y sin poder sacarla: se dirá
      const json = C.construir(d, null);
      if (!json.emparejamientos.some((m) => RESULTADOS.includes(m.estado))) continue; // sin ningún resultado: no hay nada que subir
      partidas.push({ k, raw: d, json, conDatos: true, mesas: json.emparejamientos.length });
    }
    return { partidas, aviso: null, omitidas };
  }

  const API = { leerHojas, hojasHacen, derivar, listar, mapa };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.Partidas = API;
})(typeof window !== 'undefined' ? window : globalThis);
