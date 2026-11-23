// Copia de programas-domino/tools/ranking/leer_pdf.js: si cambia allí, se copia aquí (y al revés). Lo usan publicar.html y leer_torneo.html.
// Busca a los jugadores del PDF «Clasificación Partida N» (ya leído por clasifpdf.js) en la lista del Excel del ranking y prepara el bloque de
// resultados A:L (docs/ranking/Diseno_ranking.md §4.2). Funciona en el navegador (leer_torneo.html) y en Node (pruebas). No envía nada a ningún sitio.
//
// El PDF trae «Nombre Apellido1 Apellido2» sin separar y a veces sin el segundo apellido; Access corta los nombres largos («Jose Antonio Cañizares Ib»).
// El Excel del ranking trae nombre, 1er apellido y 2º apellido en columnas. Se compara sin tildes ni mayúsculas:
//   1. Encaja si el PDF es «nombre apellido1 apellido2», o «nombre apellido1», o, cuando el Excel no tiene 2º apellido, empieza por «nombre apellido1».
//   2. Si no, encaja si el PDF es el principio de ese nombre completo (el nombre cortado por Access), siempre que sea uno solo.
//   3. Si no encaja ninguno, se proponen los parecidos (p. ej. «Oleg» y «Olegario»), pero nunca se dan por buenos.
// Lo que no encuentra o encaja con más de uno queda pendiente: el árbitro elige de una lista o lo marca como no federado (licencia NO).
(function (raiz) {
  'use strict';

  const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();
  const MIN_CORTADO = 8;                         // un PDF más corto que esto no vale como principio de un nombre

  // Hojas Jugadores (filas 3 en adelante: A código, B nombre, C 1er apellido, D 2º apellido, E licencia vigente) y Licencias
  // (A licencia, B código, D año desde, E año hasta).
  function leerJugadores(wb, XLSX) {
    const out = { jugadores: [], errores: [], avisos: [] };
    const J = wb.Sheets && wb.Sheets.Jugadores, L = wb.Sheets && wb.Sheets.Licencias;
    const v = (ws, a) => { const c = ws[a]; if (!c || c.v === undefined || c.v === null) return null; return typeof c.v === 'string' ? (c.v.trim() === '' ? null : c.v.trim()) : c.v; };
    if (!J || !L || v(J, 'A2') !== 'Código' || v(J, 'B2') !== 'Nombre') {
      out.errores.push('✖ Este Excel no es el del ranking: no tiene las hojas Jugadores y Licencias del programa del ranking.');
      return out;
    }
    const fin = (ws) => (XLSX && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.r + 1 : 2002);
    const porCodigo = new Map();
    for (let r = 3; r <= fin(J); r++) {
      const codigo = v(J, 'A' + r), nombre = v(J, 'B' + r), ap1 = v(J, 'C' + r), ap2 = v(J, 'D' + r);
      if (codigo === null || nombre === null || ap1 === null) continue;
      const j = { codigo: String(codigo), nombre: String(nombre), ap1: String(ap1), ap2: ap2 === null ? '' : String(ap2), vigente: v(J, 'E' + r), lics: [] };
      j.completo = norm(`${j.nombre} ${j.ap1} ${j.ap2}`); j.corto = norm(`${j.nombre} ${j.ap1}`); j.sinAp2 = norm(j.ap2) === '';
      out.jugadores.push(j); porCodigo.set(j.codigo, j);
    }
    for (let r = 3; r <= fin(L); r++) {
      const lic = v(L, 'A' + r), j = porCodigo.get(String(v(L, 'B' + r)));
      if (lic === null || !j) continue;
      const desde = v(L, 'D' + r), hasta = v(L, 'E' + r);
      j.lics.push({ lic, desde: typeof desde === 'number' ? desde : null, hasta: typeof hasta === 'number' ? hasta : null });
    }
    if (!out.jugadores.length) out.errores.push('✖ La hoja Jugadores del Excel del ranking está vacía.');
    return out;
  }

  const rara = (js) => Math.max(1, Math.floor(js.length * 0.03));   // poco corriente: sale en el 3 % de los jugadores o menos (en 243, hasta 7)
  const frecuencias = (js) => { const m = new Map(); for (const j of js) for (const u of new Set(j.completo.split(' '))) m.set(u, (m.get(u) || 0) + 1); return m; };
  const coincide = (t, u) => t === u || (t.length >= 3 && u.length >= 3 && (t.startsWith(u) || u.startsWith(t)));

  function buscar(texto, indice) {
    const p = norm(texto), js = indice.jugadores;
    const exactos = js.filter((j) => p === j.completo || p === j.corto || (j.sinAp2 && p.startsWith(j.corto + ' ')));
    if (exactos.length) return { estado: exactos.length === 1 ? 'unico' : 'varios', candidatos: exactos, cortado: false, sugerencias: [] };
    const cortados = p.length >= MIN_CORTADO ? js.filter((j) => j.completo.startsWith(p)) : [];
    if (cortados.length) return { estado: cortados.length === 1 ? 'unico' : 'varios', candidatos: cortados, cortado: true, sugerencias: [] };
    // Parecidos: al menos dos palabras iguales (o una el principio de la otra) y alguna poco corriente en la lista (la de «Jose» o «Martinez» no basta).
    const ts = p.split(' '), df = indice.frecuencias || (indice.frecuencias = frecuencias(js)), RARA = rara(js);
    const sugerencias = js.map((j) => {
      const us = j.completo.split(' '), ok = ts.map((t) => us.find((u) => coincide(t, u))).filter(Boolean);
      return { j, n: ok.length, raro: ok.some((u) => (df.get(u) || 1) <= RARA), peso: ok.reduce((a, u) => a + 1 / (df.get(u) || 1), 0) };
    }).filter((x) => x.n >= Math.max(2, Math.ceil(ts.length * 0.6)) && x.raro).sort((a, b) => b.peso - a.peso).slice(0, 8).map((x) => x.j);
    return { estado: 'ninguno', candidatos: [], cortado: false, sugerencias };
  }

  // La licencia que valía el año del torneo: la FVD con el «año desde» más reciente entre las vigentes; si no hay, una NO/F vigente;
  // si tampoco, la FVD más reciente de otro año (con aviso); y, si no tiene ninguna, la «vigente» de la ficha.
  function licenciaEn(j, iso) {
    const año = parseInt(String(iso || '').slice(0, 4), 10);
    const vale = (l) => (l.desde === null || año >= l.desde) && (l.hasta === null || año <= l.hasta);
    const masNueva = (ls) => ls.slice().sort((a, b) => (b.desde || 0) - (a.desde || 0))[0];
    const fvd = j.lics.filter((l) => typeof l.lic === 'number'), otras = j.lics.filter((l) => typeof l.lic !== 'number');
    const a = isNaN(año) ? null : masNueva(fvd.filter(vale)) || masNueva(otras.filter(vale));
    if (a) return { lic: a.lic };
    const b = masNueva(fvd) || masNueva(otras);
    if (b) return { lic: b.lic, otroAño: true };
    const m = /(\d{1,4})\s*$/.exec(String(j.vigente || ''));
    return m ? { lic: +m[1], otroAño: true } : { lic: null };
  }

  // La pareja «XXX XXX - ZZZ ZZZ» (el descanso cuando hay número impar de parejas) CUENTA: es una pareja más, la última del grupo A, sin licencias. No puntúa
  // y su puesto no da puntos a nadie (como un no federado). Nunca se busca en la lista del ranking ni queda pendiente.
  const FICTICIA = /^X{2,}\s+X{2,}\s*-\s*Z{2,}\s+Z{2,}$/i;
  const esFicticia = (x) => !!x.ficticia || FICTICIA.test(String(x.pareja == null ? '' : x.pareja).trim());
  const AVISO_FICTICIA = 'ℹ La pareja de relleno «XXX XXX - ZZZ ZZZ» (el descanso cuando hay número impar) cuenta como una pareja más, la última del grupo A: va con licencia NO, no puntúa y su puesto no da puntos a nadie.';

  const dividir = (pareja) => String(pareja).split(/\s+[-–—]\s+/).map((x) => x.trim());

  /* r: lo que devuelve ClasifPdf.interpretar. decisiones: { 'A:9:1': 'J0008' | 'NO' | '?' }, con la clave grupo:Nº de pareja:jugador (1 o 2):
     un código es el jugador elegido, NO es «no federado» y «?» deja ese jugador otra vez pendiente (para cambiar uno que se había dado por bueno).
     Si dos jugadores del PDF encajan solos con la misma persona, los dos quedan pendientes («repetido»): una persona no juega en dos parejas. */
  function armar(r, indice, decisiones) {
    const out = { filas: [], pendientes: [], avisos: [], errores: [], tsv: '', resueltos: [], cuentas: { parejas: 0, jugadores: 0, solos: 0, cortados: 0, elegidos: 0, noFederados: 0 } };
    const c = out.cuentas, porCodigo = new Map(indice.jugadores.map((j) => [j.codigo, j]));
    const fecha = r.datos && r.datos.fecha, dec = decisiones || {};
    // 1. Cada jugador del PDF: elegido a mano, encontrado solo, o pendiente.
    const parejas = [];
    for (const g of ['A', 'B']) {
      for (const x of r.grupos[g].slice().sort((a, b) => a.puesto - b.puesto)) {
        c.parejas++;
        const slots = dividir(x.pareja).map((texto, i) => {
          const clave = `${g}:${x.num}:${i + 1}`, d = dec[clave], s = { clave, grupo: g, puesto: x.puesto, num: x.num, quien: i + 1, texto };
          c.jugadores++;
          if (esFicticia(x)) return Object.assign(s, { noFed: true, ficticia: true });
          if (d === 'NO') return Object.assign(s, { noFed: true });
          if (d && d !== '?' && porCodigo.has(d)) return Object.assign(s, { jug: porCodigo.get(d), elegido: true });
          const b = buscar(texto, indice);
          if (b.estado === 'unico' && d !== '?') return Object.assign(s, { jug: b.candidatos[0], cortado: b.cortado });
          return Object.assign(s, { pend: { estado: d === '?' ? 'revisar' : b.estado, candidatos: b.candidatos, sugerencias: b.sugerencias } });
        });
        parejas.push({ g, x, slots });
      }
    }
    // 2. Una persona encontrada sola en dos sitios: los dos pasan a pendientes.
    const solos = new Map();
    for (const { slots } of parejas) for (const s of slots) if (s.jug && !s.elegido) (solos.get(s.jug.codigo) || solos.set(s.jug.codigo, []).get(s.jug.codigo)).push(s);
    for (const [, ss] of solos) if (ss.length > 1 || ss.some((s) => parejas.some((p) => p.slots.some((o) => o !== s && o.elegido && o.jug.codigo === s.jug.codigo))))
      for (const s of ss) { s.pend = { estado: 'repetido', candidatos: [s.jug], sugerencias: [] }; delete s.jug; }
    // 3. Las filas, o la lista de lo pendiente.
    const usados = new Map();
    let sinLic = 0, otroAño = 0;
    const filas = [];
    for (const { g, x, slots } of parejas) {
      const celdas = slots.map((s) => {
        if (s.pend) { out.pendientes.push(Object.assign({ clave: s.clave, grupo: s.grupo, puesto: s.puesto, num: s.num, quien: s.quien, texto: s.texto }, s.pend)); return [null, null]; }
        if (s.ficticia) return ['NO', s.texto];
        if (s.noFed) { c.noFederados++; out.resueltos.push({ clave: s.clave, num: s.num, texto: s.texto, como: 'NO' }); return ['NO', s.texto]; }
        if (s.elegido) c.elegidos++; else { c.solos++; if (s.cortado) c.cortados++; }
        const l = licenciaEn(s.jug, fecha);
        out.resueltos.push({ clave: s.clave, num: s.num, texto: s.texto, como: s.elegido ? 'elegido' : s.cortado ? 'cortado' : 'solo', nombre: `${s.jug.nombre} ${s.jug.ap1} ${s.jug.ap2}`.trim(), lic: l.lic });
        if (l.lic === null) sinLic++; else if (l.otroAño) otroAño++;
        if (usados.has(s.jug.codigo)) out.errores.push(`✖ El mismo jugador sale dos veces en el torneo: pareja ${usados.get(s.jug.codigo)} y pareja ${x.num}${l.lic === null ? '' : ` (licencia ${l.lic})`}. Mira el PDF.`);
        else usados.set(s.jug.codigo, x.num);
        return [l.lic === null ? 'NO' : l.lic, `${s.jug.nombre} ${s.jug.ap1}`];
      });
      filas.push([g, x.puesto, celdas[0][0], celdas[0][1], celdas[1] ? celdas[1][0] : null, celdas[1] ? celdas[1][1] : null, null, null, null, null, null, null]);
    }
    if (parejas.some((p) => esFicticia(p.x))) out.avisos.push(AVISO_FICTICIA);
    if (c.cortados) out.avisos.push(`ℹ ${c.cortados === 1 ? '1 nombre venía cortado' : c.cortados + ' nombres venían cortados'} en el PDF y se ha encontrado en la lista: mira que sea quien es.`);
    if (sinLic) out.avisos.push(`⚠ ${sinLic === 1 ? '1 jugador encontrado no tiene' : sinLic + ' jugadores encontrados no tienen'} licencia en el Excel del ranking (sin licencia): van como NO y no puntúan.`);
    if (otroAño) out.avisos.push(`ℹ ${otroAño === 1 ? '1 jugador no tenía' : otroAño + ' jugadores no tenían'} licencia en vigor en la fecha del torneo: se ha puesto la más reciente que consta.`);
    out.avisos.push('ℹ El PDF no dice si hubo retiradas ni sustituciones. Si las hubo, apúntalas en el Excel del ranking después de pegar (columnas G a L).');
    if (!out.pendientes.length && !out.errores.length) { out.filas = filas; out.tsv = filas.map((f) => f.map((v) => (v === null ? '' : String(v))).join('\t')).join('\n'); }
    return out;
  }

  /* Exportación a Excel de Access (clasifaccess.js): las licencias vienen en el archivo, así que no se busca por nombre a quien ya trae la suya.
     Si hay Excel del ranking (indice), se comprueba que cada licencia FVD exista en él y que el nombre sea el de esa licencia; esos avisos (⚠) no
     paran el bloque, porque la hoja Resultados del ranking vuelve a comprobarlo todo. Sin indice, el bloque sale con un aviso de que no se ha comprobado.
     Doble licencia (regla del árbitro): quien en el archivo no trae licencia 46/ (vacía u otra provincia, sobre todo Albacete) puede tener también
     licencia de Valencia. Se busca por nombre en el Excel del ranking: si hay candidatos con licencia FVD vigente el día del torneo, queda pendiente
     como «doble» para que el árbitro confirme (un candidato) o elija (varios); sin candidatos, o con una licencia que no estaba en vigor, va como NO.
     decisiones: { 'A:5:1': 'J0003' | 'NO' }, con la clave grupo:Nº de pareja:jugador (1 o 2). */
  function armarAccess(r, indice, decisiones) {
    const out = { filas: [], pendientes: [], resueltos: [], avisos: [], errores: [], tsv: '', cuentas: { parejas: 0, jugadores: 0, fvd: 0, noFederados: 0, sinComprobar: 0, dobles: 0 } };
    const c = out.cuentas, dec = decisiones || {}, fecha = r.datos && r.datos.fecha;
    const porLic = new Map(), porCodigo = new Map();
    if (indice) for (const j of indice.jugadores) { porCodigo.set(j.codigo, j); for (const l of j.lics) if (typeof l.lic === 'number') (porLic.get(l.lic) || porLic.set(l.lic, []).get(l.lic)).push(j); }
    const vigente = (j) => { const l = licenciaEn(j, fecha); return typeof l.lic === 'number' && !l.otroAño ? l.lic : null; };
    const faltan = [], distintos = [], usadas = new Map(), pendientes = [], filas = [];
    let ficticia = false;
    for (const g of ['A', 'B']) {
      for (const x of r.grupos[g]) {
        c.parejas++;
        if (esFicticia(x)) { c.jugadores += 2; ficticia = true; filas.push([g, x.puesto, 'NO', x.nombres[0], 'NO', x.nombres[1], null, null, null, null, null, null]); continue; }
        const celdas = [x.lic1, x.lic2].map((lic, i) => {
          c.jugadores++;
          const texto = x.nombres[i], clave = `${g}:${x.num}:${i + 1}`, d = dec[clave];
          if (lic === 'NO') {
            if (!indice || d === 'NO') { c.noFederados++; return ['NO', texto]; }
            const jug = d && porCodigo.get(d) && vigente(porCodigo.get(d)) !== null ? porCodigo.get(d) : null;
            if (jug) { c.dobles++; c.fvd++; return [vigente(jug), `${jug.nombre} ${jug.ap1}`, 'doble']; }
            const cand = buscar(texto, indice).candidatos.filter((j) => vigente(j) !== null);
            if (!cand.length) { c.noFederados++; return ['NO', texto]; }
            pendientes.push({ clave, grupo: g, puesto: x.puesto, num: x.num, quien: i + 1, texto, estado: 'doble', candidatos: cand, sugerencias: [] });
            return [null, null];
          }
          c.fvd++;
          if (!indice) { c.sinComprobar++; return [lic, texto]; }
          const dueños = porLic.get(lic);
          if (!dueños) faltan.push(`pareja ${x.num} (${lic})`);
          else if (!dueños.some((j) => buscar(texto, { jugadores: [j] }).estado === 'unico')) distintos.push(`Pareja ${x.num}, jugador ${i + 1}: el archivo dice «${texto}» y la licencia ${lic} es de «${`${dueños[0].nombre} ${dueños[0].ap1} ${dueños[0].ap2}`.trim()}», que no coincide. ¿Es la licencia correcta?`);
          return [lic, texto];
        });
        for (const [lic] of celdas) if (typeof lic === 'number') { if (usadas.has(lic)) out.errores.push(`✖ La licencia ${lic} sale dos veces en el torneo: pareja ${usadas.get(lic)} y pareja ${x.num}. Mira el archivo.`); else usadas.set(lic, x.num); }
        filas.push([g, x.puesto, celdas[0][0], celdas[0][1], celdas[1][0], celdas[1][1], null, null, null, null, null, null]);
      }
    }
    out.pendientes = pendientes;
    if (ficticia) out.avisos.push(AVISO_FICTICIA);
    if (!indice) out.avisos.push(`ℹ ${c.fvd === 1 ? 'No se ha comprobado la licencia' : 'No se han comprobado las ' + c.fvd + ' licencias'} de la FVD contra el Excel del ranking: elígelo en el paso 1b si quieres comprobarlas.`);
    if (faltan.length) out.avisos.push(`⚠ ${faltan.length === 1 ? '1 licencia 46/ no está' : faltan.length + ' licencias 46/ no están'} en el Excel del ranking: ${faltan.slice(0, 8).join(', ')}${faltan.length > 8 ? '…' : ''}. El ranking las marcará; mira si falta dar de alta al jugador.`);
    for (const d of distintos.slice(0, 15)) out.avisos.push('⚠ ' + d);
    if (distintos.length > 15) out.avisos.push(`⚠ … y ${distintos.length - 15} nombres más que no coinciden con su licencia.`);
    if (c.dobles) out.avisos.push(`⚠ ${c.dobles === 1 ? '1 jugador puntúa' : c.dobles + ' jugadores puntúan'} con su licencia de Valencia por doble licencia, confirmada por ti: en el archivo no traía la 46/.`);
    if (c.noFederados) out.avisos.push(`ℹ ${c.noFederados === 1 ? '1 jugador sin licencia' : c.noFederados + ' jugadores sin licencia'} de la FVD (vacía o de otra provincia): ${c.noFederados === 1 ? 'va' : 'van'} como NO y no ${c.noFederados === 1 ? 'puntúa' : 'puntúan'}.`);
    out.avisos.push('ℹ El Excel no dice si hubo retiradas ni sustituciones. Si las hubo, apúntalas en el Excel del ranking después de pegar (columnas G a L).');
    if (!pendientes.length && !out.errores.length) { out.filas = filas; out.tsv = filas.map((f) => f.map((v) => (v === null ? '' : String(v))).join('\t')).join('\n'); }
    return out;
  }

  const API = { leerJugadores, buscar, armar, armarAccess, licenciaEn, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.LeerPdf = API;
})(typeof window !== 'undefined' ? window : globalThis);
