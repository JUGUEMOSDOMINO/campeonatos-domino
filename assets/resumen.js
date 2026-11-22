/* Hoja de resumen de los organizadores: lee el .xlsx que rellena un organizador (hojas Campeonato, Grupo A, Grupo B y Sustituciones), lo valida
   y saca dos cosas: el JSON de un campeonato de parejas con solo Clasificación (contrato 1.0, sin mesas y sin licencias) y el bloque de
   12 columnas que se pega en el Excel del ranking (con licencias; no sale del ordenador de la mesa). Sin dependencias del navegador:
   lo usan publicar.html y las pruebas en Node. No toca assets/contrato.js. Posiciones de las casillas: docs/ranking/Hoja_de_resumen.md
   de programas-domino. */
(function (raiz) {
  'use strict';

  const HOJAS = ['Campeonato', 'Grupo A', 'Grupo B', 'Sustituciones'];
  const F1 = 6;                                   // primera fila de datos de las tablas (la 5 es el ejemplo)
  const F_GRUPO = 205, F_SUST = 55;               // 200 parejas por grupo y 50 sustituciones
  const MAX_PAREJAS = 200, MAX_TEXTO = 300, MAX_NOMBRE = 60, MAX_PARTIDAS = 16;
  const DATOS = [['nombre', 'Nombre del campeonato'], ['fecha', 'Fecha'], ['lugar', 'Lugar'], ['organizador', 'Organizador'], ['partidas', 'Partidas jugadas']];
  const GRUPO = ['puesto', 'num', 'pareja', 'zona', 'pg', 'pf', 'pc', 'dif', 'lic1', 'lic2', 'ret', 'caso'];
  const SUST = ['grupo', 'num', 'nombre', 'lic', 'quien', 'partidas', 'caso'];
  const RE_TEL = /[6-9](?:[\s.\-]?\d){8}|\+\s?\d{2}/;
  const ID = /^[a-z0-9][a-z0-9-]{2,59}$/;
  const PARTICULAS = new Set(['del', 'las', 'los', 'san', 'van', 'von', 'der']);   // «de la», «del»…: no delatan a nadie (hay «Venta del Moro» o un apellido como «del Prado»)
  const CONTACTO = 'Jesús Eduardo Elián C.';

  const letra = (i) => String.fromCharCode(65 + i);
  const sinTilde = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const rango = (a) => (a.length <= 3 ? a.join('; ') : a.slice(0, 3).join('; ') + '…');
  const entero = (x) => (typeof x === 'number' ? (Number.isInteger(x) ? x : NaN) : typeof x === 'string' && /^-?\d+$/.test(x) ? parseInt(x, 10) : NaN);

  function fechaIso(v) {
    let d = null;
    if (v instanceof Date) d = v;
    else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 864e5));
    else if (typeof v === 'string') {
      let x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (x) d = new Date(Date.UTC(+x[1], +x[2] - 1, +x[3]));
      else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) d = new Date(Date.UTC(+x[3], +x[2] - 1, +x[1]));
    }
    if (!d || isNaN(d)) return null;
    const a = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dia = d.getUTCDate();
    return a < 2000 || a > 2100 ? null : `${a}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  // Una licencia: número FVD, «46/ 9164», NO o F… (de otra federación). Devuelve { tipo: 'fvd' | 'no' | 'vacia' | 'rara', n, txt }.
  function licencia(v) {
    if (v == null) return { tipo: 'vacia', txt: '' };
    const t = String(v).trim();
    let m;
    if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 9999 ? { tipo: 'fvd', n: v, txt: String(v) } : { tipo: 'rara', txt: t };
    if ((m = /^(?:46\/\s*)?(\d{1,4})$/.exec(t)) && +m[1] >= 1) return { tipo: 'fvd', n: +m[1], txt: t };
    if (/^NO\b/i.test(t) || /^F/i.test(t)) return { tipo: 'no', txt: t.toUpperCase() === 'NO' ? 'NO' : t };
    return { tipo: 'rara', txt: t };
  }

  // «Ana Roig - Pau Vidal» → dos jugadores. Cada uno: nombre (todo menos la última palabra) y primer apellido (la última).
  function jugador(txt) {
    const w = txt.trim().split(/\s+/);
    return w.length > 1 ? { nombre: w.slice(0, -1).join(' '), apellido1: w[w.length - 1], completo: w.join(' ') } : { nombre: w[0], apellido1: null, completo: w[0] };
  }
  function pareja(txt) {
    const p = String(txt == null ? '' : txt).split(/\s+[-–—/]\s+/).map((x) => x.trim());
    return p.length === 2 && p[0] && p[1] ? [jugador(p[0]), jugador(p[1])] : null;
  }

  const es = (libro) => !!libro && Array.isArray(libro.SheetNames) && HOJAS.every((h) => libro.SheetNames.includes(h)) && !libro.SheetNames.includes('WEB');

  function leer(libro) {
    const r = { estructura: [], celdasError: [], largas: [], datos: {}, grupos: { A: [], B: [] }, sust: [] };
    const hoja = (n) => (libro.Sheets && libro.Sheets[n]) || {};
    const valor = (ws, ref) => {
      const x = ws[ref];
      if (!x) return null;
      if (x.t === 'e') { r.celdasError.push(ref); return null; }
      let v = x.v;
      if (typeof v === 'string') { v = v.trim(); if (v === '') return null; if (v.length > MAX_TEXTO) { r.largas.push(ref); v = v.slice(0, MAX_TEXTO); } }
      return v === undefined ? null : v;
    };
    const esp = (n, ref, ok) => { const v = valor(hoja(n), ref); if (!ok(String(v == null ? '' : v))) r.estructura.push(`${n}, celda ${ref}`); };
    const c = hoja('Campeonato');
    esp('Campeonato', 'A1', (v) => v.startsWith('HOJA DE RESUMEN'));
    DATOS.forEach(([, rotulo], i) => esp('Campeonato', 'A' + (4 + i), (v) => v === rotulo));
    for (const g of ['Grupo A', 'Grupo B']) { esp(g, 'A4', (v) => v === 'Puesto'); esp(g, 'B4', (v) => v === 'Nº'); esp(g, 'C4', (v) => v === 'Pareja'); }
    esp('Sustituciones', 'A4', (v) => v.startsWith('Grupo')); esp('Sustituciones', 'B4', (v) => v === 'Nº de pareja');
    DATOS.forEach(([k], i) => { r.datos[k] = valor(c, 'B' + (4 + i)); });
    r.datos.fecha = r.datos.fecha == null ? null : fechaIso(r.datos.fecha) || String(r.datos.fecha);
    const filas = (n, claves, fin) => {
      const ws = hoja(n), out = [];
      for (let f = F1; f <= fin; f++) {
        const o = { _ref: f, _hoja: n };
        let vacia = true;
        claves.forEach((k, i) => { o[k] = valor(ws, letra(i) + f); if (o[k] != null) vacia = false; });
        if (!vacia) out.push(o);
      }
      return out;
    };
    r.grupos.A = filas('Grupo A', GRUPO, F_GRUPO);
    r.grupos.B = filas('Grupo B', GRUPO, F_GRUPO);
    r.sust = filas('Sustituciones', SUST, F_SUST);
    return r;
  }

  /* ---------- identificador ---------- */
  function identificador(d) {
    const nombre = sinTilde(d.nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
    return (nombre || 'campeonato') + (/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') ? '-' + d.fecha : '');
  }

  /* ---------- validación: lista de { cod, gravedad: 'bloquea' | 'confirma' | 'avisa', msg } ---------- */
  function validar(r, pub) {
    pub = pub || {};
    const v = [];
    const add = (cod, gravedad, msg) => v.push({ cod, gravedad, msg });
    const delPdf = r.origen === 'pdf', pdf = delPdf || r.origen === 'access';   // del informe de Access (PDF o Excel): sin lugar y con P.P. para cuadrar las partidas; el PDF, además, sin licencias
    const donde = (x) => x._donde || `${x._hoja}, fila ${x._ref}`;
    const d = r.datos;
    if (r.estructura.length) add('R01', 'bloquea', r.origen === 'access' ? `Este Excel no es la exportación de la clasificación de Access que esperamos (${r.estructura[0]}). Pide al organizador que lo exporte otra vez.`
      : `Este archivo no es la Hoja de resumen o está cambiado (mira ${r.estructura[0]}). Pide la hoja de nuevo.`);
    if (r.celdasError.length) add('R01', 'bloquea', `Hay un error en una celda (${r.celdasError[0]}${r.celdasError.length > 1 ? ' y otras ' + (r.celdasError.length - 1) : ''}). Corrígela en el Excel y guárdalo.`);
    // datos del campeonato
    const p = [];
    if (!d.nombre) p.push('falta el nombre del campeonato');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) p.push('falta la fecha, o no es una fecha válida');
    const np = entero(d.partidas);
    if (!(np >= 1 && np <= MAX_PARTIDAS)) p.push(`las partidas jugadas tienen que ser un número de 1 a ${MAX_PARTIDAS}`);
    if (p.length) add('R02', 'bloquea', 'Datos del campeonato: ' + p.join('; ') + '.');
    if (!pdf && !r.estructura.length && !p.length && (!d.lugar || !d.organizador)) add('R02', 'avisa', `Falta ${!d.lugar && !d.organizador ? 'el lugar y el organizador' : !d.lugar ? 'el lugar' : 'el organizador'}: la web lo dejará en blanco.`);
    const A = r.grupos.A, B = r.grupos.B, todas = [...A, ...B];
    if (!A.length) add('R03', 'bloquea', 'No hay ninguna pareja en el grupo A.');
    if (pdf && r.lineasMalas.length) add('P01', 'bloquea', (delPdf ? 'Hay líneas del PDF' : 'Hay filas del Excel') + ' que no se han podido leer, y no se publica sin ellas: ' + rango(r.lineasMalas.map((x) => (x.pag ? `página ${x.pag}, línea ${x.n}` : `fila ${x.n}`) + ` (${x.motivo})` + (x.t ? `: «${x.t}»` : ''))) + '.');
    if (r.partidasDeducidas && np >= 1) add('P05', 'avisa', `El archivo no dice cuántas partidas hubo. Se toman ${np}: las que suman ganadas y perdidas en el grupo A.`);
    if (delPdf) {
      const largas = [...A, ...B].filter((x) => String(x.pareja).length >= 50).map((x) => entero(x.num));
      if (largas.length) add('P04', 'avisa', `Access corta los nombres muy largos (acaban en «Ib» o «Prad», por ejemplo). Hay ${largas.length} ${largas.length === 1 ? 'pareja con nombre largo' : 'parejas con nombres largos'} (Nº ${rango(largas.map(String)).replace(/; /g, ', ')}): si alguno sale cortado, se publica cortado.`);
    }
    if (pdf && r.rellenos) add('P02', 'avisa', `Se han saltado ${r.rellenos} ${r.rellenos === 1 ? 'fila de relleno' : 'filas de relleno'} («XXX XXX - ZZZ ZZZ»). No cuentan como parejas.`);
    // filas incompletas y nombres
    const inc = [], jug = new Map();
    for (const x of todas) {
      const falta = ['puesto', 'num', 'pareja', 'pg', 'pf', 'pc', 'dif'].filter((k) => x[k] == null);
      if (falta.length) { inc.push(`${donde(x)}: falta ${falta.map((k) => ({ puesto: 'el puesto', num: 'el Nº', pareja: 'la pareja', pg: 'P.G.', pf: 'P.F.', pc: 'P.C.', dif: 'Dif.' })[k]).join(', ')}`); continue; }
      const j = pareja(x.pareja);
      if (!j) inc.push(`${donde(x)}: escribe la pareja como «Nombre Apellido - Nombre Apellido»`);
      else { jug.set(x, j); if (!j[0].apellido1 || !j[1].apellido1) inc.push(`${donde(x)}: falta el primer apellido de algún jugador`); }
    }
    if (inc.length) add('R04', 'bloquea', 'Hay filas incompletas: ' + rango(inc) + '.');
    // puestos y números
    const pn = [];
    const nums = new Map();
    for (const x of todas) {
      const n = entero(x.num);
      if (x.num != null && !(n >= 1 && n <= MAX_PAREJAS)) pn.push(`${donde(x)}: el Nº tiene que ser un número de 1 a ${MAX_PAREJAS}`);
      else if (x.num != null) { if (nums.has(n)) pn.push(`el Nº ${n} sale dos veces (${donde(nums.get(n))} y ${donde(x)})`); else nums.set(n, x); }
    }
    if (todas.length > MAX_PAREJAS) pn.push(`no caben más de ${MAX_PAREJAS} parejas entre los dos grupos`);
    for (const [g, fs] of [['A', A], ['B', B]]) {
      const ps = fs.map((x) => entero(x.puesto));
      const mal = fs.filter((x) => x.puesto != null && !(entero(x.puesto) >= 1));
      for (const x of mal) pn.push(`${donde(x)}: el puesto tiene que ser un número desde el 1`);
      const repetidos = [...new Set(ps.filter((n, i) => n >= 1 && ps.indexOf(n) !== i))];
      if (repetidos.length) pn.push(`grupo ${g}: el puesto ${repetidos[0]} sale dos veces`);
      else if (!mal.length && fs.length && ps.some((n) => n > fs.length || n < 1)) pn.push(`grupo ${g}: los puestos tienen que ir de 1 a ${fs.length}, sin saltos`);
    }
    if (pn.length) add('R05', 'bloquea', 'Los números no cuadran: ' + rango(pn) + '.');
    // cuentas
    const cu = [];
    for (const x of todas) {
      const [g, pf, pc, dif] = [entero(x.pg), entero(x.pf), entero(x.pc), entero(x.dif)];
      for (const [k, rot] of [['pg', 'P.G.'], ['pf', 'P.F.'], ['pc', 'P.C.'], ['dif', 'Dif.']]) if (x[k] != null && isNaN(entero(x[k]))) cu.push(`${donde(x)}: ${rot} tiene que ser un número entero`);
      if ([g, pf, pc, dif].some(isNaN)) continue;
      if (pf < 0 || pc < 0 || g < 0) cu.push(`${donde(x)}: hay cifras negativas`);
      if (np >= 1 && g > np) cu.push(`${donde(x)}: P.G. (${g}) es mayor que las partidas jugadas (${np})`);
      if (dif !== pf - pc) cu.push(`${donde(x)}: Dif. (${dif}) no es P.F. menos P.C. (${pf - pc})`);
      if (Math.max(Math.abs(pf), Math.abs(pc), Math.abs(dif)) > 99999) cu.push(`${donde(x)}: una cifra pasa de 5 cifras`);
    }
    if (pdf && np >= 1) {
      // ganadas + perdidas = partidas. El grupo A las juega todas. Otro grupo (el B) puede haber jugado menos, pero todas sus parejas las mismas.
      for (const [g, fs] of [['A', A], ['B', B]]) {
        const sumas = fs.map((x) => entero(x.pg) + entero(x.pp)).filter((n) => !isNaN(n));
        if (!sumas.length) continue;
        const cuenta = new Map(); sumas.forEach((n) => cuenta.set(n, (cuenta.get(n) || 0) + 1));
        const comun = g === 'A' ? np : [...cuenta].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
        for (const x of fs) {
          const s = entero(x.pg) + entero(x.pp);
          if (isNaN(s) || s === comun) continue;
          cu.push(g === 'A' ? `${donde(x)}: la pareja ${entero(x.num)} tiene ${entero(x.pg)} ganadas y ${entero(x.pp)} perdidas: ${s} partidas, y el campeonato tuvo ${np}`
            : `${donde(x)}: la pareja ${entero(x.num)} tiene ${s} partidas y las demás del grupo ${g}, ${comun}`);
        }
        if (comun > np) cu.push(`grupo ${g}: sus parejas tienen ${comun} partidas y el campeonato tuvo ${np}`);
        else if (comun !== np && g !== 'A') add('P03', 'avisa', `En el grupo ${g} cada pareja jugó ${comun} ${comun === 1 ? 'partida' : 'partidas'} y el campeonato tuvo ${np}. Si no es lo que esperabas, mira el archivo.`);
      }
    }
    if (r.origen === 'access') {
      // el puesto sale del orden de las filas: si en un grupo suben las ganadas al bajar, el orden no es el de la clasificación
      for (const [g, fs] of [['A', A], ['B', B]]) { const i = fs.findIndex((x, k) => k > 0 && x.pg > fs[k - 1].pg); if (i > 0) add('P06', 'avisa', `En el grupo ${g} las filas no vienen ordenadas por ganadas (${donde(fs[i])}). El puesto sale del orden de las filas, así que mira que sea el de la clasificación.`); }
    }
    if (cu.length) add('R06', 'bloquea', 'Hay cuentas que no cuadran: ' + rango(cu) + '.');
    // licencias
    const raras = [], faltan = [], usadas = new Map(), dup = [];
    const mirar = (x, v, quien) => {
      const l = licencia(v);
      if (l.tipo === 'rara') raras.push(`${donde(x)}: la licencia «${l.txt}» no tiene la forma 9164 o 46/ 9164 (ni es NO)`);
      else if (l.tipo === 'vacia') faltan.push(`${donde(x)} (${quien})`);
      else if (l.tipo === 'fvd') { if (usadas.has(l.n)) dup.push(`la licencia ${l.n} sale dos veces (${donde(usadas.get(l.n))} y ${donde(x)})`); else usadas.set(l.n, x); }
    };
    if (!delPdf) { for (const x of todas) { mirar(x, x.lic1, 'jugador 1'); mirar(x, x.lic2, 'jugador 2'); } }
    for (const x of r.sust) mirar(x, x.lic, 'sustituto');
    if (raras.length) add('R07', 'bloquea', rango(raras) + '.');
    if (faltan.length) add('R07', 'avisa', 'Falta una licencia (escribe NO si no tiene): ' + rango(faltan) + '.');
    if (dup.length) add('R08', 'bloquea', rango(dup) + '.');
    // datos personales: nombres sin cifras ni arroba, y nada que parezca un teléfono
    const per = [];
    for (const [x, j] of jug) for (const t of j) for (const s of [t.nombre, t.apellido1]) if (s && (/\d|@/.test(s) || s.length > MAX_NOMBRE)) per.push(donde(x));
    for (const x of todas) if (x.zona != null && (/\d|@/.test(String(x.zona)) || String(x.zona).length > MAX_NOMBRE)) per.push(donde(x) + ' (zona)');
    for (const x of r.sust) if (x.nombre != null && (/\d|@/.test(String(x.nombre)) || String(x.nombre).length > MAX_NOMBRE)) per.push(donde(x));
    for (const k of ['nombre', 'lugar', 'organizador']) if (d[k] != null && RE_TEL.test(String(d[k]))) per.push('Campeonato, ' + k);
    if (r.largas.length) per.push(`la celda ${r.largas[0]} tiene un texto demasiado largo`);
    if (per.length) add('R09', 'bloquea', 'Hay algo que parece un teléfono, un correo o un dato personal que no es un nombre: ' + rango([...new Set(per)]) + '. No se publica.');
    // retiradas
    const re = [];
    for (const x of todas) {
      if (x.ret != null && !(entero(x.ret) >= 1 && entero(x.ret) <= np)) re.push(`${donde(x)}: la retirada tiene que ser una partida de 1 a ${np >= 1 ? np : 'las jugadas'}`);
      if (x.caso != null && !['10', '9'].includes(String(x.caso))) re.push(`${donde(x)}: el caso de la retirada es 10 o 9`);
      else if (x.caso != null && x.ret == null) re.push(`${donde(x)}: hay caso de retirada pero no la partida`);
    }
    if (re.length) add('R10', 'bloquea', rango(re) + '.');
    // sustituciones
    const su = [];
    for (const x of r.sust) {
      const g = x.grupo == null ? '' : String(x.grupo).toUpperCase();
      const n = entero(x.num);
      if (g !== 'A' && g !== 'B') { su.push(`${donde(x)}: el grupo es A o B`); continue; }
      const f = x.nombre == null || isNaN(n) || x.quien == null || x.partidas == null || x.caso == null;
      if (f) { su.push(`${donde(x)}: faltan datos (pareja, nombre, a quién sustituye, partidas y caso)`); continue; }
      if (!r.grupos[g].some((y) => entero(y.num) === n)) su.push(`${donde(x)}: la pareja ${n} no está en el grupo ${g}`);
      if (![1, 2].includes(entero(x.quien))) su.push(`${donde(x)}: sustituye al jugador 1 o al 2`);
      if (!(entero(x.partidas) >= 1 && entero(x.partidas) <= np - 1)) su.push(`${donde(x)}: las partidas del sustituto van de 1 a ${np >= 2 ? np - 1 : 'las jugadas menos una'}`);
      if (!['E', '10', '9'].includes(String(x.caso).toUpperCase())) su.push(`${donde(x)}: el caso es E, 10 o 9`);
    }
    if (su.length) add('R11', 'bloquea', 'Sustituciones: ' + rango(su) + '.');
    // identificador: va en la ruta de la web y no se cifra
    const id = identificador(d);
    if (!ID.test(id)) add('R12', 'bloquea', 'El identificador del campeonato no vale: cambia el nombre (de 3 a 60 letras, cifras o guiones).');
    else {
      const palabras = new Set();
      for (const j of jug.values()) for (const t of j) for (const s of [t.nombre, t.apellido1]) for (const w of sinTilde(s).split(/[^a-zñ]+/)) if (w.length >= 3 && !PARTICULAS.has(w)) palabras.add(w);
      for (const x of r.sust) for (const w of sinTilde(x.nombre).split(/[^a-zñ]+/)) if (w.length >= 3 && !PARTICULAS.has(w)) palabras.add(w);
      const delata = id.split('-').filter((w) => palabras.has(w));
      if (delata.length) add('R12', 'bloquea', `El identificador del campeonato (${id}) lleva «${delata[0]}», que es el nombre o el apellido de un jugador. Las carpetas de la web no se cifran: cambia el nombre del campeonato.`);
      const e = pub.indice && (pub.indice.torneos || []).find((y) => y.id === id);
      if (e && e.tipo !== 'parejas') add('R13', 'bloquea', 'El identificador de este campeonato ya lo usa otro campeonato de otro tipo. Cambia el nombre o la fecha.');
      else if (e) add('R13', 'confirma', `Ya hay un campeonato publicado con este nombre y esta fecha («${e.nombre}»). Se sustituirá por este resumen.`);
    }
    return v;
  }

  /* ---------- JSON de la web (contrato 1.0: parejas, terminado, solo Clasificación, sin licencias) ---------- */
  function construir(r, publicado) {
    const d = r.datos, np = entero(d.partidas);
    const A = r.grupos.A, B = r.grupos.B;
    const participantes = [], clasificacion = [];
    for (const [g, fs] of [['A', A], ['B', B]]) {
      for (const x of fs.slice().sort((a, b) => entero(a.puesto) - entero(b.puesto))) {
        const [j1, j2] = pareja(x.pareja), ret = x.ret != null;
        participantes.push({ id: entero(x.num), j1_nombre: j1.nombre, j1_apellido1: j1.apellido1, j2_nombre: j2.nombre, j2_apellido1: j2.apellido1,
          corto: `${j1.apellido1 || j1.nombre}-${j2.apellido1 || j2.nombre}`, zona: x.zona == null ? null : String(x.zona), grupo: g, ret, ret_desde: ret ? entero(x.ret) : null });
        clasificacion.push({ grupo: g, puesto: entero(x.puesto), id: entero(x.num), jug: null, gan: entero(x.pg), pg: null, pp: null, dp: null, tf: entero(x.pf), tc: entero(x.pc), dt: entero(x.dif), pendiente: false, desempate: null });
      }
    }
    participantes.sort((a, b) => a.id - b.id);
    return {
      version: '1.0', publicado,
      torneo: { id: identificador(d), nombre: d.nombre, organizador: d.organizador, tipo: 'parejas', temporada: null, fecha: d.fecha, lugar: d.lugar, n_jornadas: np, tantos_meta: null,
        puntos_ausencia: null, n_participantes: participantes.length, hay_b: B.length > 0, jornada_b: null, n_b: B.length || null, estado: 'terminado', contacto: CONTACTO, normativa_url: null, criterios: [] },
      jornada: { numero: np, completa: true, mesas_pendientes: 0, sorteo: null, sin_sortear: false, emparejamiento: null, plazo_desde: null, plazo_hasta: null },
      participantes, sustituciones: [], clasificacion, emparejamientos: [],
    };
  }

  /* ---------- bloque del ranking: A:L, una fila por pareja (A y luego B) y una más por cada sustituto de más ---------- */
  function bloque(r) {
    const filas = [], avisos = [];
    let parejas = 0, sinLic = 0;
    const txt = (l) => { const x = licencia(l); return x.tipo === 'vacia' ? '' : x.tipo === 'fvd' && typeof l === 'number' ? l : x.txt; };
    for (const g of ['A', 'B']) {
      for (const x of r.grupos[g].slice().sort((a, b) => entero(a.puesto) - entero(b.puesto))) {
        const [j1, j2] = pareja(x.pareja);
        const ss = r.sust.filter((s) => String(s.grupo).toUpperCase() === g && entero(s.num) === entero(x.num));
        const s0 = ss[0];
        for (const l of [x.lic1, x.lic2]) if (licencia(l).tipo !== 'fvd') sinLic++;
        filas.push([g, entero(x.puesto), txt(x.lic1), j1.completo, txt(x.lic2), j2.completo, x.ret != null ? entero(x.ret) : '',
          s0 ? txt(s0.lic) : '', s0 ? s0.nombre : '', s0 ? entero(s0.quien) : '', s0 ? entero(s0.partidas) : '', s0 ? (String(s0.caso).toUpperCase() === 'E' ? 'E' : entero(s0.caso)) : x.caso != null ? entero(x.caso) : '']);
        for (const s of ss.slice(1)) filas.push([g, entero(x.puesto), '', '', '', '', '', txt(s.lic), s.nombre, entero(s.quien), entero(s.partidas), String(s.caso).toUpperCase() === 'E' ? 'E' : entero(s.caso)]);
        parejas++;
      }
    }
    if (sinLic) avisos.push(`ℹ ${sinLic} ${sinLic === 1 ? 'jugador sin licencia' : 'jugadores sin licencia'} de la FVD (NO, F o vacío): no ${sinLic === 1 ? 'puntúa' : 'puntúan'}.`);
    return { filas, parejas, avisos, tsv: filas.map((f) => f.join('\t')).join('\n') };
  }

  const API = { HOJAS, es, leer, validar, construir, bloque, identificador, licencia, pareja };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.Resumen = API;
})(typeof window !== 'undefined' ? window : globalThis);
