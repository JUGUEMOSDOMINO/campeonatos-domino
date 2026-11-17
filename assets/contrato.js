/* Contrato de datos 1.0: lee la hoja WEB, valida y construye los JSON.
   Sin dependencias del navegador: lo usa publicar.html y las pruebas en Node. */
(function (raiz) {
  'use strict';

  const VERSION = { mayor: 1, menor: 0 };
  const CLAVES_META = ['id', 'nombre', 'organizador', 'tipo', 'temporada', 'fecha', 'lugar', 'n_jornadas', 'tantos_meta', 'puntos_ausencia', 'n_participantes',
    'hay_b', 'jornada_b', 'n_b', 'estado', 'jornada', 'jornada_completa', 'mesas_pendientes', 'sorteo', 'sin_sortear', 'emparejamiento', 'plazo_desde', 'plazo_hasta',
    'errores', 'avisos', 'contacto', 'normativa_url', 'criterio1', 'criterio2', 'criterio3', 'criterio4', 'criterio5'];
  const TIPO_META = { id: 't', nombre: 't', organizador: 't', tipo: 't', temporada: 't', fecha: 't', lugar: 't', n_jornadas: 'i', tantos_meta: 'i', puntos_ausencia: 'i', n_participantes: 'i',
    hay_b: 'b', jornada_b: 'i', n_b: 'i', estado: 't', jornada: 'i', jornada_completa: 'b', mesas_pendientes: 'i', sorteo: 't', sin_sortear: 'b', emparejamiento: 't',
    plazo_desde: 't', plazo_hasta: 't', errores: 'i', avisos: 'i', contacto: 't', normativa_url: 't', criterio1: 't', criterio2: 't', criterio3: 't', criterio4: 't', criterio5: 't' };
  // bloques: título (fila 2), columna inicial, cabeceras (fila 3), tipos, filas de datos
  const B = {
    participantes: { titulo: 'PARTICIPANTES', col: 3, filas: [4, 203],
      cab: ['id', 'j1_nombre', 'j1_apellido1', 'j2_nombre', 'j2_apellido1', 'corto', 'zona', 'grupo', 'ret', 'ret_desde'],
      tipo: ['i', 't', 't', 't', 't', 't', 't', 't', 'b', 'i'] },
    clasificacion: { titulo: 'CLASIFICACION', col: 14, filas: [4, 203],
      cab: ['grupo', 'puesto', 'id', 'jug', 'gan', 'pg', 'pp', 'dp', 'tf', 'tc', 'dt', 'pendiente', 'desempate'],
      tipo: ['t', 'i', 'i', 'i', 'i', 'i', 'i', 'i', 'i', 'i', 'i', 'b', 't'] },
    emparejamientos: { titulo: 'EMPAREJAMIENTOS', col: 28, filas: [4, 103],
      cab: ['grupo', 'mesa', 'mesa_grupo', 'izq1', 'izq2', 'dcha1', 'dcha2', 'estado', 'ausentes', 'p_izq', 'p_dcha', 't_izq', 't_dcha'],
      tipo: ['t', 'i', 'i', 'i', 'i', 'i', 'i', 't', 't', 'i', 'i', 'i', 'i'] },
    sustituciones: { titulo: 'SUSTITUCIONES', col: 42, filas: [4, 53],
      cab: ['id', 'desde', 'sale_nombre', 'sale_apellido1', 'entra_nombre', 'entra_apellido1'], tipo: ['i', 'i', 't', 't', 't', 't'] },
  };
  // bloque opcional (solo el SP): si la hoja WEB lo trae, el JSON lleva la clave `calendario`
  const CAL = { titulo: 'CALENDARIO', col: 49, filas: [4, 17], cab: ['jornada', 'jornada_b', 'desde', 'hasta'], tipo: ['i', 'i', 't', 't'] };
  const ESTADOS_MESA = ['pendiente', 'jugada', 'incomparecencia', 'retirada', 'descanso', 'nd', 'ausencia', 'no_cuenta'];
  const TIPOS = ['sp', 'parejas', 'individual'];
  const NOMBRES_PERSONA = { participantes: ['j1_nombre', 'j1_apellido1', 'j2_nombre', 'j2_apellido1', 'corto', 'zona'], sustituciones: ['sale_nombre', 'sale_apellido1', 'entra_nombre', 'entra_apellido1'] };
  const TEXTOS_LIBRES = { meta: ['nombre', 'organizador', 'lugar', 'temporada', 'criterio1', 'criterio2', 'criterio3', 'criterio4', 'criterio5'], clasificacion: ['desempate'] };
  const MAX_TEXTO = 300; // ninguna celda de la hoja WEB necesita más
  const RE_TEL = /[6-9](?:[\s.\-]?\d){8}|\+\s?\d{2}/;

  const letra = (c) => { let s = ''; c++; while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; };
  const ref = (c, f) => letra(c) + f;
  const ordenClaves = (o, claves) => { const r = {}; for (const k of claves) r[k] = o[k]; return r; };

  /* ---------- lectura de la hoja ---------- */
  function leer(hoja) {
    const r = { estructura: [], celdasError: [], largas: [], celdas: {}, tipos: [], meta: {}, participantes: [], clasificacion: [], emparejamientos: [], sustituciones: [], version: null };
    if (!hoja) return null;
    const celda = (c, f) => hoja[ref(c, f)];
    const valor = (c, f) => {
      const x = celda(c, f);
      if (!x) return null;
      if (x.t === 'e') { r.celdasError.push(ref(c, f)); return null; }
      let v = x.v;
      if (typeof v === 'string') { v = v.trim(); if (v === '') return null; if (v.length > MAX_TEXTO) { r.largas.push(ref(c, f)); v = v.slice(0, MAX_TEXTO); } if (v === '¿LICENCIA?') r.celdasError.push(ref(c, f)); }
      if (typeof v === 'boolean') v = v ? 1 : 0;
      return v === undefined ? null : v;
    };
    const texto = (v) => (v == null ? null : String(v));
    const a1 = valor(0, 1);
    r.version = a1 == null ? null : String(a1);
    // estructura
    const esp = (c, f, esperado) => { const v = valor(c, f); if (String(v == null ? '' : v) !== esperado) r.estructura.push(`${ref(c, f)} debería decir «${esperado}»`); };
    esp(0, 2, 'META'); esp(0, 3, 'clave'); esp(1, 3, 'valor');
    CLAVES_META.forEach((k, i) => esp(0, 4 + i, k));
    for (const b of Object.values(B)) {
      esp(b.col, 2, b.titulo);
      b.cab.forEach((k, i) => esp(b.col + i, 3, k));
    }
    // META
    CLAVES_META.forEach((k, i) => {
      const v = valor(1, 4 + i);
      r.meta[k] = TIPO_META[k] === 't' ? texto(v) : v;
      r.celdas['META.' + k] = ref(1, 4 + i);
      if (TIPO_META[k] === 'i' && v != null) r.tipos.push([ref(1, 4 + i), v]);
    });
    // bloques
    const opc = valor(CAL.col, 2) === CAL.titulo ? { calendario: CAL } : {};
    if (opc.calendario) { r.calendario = []; CAL.cab.forEach((k, i) => esp(CAL.col + i, 3, k)); }
    for (const [nombre, b] of Object.entries({ ...B, ...opc })) {
      for (let f = b.filas[0]; f <= b.filas[1]; f++) {
        const fila = {};
        let vacia = true;
        b.cab.forEach((k, i) => {
          const v = valor(b.col + i, f);
          if (v != null) vacia = false;
          fila[k] = b.tipo[i] === 't' ? texto(v) : v;
          if (b.tipo[i] === 'i' && v != null) r.tipos.push([ref(b.col + i, f), v]);
        });
        if (vacia) continue;
        fila._ref = f;
        r[nombre].push(fila);
      }
    }
    return r;
  }

  /* ---------- construcción del JSON ---------- */
  const lista = (...v) => v.filter((x) => x != null);
  function ids(txt) { return txt == null ? [] : String(txt).split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n)); }

  function construir(r, publicado) {
    const m = r.meta;
    const torneo = {
      id: m.id, nombre: m.nombre, organizador: m.organizador, tipo: m.tipo, temporada: m.temporada, fecha: m.fecha, lugar: m.lugar,
      n_jornadas: m.n_jornadas, tantos_meta: m.tantos_meta, puntos_ausencia: m.puntos_ausencia, n_participantes: m.n_participantes,
      hay_b: m.hay_b === 1, jornada_b: m.jornada_b, n_b: m.n_b, estado: m.estado, contacto: m.contacto, normativa_url: m.normativa_url,
      criterios: lista(m.criterio1, m.criterio2, m.criterio3, m.criterio4, m.criterio5),
    };
    const jornada = { numero: m.jornada, completa: m.jornada_completa === 1, mesas_pendientes: m.mesas_pendientes, sorteo: m.sorteo, sin_sortear: m.sin_sortear === 1,
      emparejamiento: m.emparejamiento, plazo_desde: m.plazo_desde, plazo_hasta: m.plazo_hasta };
    const participantes = r.participantes.map((f) => ({ ...ordenClaves(f, B.participantes.cab), ret: f.ret === 1 })).sort((x, y) => x.id - y.id);
    const sustituciones = r.sustituciones.map((f) => ordenClaves(f, B.sustituciones.cab));
    const clasificacion = r.clasificacion.map((f) => ({ ...ordenClaves(f, B.clasificacion.cab), pendiente: f.pendiente === 1 }));
    const emparejamientos = r.emparejamientos.map((f) => ({
      grupo: f.grupo, mesa: f.mesa, mesa_grupo: f.mesa_grupo, izq: lista(f.izq1, f.izq2), dcha: lista(f.dcha1, f.dcha2), estado: f.estado, ausentes: ids(f.ausentes),
      p_izq: f.p_izq, p_dcha: f.p_dcha, t_izq: f.t_izq, t_dcha: f.t_dcha,
    }));
    const j = { version: r.version, publicado, torneo, jornada, participantes, sustituciones, clasificacion, emparejamientos };
    if (r.calendario) j.calendario = r.calendario.map((f) => ordenClaves(f, CAL.cab));
    return j;
  }

  /* ---------- validación (sección 4 del contrato) ---------- */
  function fechaValida(s) {
    const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!x) return false;
    const d = new Date(Date.UTC(+x[1], +x[2] - 1, +x[3]));
    return d.getUTCFullYear() === +x[1] && d.getUTCMonth() === +x[2] - 1 && d.getUTCDate() === +x[3];
  }
  const rango = (a) => (a.length <= 3 ? a.join(', ') : a.slice(0, 3).join(', ') + '…');

  function validar(r, j, pub) {
    pub = pub || {};
    const v = [];
    const add = (cod, g, msg) => v.push({ cod, gravedad: g, msg });
    const m = r.meta, t = j.torneo, jo = j.jornada, tipoSP = t.tipo === 'sp';

    // V02 versión
    const mv = /^(\d+)\.(\d+)$/.exec(r.version || '');
    if (!mv || +mv[1] !== VERSION.mayor) add('V02', 'bloquea', 'Este Excel y la página de publicar no son de la misma versión. Pide los dos actualizados.');
    else if (+mv[2] > VERSION.menor) add('V02b', 'avisa', 'Este Excel trae datos nuevos que esta página aún no publica.');
    // V03 estructura
    const faltan = [];
    if (r.estructura.length) faltan.push(`la celda ${r.estructura[0]}`);
    if (!TIPOS.includes(t.tipo)) faltan.push('el tipo de campeonato (sp, parejas o individual)');
    for (const m_ of r.emparejamientos) if (!ESTADOS_MESA.includes(m_.estado)) { faltan.push(`el estado «${m_.estado}» de la fila ${m_._ref}`); break; }
    if (!['proximo', 'en_juego', 'terminado'].includes(t.estado)) faltan.push('el estado del campeonato');
    if (!Number.isInteger(jo.numero) || jo.numero < 1) faltan.push('el número de jornada');
    if (!t.nombre) faltan.push('el nombre del campeonato');
    if (faltan.length) add('V03', 'bloquea', 'La hoja WEB no tiene el formato esperado: ' + faltan.join('; ') + '.');
    // V04
    if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(t.id || '')) add('V04', 'bloquea', 'El identificador del torneo no vale. Usa solo letras minúsculas, números y guiones (de 3 a 60 caracteres).');
    else {
      const e = pub.indice && (pub.indice.torneos || []).find((x) => x.id === t.id);
      if (e && e.tipo !== t.tipo) add('V04', 'bloquea', 'El identificador del torneo ya lo usa otro campeonato.');
      else if (e && e.nombre !== t.nombre) add('V04b', 'confirma', `Ya hay un torneo con este identificador y otro nombre («${e.nombre}»). ¿Es el mismo?`);
    }
    // V20 el id va sin cifrar en la ruta (datos/<id>/): no puede llevar el nombre ni el apellido de nadie
    const sinTilde = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const palabras = new Set();
    for (const p of [...j.participantes, ...j.sustituciones]) for (const [k, x] of Object.entries(p)) if (/(nombre|apellido1)$/.test(k)) for (const w of sinTilde(x).split(/[^a-zñ]+/)) if (w.length >= 3) palabras.add(w);
    const delata = String(t.id || '').split('-').filter((x) => palabras.has(x));
    if (delata.length) add('V20', 'bloquea', `El identificador del torneo (${t.id}) lleva «${delata[0]}», que es el nombre o el apellido de un participante. Las carpetas de la web no se cifran: cambia el identificador en la hoja INICIO.`);
    // V05 errores de celda
    if (r.celdasError.length) add('V05', 'bloquea', `Hay un error en la hoja WEB, en la celda ${r.celdasError[0]}${r.celdasError.length > 1 ? ' y otras ' + (r.celdasError.length - 1) : ''}.`);
    // V19 textos desmesurados
    if (r.largas.length) add('V19', 'bloquea', `Hay un texto demasiado largo (más de ${MAX_TEXTO} caracteres) en la celda ${r.largas[0]}.`);
    // V06 datos personales y números
    const malos = [];
    for (const [nom, campos] of Object.entries(NOMBRES_PERSONA)) {
      for (const f of r[nom]) for (const c of campos) {
        const x = f[c];
        if (x != null && (/\d|@/.test(x) || x.length > 60)) malos.push(`${letra(B[nom].col + B[nom].cab.indexOf(c))}${f._ref}`);
      }
    }
    for (const c of TEXTOS_LIBRES.meta) { const x = m[c]; if (x != null && RE_TEL.test(x)) malos.push(r.celdas['META.' + c]); }
    for (const f of r.clasificacion) if (f.desempate != null && RE_TEL.test(f.desempate)) malos.push(`${letra(B.clasificacion.col + 12)}${f._ref}`);
    if (malos.length) add('V06', 'bloquea', `Hay algo que parece un teléfono, una licencia o un dato personal en la celda ${malos[0]}. No se publica.`);
    const numMalo = r.tipos.find(([, x]) => typeof x !== 'number' || !Number.isInteger(x) || Math.abs(x) > 99999);
    if (numMalo) add('V06', 'bloquea', `La celda ${numMalo[0]} no tiene un número entero válido (de hasta 5 cifras).`);

    // V07 ids
    const probs = [];
    const idsP = j.participantes.map((p) => p.id);
    if (new Set(idsP).size !== idsP.length) probs.push('hay números repetidos en la lista de participantes');
    if (idsP.some((i) => !Number.isInteger(i) || i < 1 || i > 200)) probs.push('hay un número fuera de 1 a 200');
    const setP = new Set(idsP);
    const cuenta = (arr) => { const c = new Map(); arr.forEach((i) => c.set(i, (c.get(i) || 0) + 1)); return c; };
    const enClas = cuenta(j.clasificacion.map((x) => x.id));
    const enMesas = cuenta(j.emparejamientos.flatMap((x) => [...x.izq, ...x.dcha]));
    for (const i of idsP) {
      if (enMesas.get(i) !== 1) probs.push(enMesas.get(i) ? `el ${i} sale más de una vez en las mesas` : `el ${i} no sale en ninguna mesa`);
      if (enClas.get(i) !== 1) probs.push(enClas.get(i) ? `el ${i} sale más de una vez en la clasificación` : `el ${i} no sale en la clasificación`);
    }
    for (const i of [...enClas.keys(), ...enMesas.keys()]) if (!setP.has(i)) probs.push(`el ${i} aparece pero no está inscrito`);
    const nums = j.emparejamientos.map((x) => x.mesa).filter((x) => x != null);
    if (new Set(nums).size !== nums.length) probs.push('hay números de mesa repetidos');
    for (const g of ['A', 'B']) {
      const fs = j.clasificacion.filter((x) => x.grupo === g);
      if (fs.some((x, k) => x.puesto !== k + 1)) probs.push(`los puestos del grupo ${g} no van de 1 a ${fs.length}`);
    }
    if (j.clasificacion.some((x) => x.grupo !== 'A' && x.grupo !== 'B') || j.emparejamientos.some((x) => x.grupo !== 'A' && x.grupo !== 'B')) probs.push('hay un grupo que no es A ni B');
    if (t.n_participantes !== idsP.length) probs.push(`el número de participantes (${t.n_participantes}) no coincide con la lista (${idsP.length})`);
    const hayB = j.clasificacion.some((x) => x.grupo === 'B') || j.emparejamientos.some((x) => x.grupo === 'B') || j.participantes.some((p) => p.grupo === 'B');
    const debeB = t.hay_b && Number.isInteger(t.jornada_b) && jo.numero >= t.jornada_b;
    if (t.hay_b && !Number.isInteger(t.jornada_b)) probs.push('hay grupo B pero falta la jornada en que empieza');
    if (hayB && !debeB) probs.push('hay un grupo B antes de tiempo o sin que el campeonato lo tenga');
    if (debeB && !hayB) probs.push('debería haber grupo B y no sale');
    if (debeB && t.n_b != null && j.participantes.filter((p) => p.grupo === 'B').length !== t.n_b) probs.push(`el grupo B debería tener ${t.n_b} participantes`);
    for (const f of j.clasificacion) { const p = j.participantes.find((x) => x.id === f.id); if (p && p.grupo !== f.grupo) { probs.push(`el ${f.id} está en dos grupos distintos`); break; } }
    if (probs.length) add('V07', 'bloquea', 'Los números no cuadran: ' + rango(probs) + '.');
    // V07b forma de las mesas
    // descanso: 1+0. no_cuenta: 2 retiradas (1+1) o una retirada que le tocaba descansar (1+0). ausencia (individual): faltan asientos vacíos (de 1 a 2 por lado)
    const forma = j.emparejamientos.find((x) => {
      if (x.estado === 'descanso') return !(x.izq.length === 1 && x.dcha.length === 0);
      if (x.estado === 'no_cuenta') return !(x.izq.length === 1 && x.dcha.length <= 1);
      if (x.estado === 'ausencia' && t.tipo === 'individual') return !(x.izq.length <= 2 && x.dcha.length <= 2 && x.izq.length + x.dcha.length >= 1);
      return t.tipo === 'individual' ? !(x.izq.length === 2 && x.dcha.length === 2) : !(x.izq.length === 1 && x.dcha.length === 1);
    });
    if (forma) add('V07b', 'bloquea', `La mesa ${forma.mesa == null ? 'de descanso' : forma.mesa} no tiene ${t.tipo === 'individual' ? 'los jugadores' : 'las parejas'} que debería.`);
    // V08 cuentas
    const cuentas = [];
    for (const f of j.clasificacion) {
      if (f.dt !== f.tf - f.tc) cuentas.push(`dif. de tantos del ${f.id}`);
      if (tipoSP && f.dp != null && f.dp !== f.pg - f.pp) cuentas.push(`dif. de partidas del ${f.id}`);
      if (f.gan > f.jug) cuentas.push(`ganadas > jugadas en el ${f.id}`);
      if (f.tf < 0 || f.tc < 0) cuentas.push(`tantos negativos del ${f.id}`);
    }
    for (const x of j.emparejamientos) {
      const conRes = x.p_izq != null && x.p_dcha != null && x.t_izq != null && x.t_dcha != null;
      const algo = x.p_izq != null || x.p_dcha != null || x.t_izq != null || x.t_dcha != null;
      if ((x.estado === 'jugada' || x.estado === 'incomparecencia') && !conRes) cuentas.push(`mesa ${x.mesa} sin resultado completo`);
      if (x.estado === 'pendiente' && algo) cuentas.push(`mesa ${x.mesa} pendiente con resultado`);
      if ([x.t_izq, x.t_dcha].some((q) => q != null && q < 0)) cuentas.push(`tantos negativos en la mesa ${x.mesa}`);
    }
    if (cuentas.length) add('V08', 'bloquea', 'La clasificación o las mesas tienen una cuenta que no cuadra: ' + rango(cuentas) + '.');
    // V08b resultados poco habituales
    const raros = j.emparejamientos.filter((x) => {
      if (x.estado !== 'jugada' || x.p_izq == null) return false;
      const k = x.p_izq + '-' + x.p_dcha;
      return tipoSP ? !['2-0', '2-1', '1-2', '0-2'].includes(k) : !['1-0', '0-1'].includes(k);
    });
    if (raros.length) add('V08b', 'avisa', `La mesa ${raros[0].mesa} tiene un resultado poco habitual${raros.length > 1 ? ' (y otras ' + (raros.length - 1) + ')' : ''}.`);

    // V09 a V12 contra lo ya publicado. pub.tambien: números de las otras partidas que se suben a la vez (no cuentan como «sin publicar»)
    const act = pub.actual, tambien = new Set(pub.tambien || []);
    const nombreJ = tipoSP ? 'jornada' : 'partida';
    if (act && act.torneo && act.torneo.id === t.id) {
      const ya = act.jornada.numero;
      if (jo.numero < ya) add('V09', 'confirma', `La web ya está en la ${nombreJ} ${ya} y vas a publicar la ${jo.numero}. Solo se corregirá esa ${nombreJ}.`);
      const hechas = new Set((act.jornadas || []).map((x) => x.numero));
      const faltan = [];
      for (let n = ya + 1; n < jo.numero; n++) if (!hechas.has(n) && !tambien.has(n)) faltan.push(n);
      if (faltan.length === jo.numero - ya - 1 && faltan.length) add('V10', 'avisa', `No se publicaron las ${nombreJ}s ${ya + 1} a ${jo.numero - 1}.`);
      else if (faltan.length) add('V10', 'avisa', `No se ${faltan.length === 1 ? 'publicó' : 'publicaron'} la${faltan.length === 1 ? '' : 's'} ${nombreJ}${faltan.length === 1 ? '' : 's'} ${faltan.join(', ')}.`);
      const incompleta = (act.jornadas || []).filter((x) => !x.completa && x.numero < jo.numero && !tambien.has(x.numero))[0];
      if (incompleta) add('V11', 'avisa', `La ${nombreJ} ${incompleta.numero} se quedó publicada sin completar. Pon el ${incompleta.numero} en INICIO (WEB_J_MANUAL), guarda, vuelve a publicar y deja la celda vacía.`);
    } else if (jo.numero > 1 && Array.from({ length: jo.numero - 1 }, (_, i) => i + 1).some((n) => !tambien.has(n))) add('V10', 'avisa', `Todavía no hay ninguna ${nombreJ} publicada de este campeonato; no se publicaron las anteriores a la ${jo.numero}.`);
    const ex = pub.existente || (pub.existentes && pub.existentes[jo.numero]);
    if (ex && ex.jornada && ex.jornada.mesas_pendientes != null && jo.mesas_pendientes > ex.jornada.mesas_pendientes) add('V12', 'confirma', 'La versión publicada tiene más resultados que este Excel. ¿Seguro?');
    // V13 a V18
    if (m.errores > 0) add('V13', 'confirma', `Hay ${m.errores} línea${m.errores === 1 ? '' : 's'} con ✖ en la hoja de la jornada. No cuentan en la clasificación.`);
    if (m.avisos > 0) add('V13b', 'avisa', `Hay ${m.avisos} línea${m.avisos === 1 ? '' : 's'} con ⚠.`);
    if (jo.sin_sortear) add('V14', 'confirma', 'El número de sorteo está a 0: se publicaría el orden de inscripción.');
    if (jo.emparejamiento === 'provisional' && !jo.completa) add('V15', 'avisa', 'El emparejamiento está sin fijar y puede cambiar si corriges un resultado.');
    if (t.normativa_url != null && !/^https:\/\//.test(t.normativa_url)) add('V16', 'bloquea', 'La dirección de la normativa debe empezar por https://');
    if ((t.tipo !== 'sp' && !fechaValida(t.fecha)) || (t.fecha != null && !fechaValida(t.fecha))) add('V17', 'bloquea', 'Falta la fecha del campeonato en INICIO (o no es una fecha válida).');
    if ((Number.isInteger(jo.numero) && Number.isInteger(t.n_jornadas) && jo.numero > t.n_jornadas) || !Number.isInteger(t.n_jornadas) || t.n_jornadas > 16 || t.n_jornadas < 1) add('V18', 'bloquea', 'El número de jornadas no es válido.');
    return v;
  }

  /* ---------- archivos a escribir ---------- */
  function conJornadas(j, lista_) {
    const o = {};
    for (const [k, x] of Object.entries(j)) { o[k] = x; if (k === 'jornada') o.jornadas = lista_; }
    return o;
  }
  // Acepta una jornada o una lista de ellas (las que se suben juntas).
  function jornadasNuevas(js, actPrev) {
    js = [].concat(js);
    const nums = new Set(js.map((x) => x.jornada.numero));
    const l = (actPrev && actPrev.torneo && actPrev.torneo.id === js[0].torneo.id ? actPrev.jornadas || [] : []).filter((x) => !nums.has(x.numero));
    for (const j of js) l.push({ numero: j.jornada.numero, completa: j.jornada.completa, publicado: j.publicado });
    return l.sort((x, y) => x.numero - y.numero);
  }
  /* Entradas de indice.json. Todas devuelven un índice nuevo y no tocan el recibido. */
  const torneosDe = (ind) => ((ind && ind.torneos) || []).slice();
  const indiceDe = (ts, publicado) => ({ version: '1.0', publicado, torneos: ts });
  const indiceSin = (ind, id, publicado) => indiceDe(torneosDe(ind).filter((x) => x.id !== id), publicado);
  // Si la entrada ya estaba, conserva su sitio (la mesa puede haber cambiado el orden de la portada); si es nueva, entra por fecha, la más reciente primero.
  function indiceCon(ind, e, publicado) {
    const ts = torneosDe(ind);
    const i = ts.findIndex((x) => x.id === e.id);
    if (i >= 0) ts[i] = e;
    else {
      const k = ts.findIndex((x) => (x.fecha || '') < (e.fecha || ''));
      ts.splice(k < 0 ? ts.length : k, 0, e);
    }
    return indiceDe(ts, publicado);
  }
  // Puesto (desde 1) de un torneo entre los de su mismo estado: es el orden en que la portada los enseña. 0 si no está.
  function posicionEnGrupo(ind, id) {
    const ts = torneosDe(ind), e = ts.find((x) => x.id === id);
    return e ? ts.filter((x) => x.estado === e.estado).findIndex((x) => x.id === id) + 1 : 0;
  }
  // Cambia nombre, temporada y estado de una entrada y la coloca en el puesto `orden` de su grupo (la portada agrupa por estado).
  function indiceEditado(ind, id, c, publicado) {
    const ts = torneosDe(ind), i = ts.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('No está en indice.json: ' + id);
    const e = { ...ts[i], nombre: c.nombre, temporada: c.temporada, estado: c.estado };
    e.ganador = c.estado === 'terminado' ? (e.ganador || c.ganador || null) : null;
    ts.splice(i, 1);
    const mismos = ts.map((x, k) => [x, k]).filter(([x]) => x.estado === c.estado);
    const pos = Math.min(Math.max(Number.isInteger(c.orden) ? c.orden : 1, 1), mismos.length + 1);
    ts.splice(pos <= mismos.length ? mismos[pos - 1][1] : mismos.length ? mismos[mismos.length - 1][1] + 1 : ts.length, 0, e);
    return indiceDe(ts, publicado);
  }
  function indiceNuevo(ind, j) {
    const t = j.torneo;
    const primero = j.clasificacion.find((x) => x.grupo === 'A' && x.puesto === 1);
    const p = primero && j.participantes.find((x) => x.id === primero.id);
    return indiceCon(ind, { id: t.id, nombre: t.nombre, tipo: t.tipo, temporada: t.temporada, fecha: t.fecha, estado: t.estado, jornada_actual: j.jornada.numero,
      n_jornadas: t.n_jornadas, n_participantes: t.n_participantes, ganador: t.estado === 'terminado' && p ? { id: p.id, corto: p.corto } : null }, j.publicado);
  }
  const aTexto = (o) => JSON.stringify(o, null, 1) + '\n';

  const API = { VERSION, CLAVES_META, B, leer, construir, validar, conJornadas, jornadasNuevas, indiceNuevo, indiceSin, indiceCon, indiceEditado, posicionEnGrupo, aTexto, letra };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.Contrato = API;
})(typeof window !== 'undefined' ? window : globalThis);
