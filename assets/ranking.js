/* Contrato de datos 1.2, tipo «ranking» (Ranking FVD Jaume I): lee la hoja WEB del Excel del ranking, valida (VR0 a VR6) y
   construye el JSON. Es el mismo que escribe tools/ranking/web_export.py de programas-domino. No toca el contrato 1.0 de
   los campeonatos (assets/contrato.js). Sin dependencias del navegador: lo usan publicar.html y las pruebas en Node.
   Es el único JSON que lleva licencias, y a la web solo sube cifrado (assets/mesa.js). */
(function (raiz) {
  'use strict';

  // 1.2: las plazas para el Campeonato de España por parejas (acta FVD 005/2026) son tres: SP, Open y ranking. plazas_ce son las del ranking (6); plazas_ranking, con las
  // que pasan al ranking por renuncias del SP o el Open; sp_jugado y open_jugado, si esos torneos ya se han jugado; plazas_provisionales, si falta alguno; plazas_vacias, las que no se pudieron dar.
  const META = ['id', 'nombre', 'tipo', 'temporada', 'estado', 'fecha', 'n_torneos', 'n_mejores', 'plazas_ce', 'plazas_ranking', 'sp_jugado', 'open_jugado', 'plazas_provisionales',
    'plazas_vacias', 'n_jugadores', 'contacto', 'normativa_url', 'errores'];
  const ENTEROS = ['n_torneos', 'n_mejores', 'plazas_ce', 'plazas_ranking', 'plazas_vacias', 'n_jugadores'];
  const BOOLEANOS = ['sp_jugado', 'open_jugado', 'plazas_provisionales'];
  const TOR = ['col', 'nombre', 'fecha', 'tipo', 'categoria', 'parejas', 'cargado'];
  const RK = ['puesto', 'empate', 'nombre', 'apellido1', 'licencia', 'licencia_ant', 'asociacion', 'total', 'plaza_ce', 'plaza_sp', 'plaza_open', 'plaza_ranking'];
  const NT = 20, COL_TOR = 3, COL_RK = 11, COL_PUNTOS = 23, FILA_MAX = 603; // D, L y X (base 0); 600 jugadores
  const LIC = /^46\/ \d{4}$/;
  const ID = /^[a-z0-9][a-z0-9-]{2,59}$/;

  const letra = (c) => { let s = ''; c++; while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; };
  const ref = (c, f) => letra(c) + f;

  // La hoja WEB es la del ranking si A1 dice 1.2 y su META, tipo «ranking».
  function es(hoja) {
    const v = (a) => { const x = hoja && hoja[a]; return x ? String(x.v).trim() : ''; };
    return v('A1') === '1.2' && v('A6') === 'tipo' && v('B6') === 'ranking';
  }

  function leer(hoja) {
    const r = { estructura: [], celdasError: [], errores: 0, doc: null };
    const valor = (c, f) => {
      const x = hoja[ref(c, f)];
      if (!x) return null;
      if (x.t === 'e') { r.celdasError.push(ref(c, f)); return null; }
      let v = x.v;
      if (typeof v === 'string') { v = v.trim(); if (v === '') return null; }
      if (typeof v === 'boolean') v = v ? 1 : 0;
      return v === undefined ? null : v;
    };
    const esp = (c, f, k) => { if (String(valor(c, f) == null ? '' : valor(c, f)) !== k) r.estructura.push(ref(c, f)); };
    esp(0, 2, 'META'); esp(0, 3, 'clave'); esp(1, 3, 'valor');
    META.forEach((k, i) => esp(0, 4 + i, k));
    esp(COL_TOR, 2, 'TORNEOS'); TOR.forEach((k, i) => esp(COL_TOR + i, 3, k));
    esp(COL_RK, 2, 'RANKING'); RK.forEach((k, i) => esp(COL_RK + i, 3, k));
    for (let k = 1; k <= NT; k++) esp(COL_PUNTOS + k - 1, 3, 't' + String(k).padStart(2, '0'));
    const torneo = {};
    META.forEach((k, i) => { torneo[k] = valor(1, 4 + i); });
    for (const k of ENTEROS) torneo[k] = torneo[k] == null ? 0 : torneo[k];
    for (const k of BOOLEANOS) torneo[k] = torneo[k] === 1;
    r.errores = torneo.errores || 0;
    delete torneo.errores;
    const torneos = [];
    for (let f = 4; f < 4 + NT; f++) {
      if (valor(COL_TOR, f) == null) break;
      const cargado = valor(COL_TOR + 6, f) === 1;
      const t = {};
      TOR.forEach((k, i) => { t[k] = valor(COL_TOR + i, f); });
      t.categoria = cargado ? t.categoria : null; t.parejas = cargado ? t.parejas : null; t.cargado = cargado;
      torneos.push(t);
    }
    const ranking = [];
    for (let f = 4; f <= FILA_MAX && valor(COL_RK, f) != null; f++) {
      const x = {};
      RK.forEach((k, i) => { x[k] = valor(COL_RK + i, f); });
      x.empate = x.empate === 1; for (const k of ['plaza_ce', 'plaza_sp', 'plaza_open', 'plaza_ranking']) x[k] = x[k] === 1;
      x.puntos = torneos.map((_, k) => valor(COL_PUNTOS + k, f));
      ranking.push(x);
    }
    const a1 = valor(0, 1);
    r.doc = { version: a1 == null ? null : String(a1), publicado: null, torneo, torneos, ranking };
    return r;
  }

  const sinTilde = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Lista de { cod, gravedad: 'bloquea', msg }. Vacía = se puede publicar. pub.indice: el indice.json del destino.
  function validar(r, pub) {
    pub = pub || {};
    const v = [], d = r.doc, t = d.torneo;
    const add = (cod, msg) => v.push({ cod, gravedad: 'bloquea', msg });
    if (d.version !== '1.2' || t.tipo !== 'ranking') add('VR0', 'Esta hoja WEB no es la del Excel del ranking (versión 1.2). Pide el Excel del ranking actualizado.');
    if (r.estructura.length) add('VR0', `La hoja WEB no tiene el formato esperado: mira la celda ${r.estructura[0]}.`);
    if (r.celdasError.length) add('VR0', `Hay un error en la hoja WEB, en la celda ${r.celdasError[0]}${r.celdasError.length > 1 ? ' y otras ' + (r.celdasError.length - 1) : ''}.`);
    if (!ID.test(t.id || '')) add('VR0', 'El identificador del ranking no vale. Usa solo letras minúsculas, números y guiones (de 3 a 60 caracteres), en la hoja INICIO.');
    else {
      const e = pub.indice && (pub.indice.torneos || []).find((x) => x.id === t.id);
      if (e && e.tipo !== 'ranking') add('VR0', 'El identificador del ranking ya lo usa un campeonato. Cambia el de la hoja INICIO.');
      const palabras = new Set();
      for (const f of d.ranking) for (const x of [f.nombre, f.apellido1]) for (const w of sinTilde(x).split(/[^a-zñ]+/)) if (w.length >= 3) palabras.add(w);
      const delata = t.id.split('-').filter((x) => palabras.has(x));
      if (delata.length) add('VR0', `El identificador del ranking (${t.id}) lleva «${delata[0]}», que es el nombre o el apellido de un jugador. Las carpetas de la web no se cifran: cámbialo en la hoja INICIO.`);
    }
    d.ranking.forEach((f, i) => {
      const n = i + 1;
      if (f.puntos.length !== d.torneos.length) add('VR0', `Fila ${n}: no hay una columna de puntos por torneo.`);
      for (const k of ['licencia', 'licencia_ant']) if (f[k] != null && !LIC.test(String(f[k]))) add('VR1', `Fila ${n}: la licencia no tiene la forma «46/ 0000».`);
      for (const k of ['nombre', 'apellido1', 'asociacion']) { const x = f[k]; if (x != null && (/\d|@/.test(String(x)) || String(x).length > 60)) add('VR2', `Fila ${n}: el nombre, el apellido o la asociación lleva cifras, «@» o más de 60 letras.`); }
      const mejores = f.puntos.map((p) => p || 0).sort((a, b) => b - a).slice(0, t.n_mejores).reduce((a, b) => a + b, 0);
      if (f.total !== mejores) add('VR3', `Fila ${n}: el total no es la suma de las ${t.n_mejores} mejores puntuaciones. ¿Se guardó el Excel después de calcular?`);
    });
    const pu = d.ranking.map((f) => f.puesto);
    if (pu.some((x, i) => i && x < pu[i - 1])) add('VR4', 'Los puestos del ranking no van en orden.');
    d.ranking.forEach((f, i) => { if (f.empate !== (pu.filter((x) => x === f.puesto).length > 1)) add('VR4', `Fila ${i + 1}: la marca de empate no cuadra con los puestos.`); });
    d.ranking.forEach((f, i) => { if (f.plaza_ce !== (f.plaza_sp || f.plaza_open || f.plaza_ranking)) add('VR5', `Fila ${i + 1}: la marca de plaza no es la suma de plaza SP, Open y ranking.`); });
    for (const [k, tope, n] of [['plaza_sp', 4, 'SP'], ['plaza_open', 2, 'Open']]) if (d.ranking.filter((f) => f[k]).length > tope) add('VR5', `Hay más de ${tope} plazas ${n} para el Campeonato de España.`);
    const con = d.ranking.filter((f) => f.plaza_ranking);
    if (con.length) {
      const tope = t.plazas_ranking + pu.filter((x) => x === con[con.length - 1].puesto).length - 1;
      if (con.length > tope) add('VR5', `Hay ${con.length} plazas del ranking para el Campeonato de España y no pueden pasar de ${tope}.`);
    }
    if (r.errores) add('VR6', `El Excel del ranking tiene ${r.errores} error${r.errores === 1 ? '' : 'es'} (✖). Arréglalos en el Excel, guárdalo y vuelve a elegirlo.`);
    return v;
  }

  // Línea de indice.json: las mismas claves que un campeonato; «jornadas» son torneos, «participantes», jugadores.
  const entradaIndice = (d) => ({ id: d.torneo.id, nombre: d.torneo.nombre, tipo: 'ranking', temporada: d.torneo.temporada, fecha: d.torneo.fecha, estado: d.torneo.estado,
    jornada_actual: d.torneo.n_torneos, n_jornadas: d.torneos.length, n_participantes: d.torneo.n_jugadores, ganador: null });
  const aTexto = (o) => JSON.stringify(o, null, 1) + '\n';

  const API = { es, leer, validar, entradaIndice, aTexto, FILA_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.Ranking = API;
})(typeof window !== 'undefined' ? window : globalThis);
