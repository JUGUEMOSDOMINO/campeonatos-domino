/* publicar.html · mesa de control: contraseña de la web, lista de campeonatos (web y borradores), «Subir archivo» (reconoce el archivo por lo que lleva dentro,
   dice qué va a hacer y espera confirmación), publicar, ocultar, editar, eliminar y la normativa en PDF. Todo lo que toca GitHub pasa por assets/mesa.js, que cifra
   lo que va a la web. El original que sube el árbitro nunca va a la web: su copia va a programas-domino (privado). Los textos que vienen de un JSON se pintan siempre como texto. */
(function () {
  'use strict';
  const { el, poner, instante, TIPOS, ESTADOS } = window.TuMesa;
  const C = window.Contrato;
  const P = window.Partidas;
  const M = window.Mesa;
  const RK = window.Ranking;
  const RS = window.Resumen, CP = window.ClasifPdf, CA = window.ClasifAccess, LP = window.LeerPdf, AR = window.Archivos;
  // Límites al leer el Excel (el real pesa unos 7 MB; la hoja WEB cabe en 210 filas y 53 columnas).
  const MAX_BYTES_PDF = 10 * 1024 * 1024, MAX_BYTES = 25 * 1024 * 1024, MAX_FILAS = 300, MAX_COLUMNAS = 80;
  const $ = (s) => document.querySelector(s);
  const NOMBRE_REPO = { web: 'la web', borr: 'borradores' };
  const E = { modo: null, rk: null, rs: null, json: null, raw: null, partidas: [], sel: new Set(), aviso: null, omitidas: [], pub: null, vals: [], confirmadas: new Set(), dest: null, indices: { web: null, borr: null }, acceso: { web: null, borr: null }, archivo: '',
  orig: null, tipo: null, prog: null, copia: null, ix: null, ixNombre: '', ixDe: '', ixIntentado: false, dec: {}, titulo: '' };
  const tp = (t) => TIPOS[t] || TIPOS.parejas;

  /* ---------- paso 1: token ---------- */
  function pintarToken(msg, malo) {
    const t = M.token.obtener();
    if (t) {
      poner($('#token-estado'),
        el('p', null, 'Hay un token guardado en este navegador.'),
        msg ? el('p', { class: 'nota' + (malo ? ' caja' : '') }, msg) : null,
        el('div', { class: 'acciones' },
          el('button', { type: 'button', class: 'boton sec', onclick: () => { M.token.borrar(); pintarToken(); cargarTorneos(); } }, 'Quitar el token')));
      return;
    }
    const campo = el('input', { type: 'password', id: 'token', autocomplete: 'off', 'aria-label': 'Token de GitHub', placeholder: 'Pega aquí el token de GitHub' });
    const nota = el('p', { class: 'nota' + (malo ? ' caja' : ''), 'aria-live': 'polite' }, msg || '');
    const boton = el('button', { type: 'button', class: 'boton' }, 'Guardar y comprobar');
    boton.addEventListener('click', async () => {
      const v = campo.value.trim();
      if (!v) { nota.textContent = 'Pega primero el token.'; return; }
      boton.disabled = true; nota.textContent = 'Comprobando…';
      M.token.usar(v);
      try {
        const web = await M.acceso('web');
        if (!web.ok) { M.token.borrar(); boton.disabled = false; nota.textContent = web.msg; nota.className = 'nota caja'; return; }
        const borr = await M.acceso('borr'), prog = await M.acceso('prog');
        const guardado = M.token.guardar(v);
        const faltan = [borr.ok ? null : 'campeonatos-borradores', prog.ok ? null : 'programas-domino'].filter(Boolean);
        pintarToken((guardado ? 'Token comprobado y guardado.' : 'El navegador no deja guardar el token (¿ventana privada?). Se usará solo hasta que cierres esta pestaña.') + (faltan.length ? ` Ojo: este token no tiene acceso a ${faltan.join(' ni a ')}. En GitHub, edítalo y añádelo en «Repository access»; mientras tanto, la parte de la página que lo usa no funcionará.` : ''), !guardado || faltan.length > 0);
        cargarTorneos();
      } catch (e) { M.token.borrar(); boton.disabled = false; nota.textContent = e.message; nota.className = 'nota caja'; }
    });
    poner($('#token-estado'),
      el('p', null, 'La primera vez hace falta un token de GitHub con acceso a tres repositorios: campeonatos-domino, campeonatos-borradores y programas-domino (las copias privadas y la sección «Archivos»). En los tres, el permiso «Contents: Read and write», y a nada más. Pégalo aquí. No lo escribas en ningún chat ni correo.'),
      campo, el('div', { class: 'acciones' }, boton), nota);
  }

  /* Un fallo 401 ya ha borrado el token: se vuelve al paso 1. Devuelve true si era un 401. */
  function siCaduco(e) {
    if (e && e.estado === 401) { pintarToken(e.message, true); limpiarListas(); return true; }
    return false;
  }

  /* ---------- paso 2: contraseña de la web ---------- */
  const btn = (txt, fn, principal) => el('button', { type: 'button', class: principal ? 'boton' : 'boton sec', onclick: fn }, txt);
  const salidaClave = () => ({ pre: $('#registro-clave'), acc: $('#reintento-clave') });
  async function pintarClave() {
    const caja = $('#clave-estado');
    if (!M.token.obtener()) { poner(caja, el('p', { class: 'nota' }, 'Pega primero el token en el paso 1.')); return; }
    let st;
    try { st = await M.estadoClave(); } catch (e) { if (!siCaduco(e)) poner(caja, el('p', { class: 'nota caja' }, e.message)); return; }
    if (st.pendiente) {
      poner(caja, el('p', { class: 'nota caja' }, 'Hay un cambio de contraseña a medias: parte de la web ya está cifrada con la contraseña nueva y parte con la de antes. Termínalo antes de hacer nada más.'),
        el('div', { class: 'acciones' }, btn('Terminar el cambio', terminarCambio, true)));
    } else if (!st.hay) {
      poner(caja, el('p', null, 'La web todavía no tiene contraseña. Mientras no la tenga, lo publicado va sin cifrar y cualquiera puede leerlo.'),
        el('div', { class: 'acciones' }, btn('Establecer la contraseña', () => panelContrasena(false), true)));
    } else if (!st.abierta) {
      const campo = el('input', { type: 'password', id: 'clave-web', autocomplete: 'current-password', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Contraseña de la web' });
      const recordar = el('input', { type: 'checkbox', id: 'recordar-web', checked: true });
      const msg = el('p', { id: 'clave-web-msg', class: 'nota', 'aria-live': 'polite' });
      const abrir = btn('Abrir', async () => {
        abrir.disabled = true; msg.className = 'nota'; msg.textContent = 'Comprobando…';
        if (await M.abrirClave(campo.value.trim(), recordar.checked)) { await cargarTorneos(); return; }
        abrir.disabled = false; msg.className = 'nota caja'; msg.textContent = 'Esa contraseña no es la correcta. Revísala y vuelve a probar.';
      }, true);
      campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') abrir.click(); });
      poner(caja, el('p', null, st.cambio ? 'La contraseña de la web ha cambiado desde otro sitio. Escribe la nueva.' : 'Escribe la contraseña de la web. Sin ella, esta página no puede leer ni publicar nada en la web.'),
        campo, el('label', { class: 'opcion' }, recordar, el('span', null, 'Recordar en este dispositivo')), el('div', { class: 'acciones' }, abrir), msg);
    } else {
      poner(caja, el('p', null, 'La contraseña de la web está guardada en este navegador.'),
        el('div', { class: 'acciones' },
          btn('Cambiar la contraseña', () => panelContrasena(true)),
          btn('Cifrar lo publicado', cifrarPublicado),
          btn('Olvidar contraseña en este dispositivo', () => { M.olvidarClave(); poner($('#panel-clave')); cargarTorneos(); })));
    }
  }
  // Establecer (primera vez) o cambiar: propone una frase de 5 palabras; vale otra de 14 caracteres o más.
  function panelContrasena(cambio) {
    const panel = $('#panel-clave');
    const campo = el('textarea', { id: 'nueva-clave', class: 'frase', rows: 2, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' }, Cifra.frase()); // textarea: la frase se lee entera en cualquier pantalla
    const apuntada = el('input', { type: 'checkbox', id: 'apuntada' });
    const nota = el('p', { class: 'nota', 'aria-live': 'polite' });
    const si = el('button', { type: 'button', class: 'boton', disabled: true }, 'Cifrar con esta contraseña');
    const revisar = () => {
      if (/\n/.test(campo.value)) campo.value = campo.value.replace(/\s*\n\s*/g, ' '); // una contraseña no lleva saltos de línea
      const valida = Cifra.contrasenaValida(campo.value);
      si.disabled = !valida || !apuntada.checked;
      nota.className = valida ? 'nota' : 'nota caja';
      nota.textContent = valida ? '' : 'Tiene que tener 14 caracteres o más, sin espacios al principio ni al final.';
    };
    campo.addEventListener('input', revisar); apuntada.addEventListener('change', revisar);
    si.addEventListener('click', async () => {
      si.disabled = true; nota.className = 'nota'; nota.textContent = 'Preparando la clave…';
      try {
        const nueva = await Cifra.crearClaveJson(campo.value);
        await M.empezarCambio(nueva);
        const plan = await M.planRecifrar(nueva);
        poner(panel);
        await correr(plan.pasos, salidaClave(), cambio ? 'Contraseña cambiada. Quien tenga guardada la de antes tendrá que escribir la nueva.' : 'Contraseña puesta. Todo lo publicado va cifrado: ya puedes dársela a los jugadores.', cargarTorneos);
      } catch (e) { if (!siCaduco(e)) { nota.className = 'nota caja'; nota.textContent = e.message; si.disabled = false; } }
    });
    poner(panel, el('div', { class: 'aviso-accion' },
      el('p', null, el('b', null, cambio ? 'Cambiar la contraseña de la web' : 'Establecer la contraseña de la web')),
      el('p', null, 'Es la contraseña que darás a los jugadores. Te propongo una frase de cinco palabras sacadas al azar, fácil de dictar y muy difícil de adivinar. Si prefieres otra, escríbela: tiene que tener 14 caracteres o más.'),
      cambio ? el('p', null, 'Al cambiarla se vuelve a cifrar todo lo publicado. Quien tenga guardada la de antes tendrá que escribir la nueva.') : el('p', null, 'Se cifra todo lo que hay ahora en la web. Hasta que termine, la web dice a los visitantes que se está preparando.'),
      el('p', null, 'Apúntala en un sitio seguro antes de seguir. La web no la guarda en ninguna parte y no se puede recuperar.')),
    el('div', { class: 'campo' }, el('label', { for: 'nueva-clave' }, 'Contraseña nueva'), campo),
    el('div', { class: 'acciones sin-margen' }, btn('Proponer otra', () => { campo.value = Cifra.frase(); revisar(); })),
    el('label', { class: 'opcion sep-10' }, apuntada, el('span', null, 'La he apuntado en un sitio seguro')),
    nota, el('div', { class: 'acciones' }, si, btn('Cancelar', () => poner(panel))));
  }
  async function terminarCambio() {
    const estreno = !M.claveJson;
    try {
      const plan = await M.planRecifrar(M.pendiente);
      await correr(plan.pasos, salidaClave(), estreno ? 'Contraseña puesta. Todo lo publicado va cifrado.' : 'Contraseña cambiada. Quien tenga guardada la de antes tendrá que escribir la nueva.', cargarTorneos);
    } catch (e) { if (!siCaduco(e)) { const s = salidaClave(); s.pre.hidden = false; s.pre.textContent = '✖ ' + e.message; } }
  }
  async function cifrarPublicado() {
    try { const plan = await M.planCifrarPublicado(); await correr(plan.pasos, salidaClave(), 'Todo lo publicado está cifrado.', cargarTorneos); }
    catch (e) { if (!siCaduco(e)) { const s = salidaClave(); s.pre.hidden = false; s.pre.textContent = '✖ ' + e.message; } }
  }

  /* ---------- paso 3: lista de campeonatos ---------- */
  const marcarListo = (id) => { $(id).dataset.listo = '1'; };
  function limpiarListas() {
    for (const id of ['#lista-web', '#lista-borr']) { poner($(id), el('p', { class: 'nota' }, 'Pega el token en el paso 1 para ver la lista.')); marcarListo(id); }
    $('#restos').hidden = true;
  }
  async function cargarRepo(clave) {
    const ac = await M.acceso(clave);
    E.acceso[clave] = ac;
    if (!ac.ok) return { estado: 'sinAcceso', msg: ac.msg };
    let ind;
    try { ind = await M.leer(clave, 'datos/indice.json'); } catch (e) { if (e.estado === 401) throw e; return { estado: 'error', msg: e.message }; }
    E.indices[clave] = ind ? ind.json : null;
    let enClaro = !!(ind && ind.enClaro);
    const torneos = await Promise.all(((ind && ind.json.torneos) || []).map(async (entrada) => {
      let publicado = null, normativa = false;
      if (M.ID_OK.test(entrada.id || '')) {
        try { const a = await M.leer(clave, `datos/${entrada.id}/actual.json`); publicado = a && a.json.publicado; enClaro = enClaro || !!(a && a.enClaro); } catch (e) { if (e.estado === 401) throw e; }
        if (clave === 'web') { try { const d = await M.archivosDe('web', entrada.id); normativa = !!(d && d.normativa); } catch (e) { if (e.estado === 401) throw e; } }
      }
      return { entrada, publicado, normativa };
    }));
    return { estado: 'ok', torneos, soloLectura: !ac.push, enClaro };
  }
  async function cargarTorneos() { await pintarClave(); await cargarListas(); }
  async function cargarListas() {
    if (!M.token.obtener()) { limpiarListas(); return; }
    for (const id of ['#lista-web', '#lista-borr']) { delete $(id).dataset.listo; poner($(id), el('p', { class: 'nota' }, 'Cargando…')); }
    E.indices = { web: null, borr: null };
    let res;
    try { res = { web: await cargarRepo('web'), borr: await cargarRepo('borr') }; } catch (e) { if (!siCaduco(e)) { poner($('#estado-mesa'), e.message); } return; }
    pintarLista('web', res.web); pintarLista('borr', res.borr);
    pintarRestos(res.web);
    if (res.web.estado === 'ok' && res.web.enClaro && !res.web.soloLectura && M.claveJson && M.claveAbierta && !M.pendiente && !E.cifradoSolo) await cifrarSolo();
  }
  /* Lo publicado que quedó sin cifrar (de antes de la contraseña, o subido por otro camino) se cifra solo en cuanto la mesa tiene la contraseña abierta.
     Un único intento por fallo: si falla, el registro dice qué falta y «Reintentar» lo termina (no se vuelve a probar en bucle). */
  async function cifrarSolo() {
    E.cifradoSolo = true;
    try {
      const plan = await M.planCifrarPublicado();
      if (await correr(plan.pasos, salidaClave(), 'Lo que estaba sin cifrar ya está cifrado.', cargarTorneos)) E.cifradoSolo = false;
    } catch (e) { if (!siCaduco(e)) { const s = salidaClave(); s.pre.hidden = false; s.pre.textContent = '✖ ' + e.message; } }
  }
  function pintarLista(clave, r) {
    const caja = $(clave === 'web' ? '#lista-web' : '#lista-borr');
    if (r.estado === 'sinAcceso') poner(caja, el('p', { class: 'nota caja' }, r.msg));
    else if (r.estado === 'error') poner(caja, el('p', { class: 'nota caja' }, r.msg));
    else {
      poner(caja,
        r.soloLectura ? el('p', { class: 'nota caja' }, 'Este token solo puede leer ' + M.REPOS[clave] + '. Para escribir hace falta el permiso «Contents: Read and write».') : null,
        r.enClaro ? el('p', { class: 'nota caja' }, M.claveJson ? (M.claveAbierta ? 'Hay archivos de la web sin cifrar. La mesa los cifra sola; si no lo consigue, pulsa «Cifrar lo publicado» en el paso 2.' : 'Hay archivos de la web sin cifrar. Escribe la contraseña en el paso 2 y se cifran solos.') : 'La web todavía no tiene contraseña y lo publicado está sin cifrar: cualquiera puede leerlo. Establece la contraseña en el paso 2.') : null,
        r.torneos.length ? el('ul', { class: 'torneos' }, r.torneos.map((t) => tarjeta(clave, t))) : el('p', { class: 'vacio' }, clave === 'web' ? 'Todavía no hay campeonatos en la web.' : 'No hay borradores.'));
    }
    marcarListo(clave === 'web' ? '#lista-web' : '#lista-borr');
  }
  async function pintarRestos(web) {
    const caja = $('#restos');
    caja.hidden = true;
    if (web.estado !== 'ok') return;
    let ids = [];
    try { ids = await M.restosWeb(E.indices.web); } catch (e) { return; }
    if (!ids.length) return;
    poner(caja,
      el('p', { class: 'nota caja' }, 'Estas carpetas están en la web pero no salen en la portada. Suele pasar si un ocultar o un eliminar se cortó a medias. Elimínalas para terminar.'),
      el('ul', { class: 'torneos' }, ids.map((id) => tarjetaResto(id))));
    caja.hidden = false;
  }

  function tarjetaResto(id) {
    const panel = el('div', { class: 'panel' });
    const li = el('li', { class: 'torneo resto', 'data-id': id },
      el('h4', { class: 'torneo-nombre' }, id), el('p', { class: 'torneo-info' }, 'Sin entrada en indice.json'),
      el('div', { class: 'acciones' }, el('button', { type: 'button', class: 'boton sec', onclick: () => panelEliminar('web', { id, nombre: id }, panel) }, 'Eliminar')), panel);
    return li;
  }

  function tarjeta(clave, t) {
    const e = t.entrada, tipo = tp(e.tipo), id = e.id;
    const otra = clave === 'web' ? 'borr' : 'web';
    const tambien = (((E.indices[otra] || {}).torneos) || []).some((x) => x.id === id);
    const panel = el('div', { class: 'panel' });
    const ver = el('a', { class: 'boton sec', href: clave === 'web' ? `torneo.html?t=${encodeURIComponent(id)}` : `torneo.html?t=${encodeURIComponent(id)}&borrador=1`, target: '_blank', rel: 'noopener' }, 'Ver');
    const btn = (txt, fn) => el('button', { type: 'button', class: 'boton sec', onclick: fn }, txt);
    const acciones = clave === 'web'
      ? [ver, btn('Editar', () => panelEditar(clave, e, panel)), btn('Subir normativa (PDF)', () => panelNormativa(e, panel)), t.normativa ? btn('Quitar normativa', () => panelQuitarNormativa(e, panel)) : null, btn('Ocultar', () => panelOcultar(e, panel)), btn('Eliminar', () => panelEliminar(clave, e, panel))]
      : [ver, btn('Editar', () => panelEditar(clave, e, panel)), btn('Publicar', () => panelPublicar(e, panel)), btn('Eliminar', () => panelEliminar(clave, e, panel))];
    return el('li', { class: 'torneo', 'data-id': id },
      el('h4', { class: 'torneo-nombre' }, e.nombre || id),
      el('p', { class: 'torneo-info' }, [tipo.nombre, ESTADOS[e.estado] || e.estado, e.temporada && 'Temporada ' + e.temporada, `${tipo.jornada} ${e.jornada_actual} de ${e.n_jornadas}`].filter(Boolean).join(' · ')),
      el('p', { class: 'torneo-info' }, 'Última publicación: ' + (t.publicado ? instante(t.publicado) : 'sin datos'), tambien ? (clave === 'web' ? ' · También hay un borrador' : ' · También está en la web') : '', t.normativa ? ' · Con normativa (PDF)' : ''),
      el('p', { class: 'torneo-info id' }, 'id: ', el('code', null, id)),
      el('div', { class: 'acciones' }, acciones), panel);
  }

  /* ---------- acciones sobre un campeonato ---------- */
  const reg = () => ({ pre: $('#registro-mesa'), acc: $('#reintento-mesa') });
  const cancelar = (panel) => el('button', { type: 'button', class: 'boton sec', onclick: () => poner(panel) }, 'Cancelar');
  const avisoOtros = (otros) => (otros && otros.length ? el('p', { class: 'nota caja' }, `Hay archivos que esta página no copia ni borra (${otros.join(', ')}). Se quedan donde están; si los quieres mover, hazlo a mano.`) : null);

  /* Ejecuta un plan y cuenta qué quedó hecho. Si falla, ofrece repetir solo lo que falta. */
  async function correr(pasos, salida, final, alTerminar, repetido) {
    const { pre, acc } = salida;
    pre.hidden = false; acc.hidden = true; acc.replaceChildren();
    if (!repetido) pre.textContent = '';
    const anota = (txt) => { pre.textContent += txt + '\n'; };
    const r = await M.ejecutar(pasos, (t) => anota('✔ ' + t));
    if (!r.error) { anota('✔ ' + final); if (alTerminar) await alTerminar(); return true; }
    anota('✖ ' + (r.error.message || 'Algo ha fallado.'));
    if (siCaduco(r.error)) { anota('Pega un token nuevo en el paso 1 y vuelve a intentarlo.'); return false; }
    anota(r.hechos.length ? `Quedó hecho: ${r.hechos.join('; ')}.` : 'No se llegó a cambiar nada.');
    anota(`Falta: ${r.pendientes.map((p) => p.txt).join('; ')}.`);
    anota('Pulsa «Reintentar» para hacer solo lo que falta. Si cierras esta página, la lista de campeonatos te enseña cómo quedó cada uno.');
    acc.hidden = false;
    acc.append(el('button', { type: 'button', class: 'boton', onclick: () => correr(r.pendientes, salida, final, alTerminar, true) }, 'Reintentar'));
    return false;
  }

  async function conPlan(panel, hacerPlan, mostrar) {
    poner(panel, el('p', { class: 'nota' }, 'Leyendo los archivos…'));
    try { mostrar(await hacerPlan()); } catch (e) { if (!siCaduco(e)) poner(panel, el('p', { class: 'nota caja' }, e.message), cancelar(panel)); }
  }
  const confirmar = (panel, plan, texto, rotulo, final, alTerminar, extra) => {
    const si = el('button', { type: 'button', class: 'boton', onclick: async () => { si.disabled = true; poner(panel); await correr(plan.pasos, reg(), final, alTerminar || cargarTorneos); } }, rotulo);
    poner(panel, el('div', { class: 'aviso-accion' }, texto), avisoOtros(plan.otros), extra, el('div', { class: 'acciones' }, si, cancelar(panel)));
  };
  const nombreDe = (e) => e.nombre || e.id;

  function panelPublicar(e, panel) {
    conPlan(panel, () => M.planPublicarBorrador(e.id), (plan) => {
      const ya = (((E.indices.web || {}).torneos) || []).some((x) => x.id === e.id);
      confirmar(panel, plan, [
        el('p', null, el('b', null, `Publicar «${nombreDe(e)}» en la web`)),
        el('p', null, `Se copian ${plan.archivos} archivos de campeonatos-borradores a campeonatos-domino y se añade a indice.json. Es un repositorio público: desde ese momento lo ve todo el mundo. El borrador se queda en borradores.`),
        ya ? el('p', null, 'Ya está en la web: lo publicado se sobrescribe con este borrador.') : null,
      ], 'Sí, publicar en la web', 'Publicado. La web lo mostrará en uno o dos minutos.');
    });
  }
  function panelOcultar(e, panel) {
    conPlan(panel, () => M.planOcultar(e.id), (plan) => {
      confirmar(panel, plan, [
        el('p', null, el('b', null, `Ocultar «${nombreDe(e)}»`)),
        el('p', null, `Se copian ${plan.archivos} archivos a campeonatos-borradores, se quita de indice.json y se borran de campeonatos-domino. Deja de verse en la web.`),
        el('p', null, 'Ojo: lo que ya se publicó queda en el historial público de git. Quien sepa buscarlo lo puede ver. Si publicaste un dato por error, ocultar no lo borra del historial.'),
        plan.normativa ? el('p', null, 'La normativa (PDF) se quita de la web. Si vuelves a publicar este campeonato, súbela otra vez.') : null,
      ], 'Sí, ocultar', 'Ocultado. Ya está en borradores y fuera de la web.');
    });
  }
  function panelEliminar(clave, e, panel) {
    const id = e.id;
    conPlan(panel, () => M.planEliminar(clave, id), (plan) => {
      const campo = el('input', { type: 'text', 'aria-label': 'Escribe el id para confirmar', autocomplete: 'off', placeholder: id });
      const si = el('button', { type: 'button', class: 'boton', disabled: true }, 'Eliminar para siempre');
      campo.addEventListener('input', () => { si.disabled = campo.value !== id; });
      si.addEventListener('click', async () => { if (campo.value !== id) return; si.disabled = true; poner(panel); await correr(plan.pasos, reg(), 'Eliminado.', cargarTorneos); });
      poner(panel,
        el('div', { class: 'aviso-accion' },
          el('p', null, el('b', null, `Eliminar «${nombreDe(e)}» de ${NOMBRE_REPO[clave]}`)),
          el('p', null, `Se borran ${plan.archivos} archivos y se quita de indice.json. ` + (clave === 'web' ? 'Lo publicado queda en el historial público de git.' : 'Queda en el historial del repositorio privado.')),
          el('p', null, `Para confirmar, escribe el id: `, el('code', null, id))),
        avisoOtros(plan.otros), campo, el('div', { class: 'acciones' }, si, cancelar(panel)));
    });
  }
  function panelNormativa(e, panel) {
    const archivo = el('input', { type: 'file', accept: '.pdf,application/pdf', 'aria-label': 'PDF de la normativa' });
    const nota = el('p', { class: 'nota', 'aria-live': 'polite' });
    const si = el('button', { type: 'button', class: 'boton', disabled: true }, 'Cifrar y subir');
    let plan = null;
    archivo.addEventListener('change', async () => {
      plan = null; si.disabled = true; nota.className = 'nota'; nota.textContent = '';
      const f = archivo.files[0]; if (!f) return;
      try { plan = M.planNormativa(e.id, new Uint8Array(await f.arrayBuffer())); si.disabled = false; nota.textContent = `${f.name} · ${Math.max(1, Math.round(f.size / 1024))} KB`; }
      catch (x) { nota.className = 'nota caja'; nota.textContent = x.message; }
    });
    si.addEventListener('click', async () => { if (!plan) return; si.disabled = true; poner(panel); await correr(plan.pasos, reg(), 'Normativa subida. La web la ofrece en la pestaña Normativa en uno o dos minutos.', cargarTorneos); });
    poner(panel, el('div', { class: 'aviso-accion' },
      el('p', null, el('b', null, `Normativa de «${nombreDe(e)}»`)),
      el('p', null, `Elige el PDF original. Se cifra en este ordenador con la contraseña de la web y se sube como datos/${e.id}/normativa.pdf.cifrado; si ya había una, se sustituye. Los jugadores la descargan desde la pestaña Normativa. Máximo ${M.MAX_PDF / 1048576} MB.`)),
    archivo, nota, el('div', { class: 'acciones' }, si, cancelar(panel)));
  }
  function panelQuitarNormativa(e, panel) {
    confirmar(panel, M.planQuitarNormativa(e.id), [el('p', null, el('b', null, `Quitar la normativa de «${nombreDe(e)}»`)), el('p', null, 'Se borra de la web. El PDF que tengas en tu ordenador no se toca.')],
      'Sí, quitar la normativa', 'Normativa quitada.');
  }
  function panelEditar(clave, e, panel) {
    const nombre = el('textarea', { id: 'ed-nombre', rows: 3, maxlength: 120 }, e.nombre || ''); // textarea: un nombre largo se parte en líneas y se ve entero
    const temporada = el('input', { type: 'text', id: 'ed-temporada', value: e.temporada || '', maxlength: 9, placeholder: '2026-2027' });
    const estado = el('select', { id: 'ed-estado' }, ['en_juego', 'proximo', 'terminado'].map((v) => el('option', { value: v, selected: v === e.estado }, ESTADOS[v])));
    const orden = el('input', { type: 'number', id: 'ed-orden', min: 1, max: 999, value: C.posicionEnGrupo(E.indices[clave], e.id) || 1 });
    const nota = el('p', { class: 'nota', 'aria-live': 'polite' });
    const guardar = el('button', { type: 'button', class: 'boton' }, 'Guardar cambios');
    guardar.addEventListener('click', async () => {
      const c = { nombre: nombre.value, temporada: temporada.value, estado: estado.value, orden: parseInt(orden.value, 10) };
      const fallo = M.validarEdicion(c);
      if (fallo) { nota.textContent = fallo; nota.className = 'nota caja'; return; }
      guardar.disabled = true; nota.textContent = 'Leyendo…';
      try { const plan = await M.planEditar(clave, e.id, c); poner(panel); await correr(plan.pasos, reg(), 'Guardado.', cargarTorneos); } catch (x) { guardar.disabled = false; if (!siCaduco(x)) { nota.textContent = x.message; nota.className = 'nota caja'; } }
    });
    const campo = (rotulo, input, id) => el('div', { class: 'campo' }, el('label', { for: id }, rotulo), input);
    poner(panel, el('div', { class: 'aviso-accion' },
      el('p', null, el('b', null, 'Editar los datos visibles')),
      el('p', null, 'Cambia el nombre, la temporada y el estado en actual.json y en indice.json, y el puesto en la portada (dentro de los campeonatos con el mismo estado). Las jornadas ya publicadas conservan el nombre que tenían.'),
      el('p', null, el('b', null, 'Ojo: '), 'la próxima vez que publiques este campeonato desde el Excel, se sobrescriben el nombre, la temporada y el estado con lo que diga la hoja INICIO. Para que el cambio dure, cámbialo también allí. El puesto en la portada se conserva.')),
    campo('Nombre', nombre, 'ed-nombre'), campo('Temporada', temporada, 'ed-temporada'), campo('Estado', estado, 'ed-estado'), campo('Puesto en la portada (1 es el primero)', orden, 'ed-orden'),
    nota, el('div', { class: 'acciones' }, guardar, cancelar(panel)));
  }

  /* ---------- paso 4: Subir archivo ---------- */
  const esZip = (u) => u.length > 4 && u[0] === 0x50 && u[1] === 0x4b && u[2] === 3 && u[3] === 4;        // un .xlsx es un zip
  const esPdfBytes = (u) => u.length > 4 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46;
  const LEER = { cellFormula: false, cellHTML: false, cellStyles: false, cellNF: false };
  const CARPETA_COPIA = { campeonato: 'Torneos', hoja: 'Torneos', access: 'Torneos', pdf: 'Torneos', ranking: 'Ranking FVD' };
  const NOMBRE_TIPO = { campeonato: 'Excel del campeonato', ranking: 'Excel del ranking', hoja: 'Hoja de resumen', access: 'Excel de Access', pdf: 'PDF de la clasificación' };
  const refrescarArchivos = () => { if (AR && AR.refrescar) AR.refrescar(); };

  // Vuelve al principio: nada leído, nada que confirmar. (Lo que hay en el campo de archivo lo limpia quien llama.)
  function reiniciar() {
    Object.assign(E, { modo: null, rk: null, rs: null, json: null, raw: null, partidas: [], sel: new Set(), aviso: null, omitidas: [], pub: null, vals: [], confirmadas: new Set(),
      dest: null, orig: null, tipo: null, copia: null, dec: {}, titulo: '' });
    for (const id of ['#paso-revision', '#paso-publicar', '#registro', '#reintento', '#resultado']) $(id).hidden = true;
    poner($('#copia'));
  }

  // Qué es el archivo, por lo que lleva dentro y no por su nombre: { tipo: campeonato | ranking | hoja | access | pdf | otro | error, … }.
  async function reconocer(bytes) {
    if (esPdfBytes(bytes)) {
      if (bytes.length > MAX_BYTES_PDF) return { tipo: 'otro', motivo: `Es un PDF de ${Math.round(bytes.length / 1048576)} MB: demasiado para ser una clasificación.` };
      let rs;
      try { rs = await CP.leerPdf(bytes.slice(), await cargarPdfjs()); } catch (e) { return { tipo: 'error', motivo: /PDF/.test(e.message) ? e.message : 'No se ha podido leer ese PDF.' }; }
      return rs.grupos.A.length || rs.grupos.B.length ? { tipo: 'pdf', rs } : { tipo: 'otro' };      // sin filas de clasificación, es otro PDF
    }
    if (!esZip(bytes)) return { tipo: 'otro' };
    let hojas;
    try { hojas = XLSX.read(bytes, { type: 'array', bookSheets: true }).SheetNames; } catch (e) { return { tipo: 'otro' }; }
    E.hojas = hojas;
    try {
      if (CA.es({ SheetNames: hojas })) return { tipo: 'access', rs: CA.leer(XLSX.read(bytes, { type: 'array', ...LEER }), XLSX) };
      if (RS.es({ SheetNames: hojas })) return { tipo: 'hoja', wb: XLSX.read(bytes, { type: 'array', ...LEER }) };
      if (!hojas.includes('WEB')) return { tipo: 'otro' };
      const wb = XLSX.read(bytes, { type: 'array', sheets: 'WEB', ...LEER }), ws = wb.Sheets && wb.Sheets.WEB;
      if (!ws) return { tipo: 'otro' };
      const rg = XLSX.utils.decode_range(ws['!ref'] || 'A1'), esRanking = RK.es(ws);     // el del ranking tiene una fila por jugador: hasta la 603
      if (rg.e.r + 1 > (esRanking ? RK.FILA_MAX + 5 : MAX_FILAS) || rg.e.c + 1 > MAX_COLUMNAS) return { tipo: 'error', motivo: 'La hoja WEB es mucho más grande de lo normal. ¿Es el Excel del campeonato?' };
      return { tipo: esRanking ? 'ranking' : 'campeonato', ws, wb };
    } catch (e) { return { tipo: 'error', motivo: 'No se ha podido leer ese archivo. ¿Está dañado o es de otro programa?' }; }
  }

  async function alElegirArchivo(ev) {
    const f = ev.target.files[0];
    ev.target.value = ''; // así se puede volver a elegir el mismo archivo tras guardarlo de nuevo
    reiniciar();
    if (!f) { poner($('#lectura')); return; }
    const aviso = (t) => poner($('#lectura'), el('p', { class: 'nota caja' }, t));
    if (f.size > MAX_BYTES) { aviso(`Ese archivo pesa ${Math.round(f.size / 1048576)} MB y es demasiado grande (el máximo son ${MAX_BYTES / 1048576} MB).`); return; }
    if (!M.token.obtener()) { aviso('Primero pega el token de GitHub en el paso 1.'); return; }
    poner($('#lectura'), el('p', { class: 'nota' }, 'Mirando qué archivo es…'));
    const bytes = new Uint8Array(await f.arrayBuffer());
    E.archivo = f.name; E.orig = { nombre: f.name, bytes }; E.hojas = [];
    try { E.prog = await M.acceso('prog'); } catch (e) { if (siCaduco(e)) return; E.prog = { ok: false }; }
    const r = await reconocer(bytes);
    E.tipo = r.tipo;
    if (r.tipo === 'campeonato') await revisar(r.ws, r.wb, bytes.buffer);
    else if (r.tipo === 'ranking') await revisarRanking(r.ws);
    else if (r.tipo === 'hoja') await revisarResumen(r.wb);
    else if (r.tipo === 'access' || r.tipo === 'pdf') await revisarResumen(null, r.rs);
    else await ofrecerGuardar(r.tipo === 'error' ? `No he podido reconocerlo: ${r.motivo}` : r.motivo ? `No es un archivo que la mesa publique. ${r.motivo}` : 'No es un archivo que la mesa publique: no es un Excel de campeonato ni del ranking, ni una Hoja de resumen, ni lo que sale de Access, ni el PDF «Clasificación Partida».');
  }
  function cancelarSubida() {
    reiniciar();
    poner($('#lectura'), el('p', { class: 'nota' }, 'Cancelado. No se ha subido ni guardado nada.'));
    $('#archivo').focus();
  }

  /* ---------- la copia del original en programas-domino ---------- */
  const motivoSinCopia = () => (!E.prog || !E.prog.ok ? 'el token no llega a programas-domino (hay que añadirlo en «Repository access»).'
    : !E.prog.push ? 'el token solo puede leer programas-domino (falta «Contents: Read and write»).'
      : !AR.nombreValido(E.orig.nombre) ? 'el nombre del archivo no vale (más de 100 letras, o lleva barras, dos puntos, comillas, «?», «#» o «%», o empieza por un punto).' : '');
  // Monta los campos de la copia. `guardar`: el archivo no se publica, solo se guarda, y hay que elegir categoría y escribir qué es.
  async function montarCopia(guardar, propuesta, sugerida) {
    const c = E.copia = { motivo: motivoSinCopia(), categoria: guardar ? (sugerida ? sugerida.categoria : '') : CARPETA_COPIA[E.tipo], existe: false, guardar };
    const nota = el('p', { class: 'nota sin-margen', id: 'copia-nota', 'aria-live': 'polite' });
    const desc = el('textarea', { id: 'subir-desc', rows: 2, maxlength: 200, autocomplete: 'off' }, AR.limpiarDescripcion(sugerida ? sugerida.descripcion : propuesta || '').slice(0, 200));
    const cat = el('select', { id: 'subir-cat' }, [el('option', { value: '' }, 'Elige una categoría'), ...AR.CATEGORIAS_SUBIR.map((x) => el('option', { value: x }, x))]);
    const pisar = el('input', { type: 'checkbox', id: 'subir-pisar' });
    const cajaPisar = el('label', { class: 'casilla-pisar', id: 'subir-pisar-caja', hidden: true }, pisar, el('span', null, 'Ya hay un archivo con ese nombre en esa categoría: sustituirlo'));
    const aviso = () => {
      const ruta = c.categoria ? M.rutaCopia(c.categoria, E.orig.nombre) : '';
      nota.className = 'nota sin-margen' + (c.motivo ? ' caja' : '');
      nota.textContent = c.motivo ? (guardar ? 'No se puede guardar: ' : 'No se guardará copia del original: ') + c.motivo
        : guardar ? (c.categoria ? `Se guarda en programas-domino (privado), en entregables/${ruta}.` : '')
          : `Se guarda una copia del original en programas-domino (privado), en entregables/${ruta}.` + (c.existe ? ' Sustituye a la que ya hay.' : '');
      cajaPisar.hidden = !(guardar && c.existe);
      actualizarBoton();
    };
    if (sugerida) cat.value = sugerida.categoria;
    c.aviso = aviso; c.campos = { desc, cat, pisar };
    const buscar = async () => {
      c.existe = false;
      if (c.categoria && !c.motivo) { try { c.existe = !!(await M.shaEntregable(M.rutaCopia(c.categoria, E.orig.nombre))); } catch (e) { if (siCaduco(e)) return; } }
      aviso();
    };
    desc.addEventListener('input', actualizarBoton); pisar.addEventListener('change', actualizarBoton);
    cat.addEventListener('change', () => { c.categoria = cat.value; c.existe = false; pisar.checked = false; aviso(); buscar(); });
    poner($('#copia'), nota,
      !c.motivo || guardar ? el('label', { for: 'subir-desc', class: 'etiqueta-campo' }, guardar ? 'Qué es (obligatorio)' : 'Descripción de la copia (se puede cambiar)') : null, !c.motivo || guardar ? desc : null,
      guardar && !c.motivo ? [el('label', { for: 'subir-cat', class: 'etiqueta-campo' }, 'Categoría (obligatoria)'), cat, cajaPisar] : null,
      guardar && !c.motivo && sugerida ? el('p', { class: 'nota sin-margen', id: 'sugerido' }, 'Categoría y descripción sugeridas por la mesa, a partir de lo que lleva el archivo. Cámbialas si no es así.') : null);
    await buscar();
  }
  // ¿Se puede hacer la copia (o el guardado) tal como está el formulario? Devuelve el motivo de que no, o ''.
  function faltaDeCopia() {
    const c = E.copia;
    if (!c) return '';
    if (c.guardar) {
      if (c.motivo) return c.motivo;
      if (!AR.CATEGORIAS_SUBIR.includes(c.categoria)) return 'Elige la categoría del archivo: es obligatoria.';
      if (!AR.descripcionValida(c.campos.desc.value)) return 'Escribe qué es el archivo: la descripción es obligatoria.';
      if (c.existe && !c.campos.pisar.checked) return 'Ya hay un archivo con ese nombre en esa categoría. Marca la casilla si quieres sustituirlo.';
      return '';
    }
    return !c.motivo && !AR.descripcionValida(c.campos.desc.value) ? 'Escribe una descripción para la copia del original.' : '';
  }
  const pasosCopia = () => (E.copia && !E.copia.motivo && E.copia.categoria ? M.planCopia(E.orig.bytes, E.orig.nombre, E.copia.categoria, E.copia.campos.desc.value) : { pasos: [], ruta: '' });
  const conCopia = (final) => (E.copia && !E.copia.motivo && E.copia.categoria ? `${final} Copia del original guardada en programas-domino (entregables/${M.rutaCopia(E.copia.categoria, E.orig.nombre)}).` : final);
  const propuestaDe = (que) => `${que} de «${E.titulo || E.orig.nombre}».`;

  // La frase de antes de actuar: qué ha reconocido y qué va a hacer.
  const QUE = { campeonato: () => `un Excel de campeonato ${({ sp: 'del Súper Prestigio', parejas: 'de parejas', individual: 'individual' })[E.json.torneo.tipo] || ''}`.trim(), ranking: () => 'el Excel del ranking', hoja: () => 'la Hoja de resumen de un organizador',
    access: () => 'el Excel de Access (el que exporta la clasificación)', pdf: () => 'el PDF «Clasificación Partida»' };
  function frase() {
    const c = E.copia, bloque = ['hoja', 'access', 'pdf'].includes(E.tipo), hayCopia = c && !c.motivo && c.categoria;
    const que = E.titulo ? `${QUE[E.tipo]()}: «${E.titulo}»` : QUE[E.tipo]();
    const hace = E.dest === 'web' ? 'Voy a publicarlo en la web, cifrado' : E.dest === 'borr' ? 'Voy a guardarlo como borrador (privado)' : 'Elige abajo dónde guardarlo';
    const dest = hayCopia ? M.rutaCopia(c.categoria, E.orig.nombre).replace(/[^/]+$/, '') : '';
    return `He reconocido ${que}. ${hace}${hayCopia ? ` y a guardar una copia del original en programas-domino (entregables/${dest})` : ''}${bloque ? ' y a dejar listo el bloque para copiar al ranking' : ''}.`
      + (c && c.motivo ? ` No guardaré copia del original: ${c.motivo}` : '');
  }
  const pintarFrase = (extra) => poner($('#lectura'), el('p', { class: 'nota' }, frase() + (extra ? ' ' + extra : '')));

  // Archivos de siempre (estandarizados): si se reconocen por lo que llevan dentro (o, en último caso, por su nombre), la categoría y la descripción salen puestas
  // como sugeridas. Siempre se pueden cambiar. Devuelve { categoria, descripcion } o null.
  function sugerir() {
    const nombre = E.orig.nombre, n = nombre.toLowerCase(), hojas = E.hojas || [], tiene = (...hs) => hs.every((h) => hojas.includes(h));
    const cabeza = esZip(E.orig.bytes) || esPdfBytes(E.orig.bytes) ? '' : new TextDecoder().decode(E.orig.bytes.subarray(0, 20000));
    if (CARPETA_COPIA[E.tipo]) {   // un archivo de un tipo conocido pero con errores
      const vacia = E.tipo === 'hoja' && E.rs && !E.rs.grupos.A.length && !E.rs.grupos.B.length;
      return vacia ? { categoria: 'Ranking FVD', descripcion: 'Hoja de resumen vacía, para los organizadores que no usan nuestro programa.' }
        : { categoria: CARPETA_COPIA[E.tipo], descripcion: `${NOMBRE_TIPO[E.tipo]}${E.titulo ? ` de «${E.titulo}»` : ''} con errores: no se publicó.` };
    }
    if (tiene('Jugadores', 'Licencias') && !tiene('WEB')) return { categoria: 'Ranking FVD', descripcion: 'Excel del ranking, sin la hoja para la web.' };
    if (tiene('INICIO', 'PAREJAS') && !tiene('WEB')) return { categoria: 'Programas de campeonato', descripcion: tiene('SUSTITUCIONES') ? 'Programa del Súper Prestigio, sin la hoja para la web.' : 'Programa de parejas, sin la hoja para la web.' };
    if (/Leer un campeonato para el ranking/.test(cabeza)) return { categoria: 'Ranking FVD', descripcion: 'Página que lee un campeonato y deja listo el bloque para el ranking.' };
    if (/^(manual|gu[ií]a)/.test(n)) return { categoria: 'Manuales y guías', descripcion: `Manual o guía: ${nombre.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')}.` };
    if (/normativa/.test(n)) return { categoria: 'Manuales y guías', descripcion: 'Normativa del campeonato.' };
    if (/ranking/.test(n) && /\.pdf$/.test(n)) return { categoria: 'Rankings publicados', descripcion: 'PDF del ranking.' };
    return null;
  }

  // Lo que no se publica (otro archivo, uno que no se reconoce o uno con errores): solo se guarda, con categoría y descripción obligatorias.
  async function ofrecerGuardar(motivo) {
    E.modo = 'guardar'; E.tipo = E.tipo || 'otro';
    poner($('#lectura'), el('p', { class: 'nota' }, motivo + ' No se publica nada. Si quieres, puedo guardarlo en programas-domino (privado): elige su categoría y escribe qué es.'));
    $('#paso-revision').hidden = true;
    await montarCopia(true, '', sugerir());
    $('#paso-publicar').hidden = false;
    actualizarBoton();
  }

  /* Lo que ya hay publicado de este torneo en un repositorio: índice, actual.json y el archivo de cada una de las partidas dadas que ya estén publicadas. */
  async function estadoPublicado(id, clave, ks) {
    const pub = { indice: null, actual: null, existentes: {} };
    const i = await M.leer(clave, 'datos/indice.json'); if (i) pub.indice = i.json;
    if (M.ID_OK.test(id || '')) {
      const a = await M.leer(clave, `datos/${id}/actual.json`); if (a) pub.actual = a.json;
      await Promise.all([...publicadas(pub, id).keys()].filter((k) => ks.includes(k)).map(async (k) => {
        const x = await M.leer(clave, `datos/${id}/jornada_${String(k).padStart(2, '0')}.json`); if (x) pub.existentes[k] = x.json;
      }));
    }
    return pub;
  }
  // Las partidas que la web ya enseña de este torneo: número -> su entrada en la lista de jornadas de actual.json.
  function publicadas(pub, id) {
    const a = pub.actual, m = new Map();
    if (!a || !a.torneo || a.torneo.id !== id) return m;
    for (const x of a.jornadas || []) m.set(x.numero, x);
    if (!m.has(a.jornada.numero)) m.set(a.jornada.numero, { numero: a.jornada.numero, publicado: a.publicado });
    return m;
  }
  const yaPublicada = (k) => publicadas(E.pub, E.json.torneo.id).has(k) || !!E.pub.existentes[k];
  const enWeb = (id) => (((E.indices.web || {}).torneos) || []).some((x) => x.id === id);
  const sinPub0 = { indice: null, actual: null, existentes: {} };
  const unidad = () => (E.json.torneo.tipo === 'sp' ? 'jornada' : 'partida');

  async function revisar(ws, wb, bytes) {
    try {
      E.raw = C.leer(ws);
      E.json = C.construir(E.raw, null);
      E.partidas = [{ k: E.json.jornada.numero, raw: E.raw, json: E.json }]; E.aviso = null; E.omitidas = [];
      if (wb && (wb.SheetNames || []).includes('_WEBC') && Number.isInteger(E.json.torneo.n_jornadas)) {
        poner($('#lectura'), el('p', { class: 'nota' }, `Leyendo las demás ${unidad()}s del Excel…`));
        await new Promise((r) => setTimeout(r, 30)); // deja pintar el aviso antes de la lectura, que tarda unos segundos
        try { const r = P.listar(E.raw, P.leerHojas(XLSX, bytes, wb, E.json.torneo.n_jornadas)); E.partidas = r.partidas; E.aviso = r.aviso; E.omitidas = r.omitidas || []; }
        catch (e) { E.aviso = `No se han podido sacar las demás ${unidad()}s del Excel. Solo se ofrece la que tiene la hoja WEB.`; }
      }
      poner($('#lectura'), el('p', { class: 'nota' }, 'Comprobando lo que ya está publicado…'));
      // el destino por defecto sale de lo que hay: Web si el torneo ya está en la web, Borrador si es nuevo
      const web = await M.leer('web', 'datos/indice.json'); E.indices.web = web ? web.json : null;
      E.acceso.borr = await M.acceso('borr');
      if (E.acceso.borr.ok) { const b = await M.leer('borr', 'datos/indice.json'); E.indices.borr = b ? b.json : null; }
      E.dest = enWeb(E.json.torneo.id) ? 'web' : E.acceso.borr.ok ? 'borr' : null;
      E.pub = E.dest ? await estadoPublicado(E.json.torneo.id, E.dest, E.partidas.map((p) => p.k)) : sinPub0;
    } catch (e) {
      if (e.estado === 401) { pintarToken(e.message, true); $('#paso-revision').hidden = true; $('#paso-publicar').hidden = true; }
      if (e instanceof M.ErrorGH) poner($('#lectura'), el('p', { class: 'nota caja' }, e.message));
      else await ofrecerGuardar('No he podido reconocerlo: esa hoja WEB no se puede leer. Comprueba que es la del campeonato y que el Excel está guardado.');
      return;
    }
    E.titulo = E.json.torneo.nombre || '';
    await montarCopia(false, propuestaDe(NOMBRE_TIPO.campeonato));
    leido();
    nuevaSeleccion();
    pintarRevision();
  }
  const leido = () => { const n = E.partidas.length; pintarFrase(n > 1 ? `Trae ${n} ${unidad()}s con datos.` : ''); };
  // Marcadas de entrada: las que aún no están publicadas y la más reciente.
  function nuevaSeleccion() {
    E.sel = new Set(E.partidas.filter((p) => !yaPublicada(p.k)).map((p) => p.k));
    E.sel.add(Math.max(...E.partidas.map((p) => p.k)));
    E.confirmadas = new Set();
  }
  // Las comprobaciones de cada partida contra lo publicado, contando con las otras que se suben a la vez.
  function validar() {
    const id = E.json.torneo.id;
    for (const p of E.partidas) p.vals = C.validar(p.raw, p.json, { ...E.pub, tambien: [...E.sel].filter((k) => k !== p.k) });
    // avisos del campeonato entero (no de una partida)
    E.avisosTorneo = [];
    if (E.dest === 'borr' && enWeb(id)) E.avisosTorneo.push({ cod: 'M01', gravedad: 'avisa', msg: 'Este campeonato ya está en la web. El borrador es una copia aparte: la web no cambia hasta que lo publiques.' });
    if (E.dest === 'web' && !enWeb(id)) E.avisosTorneo.push({ cod: 'M02', gravedad: 'avisa', msg: 'Este campeonato todavía no está en la web: se publica ahora y lo ve todo el mundo.' });
  }

  /* ---------- paso 4: destino y revisión ---------- */
  function pintarDestino() {
    const sinBorr = !E.acceso.borr || !E.acceso.borr.ok;
    const opcion = (valor, rotulo, ayuda, desactivada) => {
      const r = el('input', { type: 'radio', name: 'destino', value: valor, checked: E.dest === valor, disabled: desactivada });
      r.addEventListener('change', () => cambiarDestino(valor));
      return el('label', { class: 'opcion' }, r, el('span', null, el('b', null, rotulo), ' ', ayuda));
    };
    poner($('#destino'), el('legend', null, 'Dónde guardarlo'),
      opcion('borr', 'Borrador (privado)', 'Solo se ve con el token, en este navegador. Se publica después, cuando quieras.', sinBorr),
      opcion('web', 'Web (pública)', 'Lo ve todo el mundo en la portada, en uno o dos minutos.', false),
      sinBorr ? el('p', { class: 'nota sin-margen' }, 'La opción Borrador no está disponible: ' + (E.acceso.borr && E.acceso.borr.msg)) : null);
  }
  async function cambiarDestino(d) {
    E.dest = d;
    if (E.modo === 'ranking') { pintarFrase(); pintarRanking(); return; }
    if (E.modo === 'resumen') { pintarFrase(); pintarResumen(); return; }
    poner($('#lectura'), el('p', { class: 'nota' }, 'Comprobando lo que ya está publicado…'));
    try { E.pub = await estadoPublicado(E.json.torneo.id, d, E.partidas.map((p) => p.k)); } catch (e) { if (!siCaduco(e)) poner($('#lectura'), el('p', { class: 'nota caja' }, e.message)); return; }
    leido();
    nuevaSeleccion();
    pintarRevision();
  }

  const ETIQ = { bloquea: 'No se puede publicar', confirma: 'Confirma', avisa: 'Aviso' };
  const hayResultado = (m) => m.estado !== 'pendiente' && m.estado !== 'descanso';
  const marcadas = () => E.partidas.filter((p) => E.sel.has(p.k));
  // Lo que hay que avisar de una partida. Las que piden confirmación llevan su casilla (la clave incluye la partida, porque cada una se confirma por separado).
  function listaVals(p) {
    const lista = p.vals.map((x) => {
      if (x.gravedad === 'confirma') {
        const clave = p.k + ':' + x.cod;
        const c = el('input', { type: 'checkbox', checked: E.confirmadas.has(clave) });
        c.addEventListener('change', () => { c.checked ? E.confirmadas.add(clave) : E.confirmadas.delete(clave); actualizarBoton(); });
        return el('li', { class: 'confirma' }, el('label', null, c, el('span', null, el('span', { class: 'cod' }, x.cod), x.msg + ' ', el('b', null, 'Marca la casilla si quieres seguir.'))));
      }
      return el('li', { class: x.gravedad }, el('span', { class: 'cod' }, x.cod), el('b', null, ETIQ[x.gravedad] + ': '), x.msg);
    });
    if (!p.vals.length) lista.push(el('li', { class: 'ok' }, 'Todo en orden: no hay nada que avisar.'));
    return lista;
  }
  // Una casilla por partida con datos: marcarla la sube (o la actualiza si ya está publicada).
  function pintarPartidas() {
    const u = unidad(), U = u[0].toUpperCase() + u.slice(1);
    const filas = E.partidas.map((p) => {
      const marcada = E.sel.has(p.k);
      const c = el('input', { type: 'checkbox', 'data-k': p.k, checked: marcada });
      c.addEventListener('change', () => { c.checked ? E.sel.add(p.k) : E.sel.delete(p.k); repintar(`input[data-k="${p.k}"]`); });
      const conRes = p.json.emparejamientos.filter(hayResultado).length, total = p.json.emparejamientos.filter((m) => m.estado !== 'descanso').length;
      const info = [p.json.jornada.completa ? 'completa' : 'en juego', `${conRes} de ${total} mesas con resultado`].join(' · ');
      return el('li', { class: 'partida' },
        el('label', { class: 'opcion' }, c, el('span', null, el('b', null, `${U} ${p.k}`), ' · ' + info, yaPublicada(p.k) ? el('span', { class: 'ya-publicada' }, ' · ya publicada: se sobrescribirá') : null)),
        marcada ? el('ul', { class: 'vals' }, listaVals(p)) : null);
    });
    return el('fieldset', { class: 'destino', id: 'partidas' }, el('legend', null, `Qué ${u}s subir`), el('ul', { class: 'partidas' }, filas),
      E.aviso ? el('p', { class: 'nota caja sin-margen' }, E.aviso) : null,
      E.omitidas.length ? el('p', { class: 'nota caja sin-margen' }, textoOmitidas(u)) : null);
  }
  const enumerar = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : String(a[0]));
  function textoOmitidas(u) {
    const varias = E.omitidas.length > 1, lista = enumerar(E.omitidas);
    return (varias ? `No se ofrecen las ${u}s ${lista}: tienen` : `No se ofrece la ${u} ${lista}: tiene`) + ' datos que la hoja WEB no trae (una sustitución posterior o un sorteo sin comprobar). '
      + (varias ? 'Para subirlas, pon el número de cada una' : 'Para subirla, pon su número') + ' en WEB_J_MANUAL (hoja INICIO), guarda el Excel y vuelve a elegirlo.';
  }
  // Pinta la lista y la vista previa de la partida más reciente de las marcadas. No toca el registro de la última subida.
  function repintar(enfocar) {
    validar();
    const sel = marcadas(), foco = sel.length ? sel[sel.length - 1] : E.partidas[E.partidas.length - 1];
    const j = foco.json, t = j.torneo, jo = j.jornada;
    const nombreJ = t.tipo === 'sp' ? 'Jornada' : 'Partida';
    const conRes = j.emparejamientos.filter(hayResultado).length;
    const resumen = el('div', { class: 'resumen' },
      cuadro(t.nombre || '—', 'Campeonato'), cuadro(`${jo.numero} de ${t.n_jornadas}`, nombreJ + (jo.completa ? ' (completa)' : ' (en juego)')),
      cuadro(`${conRes} / ${j.emparejamientos.filter((m) => m.estado !== 'descanso').length}`, 'mesas con resultado'), cuadro(t.n_participantes, t.tipo === 'individual' ? 'jugadores' : 'parejas'));
    const torneoVals = E.avisosTorneo;
    const gA = j.clasificacion.filter((r) => r.grupo === 'A').slice(0, 8);
    const byId = new Map(j.participantes.map((p) => [p.id, p]));
    const sp = t.tipo === 'sp';
    const tabla = el('div', { class: 'tabla-caja sep-12' }, el('table', { class: 'clasi' },
      el('caption', { class: 'solo-lector' }, 'Primeros puestos leídos del Excel'),
      el('thead', null, el('tr', null, el('th', null, '#'), el('th', { class: 'izq' }, 'Quién'), el('th', null, 'Gan'), el('th', null, 'Dif.T'))),
      el('tbody', null, gA.map((r) => el('tr', null, el('td', null, r.puesto), el('td', { class: 'pareja' }, el('span', { class: 'nom' }, (byId.get(r.id) || {}).corto || '#' + r.id)), el('td', { class: 'gan' }, r.gan), el('td', null, r.dt == null ? '' : r.dt))))));
    const mesas = el('details', { class: 'sep-10' }, el('summary', null, `Ver las ${j.emparejamientos.length} mesas leídas`),
      el('ul', { class: 'vals' }, j.emparejamientos.map((m) => el('li', null,
        `${m.mesa == null ? 'Descansa' : 'Mesa ' + m.mesa}: ${m.izq.map((i) => (byId.get(i) || {}).corto || i).join(' y ')}${m.dcha.length ? ' contra ' + m.dcha.map((i) => (byId.get(i) || {}).corto || i).join(' y ') : ''}` +
        ` · ${m.estado}${m.p_izq != null ? ' · ' + (sp ? m.p_izq + '-' + m.p_dcha + ' (' + m.t_izq + '-' + m.t_dcha + ')' : m.t_izq + '-' + m.t_dcha) : ''}`))));
    const bloquea = foco.vals.some((x) => x.gravedad === 'bloquea');
    const hayVista = sel.length > 0;
    poner($('#revision'), resumen, torneoVals.length ? el('ul', { class: 'vals' }, torneoVals.map((x) => el('li', { class: x.gravedad }, el('span', { class: 'cod' }, x.cod), el('b', null, ETIQ[x.gravedad] + ': '), x.msg))) : null,
      pintarPartidas(),
      hayVista && !bloquea ? [el('p', { class: 'nota sep-12' }, (E.partidas.length > 1 ? `${nombreJ} ${jo.numero}: ` : '') + (jo.completa ? 'Así leerá la web esta ' + (sp ? 'jornada' : 'partida') + ':' : 'Clasificación provisional leída del Excel. En cuanto haya un resultado, la web la enseña en vivo, con ⏳ en quien aún no ha jugado:')), tabla, mesas] : null);
    $('#paso-revision').hidden = false;
    $('#paso-publicar').hidden = false;
    actualizarBoton();
    if (enfocar) { const x = document.querySelector(enfocar); if (x) x.focus(); }
  }
  function pintarRevision() {
    pintarDestino();
    repintar();
    $('#registro').hidden = true; $('#reintento').hidden = true; $('#resultado').hidden = true;
  }
  const cuadro = (b, s) => el('div', null, el('b', null, b), el('span', null, s));

  function actualizarBoton() {
    $('#guardar-solo').hidden = true;
    if (E.modo === 'guardar') { actualizarBotonGuardar(); return; }
    if (E.modo === 'ranking') { actualizarBotonRanking(); return; }
    if (E.modo === 'resumen') { actualizarBotonResumen(); return; }
    const sel = marcadas();
    const bloquea = sel.some((p) => p.vals.some((x) => x.gravedad === 'bloquea'));
    const falta = sel.some((p) => p.vals.filter((x) => x.gravedad === 'confirma').some((x) => !E.confirmadas.has(p.k + ':' + x.cod)));
    const n = sel.length, u = unidad();
    $('#publicar').textContent = (E.dest === 'borr' ? 'Guardar como borrador' : 'Publicar en la web') + (n > 1 ? ` (${n} ${u}s)` : '');
    $('#guardar-solo').hidden = !bloquea;
    const fc = faltaDeCopia();
    $('#publicar').disabled = !E.dest || !n || bloquea || falta || !!fc;
    $('#pub-nota').textContent = !E.dest ? 'Elige dónde guardarlo.' : !n ? `Marca al menos una ${u}.` : bloquea ? 'Corrige lo que se marca en rojo, guarda el Excel y elígelo otra vez, desmarca esa ' + u + ' o guarda solo el archivo.' : falta ? 'Marca las casillas para poder publicar.' : fc;
  }

  function actualizarBotonGuardar() {
    const falta = faltaDeCopia();
    $('#publicar').textContent = 'Guardar en programas-domino';
    $('#publicar').disabled = !!falta;
    $('#pub-nota').textContent = falta;
  }
  // Solo guardar el original (sin publicar): para lo que no se reconoce, lo que trae errores y lo que no es de ningún tipo que la mesa publique.
  async function guardarSolo() {
    const boton = $('#publicar');
    boton.disabled = true;
    let plan;
    try { plan = pasosCopia(); } catch (e) { $('#pub-nota').textContent = e.message; actualizarBotonGuardar(); return; }
    const ok = await correr(plan.pasos, { pre: $('#registro'), acc: $('#reintento') }, `Guardado en programas-domino (privado), en entregables/${plan.ruta}. Ya sale en la lista de archivos.`, async () => { refrescarArchivos(); });
    if (!ok) boton.disabled = !M.token.obtener();
  }

  /* ---------- paso 5: guardar ---------- */
  // js: las partidas marcadas, de menor a mayor. Cada una escribe su archivo; actual.json e indice.json se escriben una vez, al final.
  function planExcel(clave, js, esReciente) {
    const id = js[0].torneo.id, nn = (j) => String(j.jornada.numero).padStart(2, '0');
    const u = js[0].torneo.tipo === 'sp' ? 'jornada' : 'partida';
    const msg = `${clave === 'web' ? 'Publicar' : 'Borrador'} ${id}: ${js.length > 1 ? u + 's ' : u + ' '}${js.map((j) => j.jornada.numero).join(', ')}`;
    const rActual = `datos/${id}/actual.json`, ultimo = js[js.length - 1];
    const pasos = js.map((j) => ({ txt: `Escribir jornada_${nn(j)}.json`, fn: () => M.poner(clave, `datos/${id}/jornada_${nn(j)}.json`, C.aTexto(j), msg) }));
    if (esReciente) {
      pasos.push({ txt: 'Escribir actual.json', fn: async () => { const a = await M.leer(clave, rActual); await M.poner(clave, rActual, C.aTexto(C.conJornadas(ultimo, C.jornadasNuevas(js, a && a.json))), msg); } });
      pasos.push({ txt: 'Escribir indice.json', fn: async () => { const i = await M.leer(clave, 'datos/indice.json'); await M.poner(clave, 'datos/indice.json', C.aTexto(C.indiceNuevo(i && i.json, ultimo)), msg); } });
    } else {
      // jornadas anteriores: actual.json sigue igual, pero su lista de jornadas tiene que incluirlas (si no, la web no las enseña)
      pasos.push({ txt: js.length > 1 ? 'Apuntar las jornadas en actual.json' : 'Apuntar la jornada en actual.json', fn: async () => { const a = await M.leer(clave, rActual); const { jornadas, ...resto } = a.json; await M.poner(clave, rActual, C.aTexto(C.conJornadas(resto, C.jornadasNuevas(js, a.json))), msg); } });
    }
    return pasos;
  }
  async function publicar() {
    if (E.modo === 'guardar') { await guardarSolo(); return; }
    if (E.modo === 'ranking') { await publicarRanking(); return; }
    if (E.modo === 'resumen') { await publicarResumen(); return; }
    const boton = $('#publicar');
    const js = marcadas().map((p) => p.json).sort((x, y) => x.jornada.numero - y.jornada.numero);
    if (!js.length) return;
    const id = js[0].torneo.id, clave = E.dest, ultimo = js[js.length - 1];
    boton.disabled = true;
    const ahora = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    for (const j of js) j.publicado = ahora;
    const esReciente = !E.pub.actual || E.pub.actual.torneo.id !== id || ultimo.jornada.numero >= E.pub.actual.jornada.numero;
    const salida = { pre: $('#registro'), acc: $('#reintento') };
    const u = unidad(), varias = js.length > 1, lista = enumerar(js.map((j) => j.jornada.numero));
    const final = clave === 'web'
      ? (esReciente ? (varias ? `Publicadas las ${u}s ${lista}. La web las mostrará en uno o dos minutos.` : 'Publicado. La web lo mostrará en uno o dos minutos.')
        : (varias ? `Publicadas las ${u}s ${lista}. Eran anteriores a la última publicada: solo se han corregido sus archivos.` : 'Publicado. Era una jornada anterior: solo se ha corregido su archivo.'))
      : (varias ? `Guardadas las ${u}s ${lista} como borrador. Solo las ves tú, con el token de este navegador.` : 'Guardado como borrador. Solo lo ves tú, con el token de este navegador.');
    const ok = await correr([...planExcel(clave, js, esReciente), ...pasosCopia().pasos], salida, conCopia(final), async () => {
      poner($('#resultado'), el('a', { href: clave === 'web' ? `torneo.html?t=${encodeURIComponent(id)}` : `torneo.html?t=${encodeURIComponent(id)}&borrador=1`, target: '_blank', rel: 'noopener' }, clave === 'web' ? 'Abrir el campeonato en la web' : 'Ver el borrador'));
      $('#resultado').hidden = false;
      E.pub = await estadoPublicado(id, clave, E.partidas.map((p) => p.k)).catch(() => E.pub);
      repintar(); boton.disabled = true; // la lista pasa a decir «ya publicada»; para subir otra vez, se cambia algo
      refrescarArchivos();
      await cargarTorneos();
    });
    if (!ok) boton.disabled = !M.token.obtener();
  }

  /* ---------- el Excel del ranking (contrato 1.3, assets/ranking.js) ---------- */
  // Solo su hoja WEB. Es el único JSON con licencias: a la web sube cifrado (mesa.js no deja subir nada en claro); en borradores, privado.
  async function revisarRanking(ws) {
    try {
      E.modo = 'ranking';
      E.rk = RK.leer(ws);
      poner($('#lectura'), el('p', { class: 'nota' }, 'Comprobando lo que ya está publicado…'));
      const web = await M.leer('web', 'datos/indice.json'); E.indices.web = web ? web.json : null;
      E.acceso.borr = await M.acceso('borr');
      if (E.acceso.borr.ok) { const b = await M.leer('borr', 'datos/indice.json'); E.indices.borr = b ? b.json : null; }
      E.dest = enWeb(E.rk.doc.torneo.id) ? 'web' : E.acceso.borr.ok ? 'borr' : null;
    } catch (e) {
      if (e.estado === 401) { pintarToken(e.message, true); $('#paso-revision').hidden = true; $('#paso-publicar').hidden = true; }
      if (e instanceof M.ErrorGH) poner($('#lectura'), el('p', { class: 'nota caja' }, e.message));
      else await ofrecerGuardar('No he podido reconocerlo: esa hoja WEB no se puede leer. Comprueba que es la del ranking y que el Excel está guardado.');
      return;
    }
    const t = E.rk.doc.torneo;
    E.titulo = (t.nombre || 'ranking sin nombre') + (t.temporada ? ', temporada ' + t.temporada : '');
    await montarCopia(false, propuestaDe(NOMBRE_TIPO.ranking));
    pintarFrase();
    pintarDestino();
    pintarRanking();
    $('#registro').hidden = true; $('#reintento').hidden = true; $('#resultado').hidden = true;
  }
  function valsRanking() {
    const id = E.rk.doc.torneo.id;
    const v = RK.validar(E.rk, { indice: E.indices[E.dest] || E.indices.web });
    if (E.dest === 'borr' && enWeb(id)) v.push({ cod: 'M01', gravedad: 'avisa', msg: 'Este ranking ya está en la web. El borrador es una copia aparte: la web no cambia hasta que lo publiques.' });
    if (E.dest === 'web' && !enWeb(id)) v.push({ cod: 'M02', gravedad: 'avisa', msg: 'Este ranking todavía no está en la web: se publica ahora y lo ven todos los que tengan la contraseña.' });
    return v;
  }
  function pintarRanking() {
    const d = E.rk.doc, t = d.torneo;
    E.valsRk = valsRanking();
    const resumen = el('div', { class: 'resumen' },
      cuadro(t.temporada || '—', 'Temporada'), cuadro(`${t.n_torneos} de ${d.torneos.length}`, 'torneos con resultados'),
      cuadro(t.n_jugadores, 'jugadores con puntos'), cuadro(d.ranking.filter((f) => f.plaza_ce).length, 'plazas para el Campeonato de España'));
    const vals = E.valsRk.length ? E.valsRk.map((x) => el('li', { class: x.gravedad }, el('span', { class: 'cod' }, x.cod), el('b', null, ETIQ[x.gravedad] + ': '), x.msg))
      : [el('li', { class: 'ok' }, 'Todo en orden: no hay nada que avisar.')];
    // Las plazas para el Campeonato de España: lo provisional y lo que queda vacío se dice antes de publicar (no bloquea)
    const sinJugar = [!t.sp_jugado && 'el SP', !t.open_jugado && 'el Open'].filter(Boolean);
    if (t.plazas_provisionales) vals.push(el('li', { class: 'avisa' }, el('span', { class: 'cod' }, 'ℹ'), `Plazas provisionales: aún no se ha jugado ${sinJugar.join(' ni ')}. Hasta entonces no hay plazas ${sinJugar.map((x) => x.slice(3)).join(' ni ')} y el ranking marca sus ${t.plazas_ranking}.`));
    if (t.plazas_vacias > 0) vals.push(el('li', { class: 'avisa' }, el('span', { class: 'cod' }, '⚠'), `${t.plazas_vacias === 1 ? 'Una plaza del ranking queda vacía' : t.plazas_vacias + ' plazas del ranking quedan vacías'}: no hay nadie sin plaza hasta el puesto 20.`));
    for (const [n, de] of [[t.plazas_vacias_sp, 'SP'], [t.plazas_vacias_open, 'Open']]) if (n > 0) vals.push(el('li', { class: 'avisa' }, el('span', { class: 'cod' }, '⚠'), `${n === 1 ? 'Una plaza del ' + de + ' queda vacía' : n + ' plazas del ' + de + ' quedan vacías'}: ninguna pareja de ese torneo, hasta la 10.ª, la quiere.`));
    // plazas sueltas que la pareja aún no ha aceptado ni rechazado (una línea por pareja)
    const pend = [...new Set(d.ranking.filter((f) => f.por_repartir).map((f) => `${f.por_repartir}|${f.pareja_n}`))];
    for (const x of pend) { const [k, n] = x.split('|'); vals.push(el('li', { class: 'avisa' }, el('span', { class: 'cod' }, 'ℹ'), `Plaza ${k === 'sp' ? 'SP' : 'Open'} por repartir: la pareja N.º ${n} la ha recibido y todavía no ha dicho si va. La web lo enseña así.`)); }
    if (vals.length > 1) { const i = vals.findIndex((x) => x.className === 'ok'); if (i >= 0) vals.splice(i, 1); }
    const marcas = (f) => [f.plaza_sp && (f.plaza_sp === 0.5 ? '½ ' : '') + 'SP', f.plaza_open && (f.plaza_open === 0.5 ? '½ ' : '') + 'Open', f.plaza_ranking && 'Ranking' + (t.plazas_provisionales ? ' (prov.)' : ''),
      f.por_repartir && `${f.por_repartir === 'sp' ? 'SP' : 'Open'} por repartir`].filter(Boolean).join(' · ');
    const tabla = el('div', { class: 'tabla-caja sep-12' }, el('table', { class: 'clasi' },
      el('caption', { class: 'solo-lector' }, 'Primeros puestos del ranking leídos del Excel'),
      el('thead', null, el('tr', null, el('th', null, '#'), el('th', null, 'Total'), el('th', { class: 'izq' }, 'Jugador'), el('th', null, 'Licencia'), el('th', null, 'Plaza CE'))),
      el('tbody', null, d.ranking.slice(0, 10).map((f) => el('tr', null, el('td', null, f.puesto), el('td', { class: 'gan' }, f.total),
        el('td', { class: 'pareja' }, el('span', { class: 'nom' }, `${f.nombre || ''} ${f.apellido1 || ''}`)), el('td', null, f.licencia || ''), el('td', null, marcas(f)))))));
    const bloquea = E.valsRk.some((x) => x.gravedad === 'bloquea');
    poner($('#revision'), resumen, el('ul', { class: 'vals' }, vals),
      el('p', { class: 'nota sep-12' }, 'Este Excel es el del ranking. Lleva las licencias de los jugadores: a la web solo suben cifradas con la contraseña, y en borradores se quedan en el repositorio privado.'),
      bloquea ? null : [el('p', { class: 'nota sep-12' }, 'Así empieza el ranking que verá la web:'), tabla]);
    $('#paso-revision').hidden = false;
    $('#paso-publicar').hidden = false;
    actualizarBoton();
  }
  function actualizarBotonRanking() {
    const bloquea = (E.valsRk || []).some((x) => x.gravedad === 'bloquea');
    $('#publicar').textContent = E.dest === 'borr' ? 'Guardar como borrador' : 'Publicar en la web';
    $('#guardar-solo').hidden = !bloquea;
    const fc = faltaDeCopia();
    $('#publicar').disabled = !E.dest || bloquea || !!fc;
    $('#pub-nota').textContent = !E.dest ? 'Elige dónde guardarlo.' : bloquea ? 'Corrige lo que se marca en rojo en el Excel del ranking, guárdalo y elígelo otra vez, o guarda solo el archivo.' : fc;
  }
  async function publicarRanking() {
    const boton = $('#publicar');
    const clave = E.dest, ahora = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const doc = { ...E.rk.doc, publicado: ahora }, id = doc.torneo.id;
    const msg = `${clave === 'web' ? 'Publicar' : 'Borrador'} ${id}`;
    boton.disabled = true;
    const pasos = [
      { txt: 'Escribir actual.json', fn: () => M.poner(clave, `datos/${id}/actual.json`, RK.aTexto(doc), msg) },
      { txt: 'Escribir indice.json', fn: async () => { const i = await M.leer(clave, 'datos/indice.json'); await M.poner(clave, 'datos/indice.json', C.aTexto(C.indiceCon(i && i.json, RK.entradaIndice(doc), ahora)), msg); } },
    ];
    const final = clave === 'web' ? 'Ranking publicado. La web lo mostrará en uno o dos minutos.' : 'Ranking guardado como borrador. Solo lo ves tú, con el token de este navegador.';
    const ok = await correr([...pasos, ...pasosCopia().pasos], { pre: $('#registro'), acc: $('#reintento') }, conCopia(final), async () => {
      refrescarArchivos();
      poner($('#resultado'), el('a', { href: clave === 'web' ? `ranking.html?r=${encodeURIComponent(id)}` : `ranking.html?r=${encodeURIComponent(id)}&borrador=1`, target: '_blank', rel: 'noopener' },
        clave === 'web' ? 'Abrir el ranking en la web' : 'Ver el borrador'));
      $('#resultado').hidden = false;
      await cargarTorneos();
    });
    if (!ok) boton.disabled = !M.token.obtener();
  }

  /* ---------- el PDF «Clasificación Partida N» de un organizador (assets/clasifpdf.js, con pdf.js en assets/vendor) ---------- */
  // pdf.js es un módulo: se carga la primera vez que hace falta, desde la propia web (la política de seguridad lo permite) y trabaja en un worker local.
  let pdfjs = null;
  async function cargarPdfjs() {
    if (!pdfjs) {
      pdfjs = await import(new URL('assets/vendor/pdf.min.mjs', document.baseURI).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('assets/vendor/pdf.worker.min.mjs', document.baseURI).href;
    }
    return pdfjs;
  }
  /* ---------- la Hoja de resumen de un organizador (assets/resumen.js) ---------- */
  // Del mismo archivo salen dos cosas. A la web va un campeonato de parejas con solo Clasificación, sin licencias. El bloque para el ranking lleva
  // licencias: se copia al portapapeles en este ordenador y no se sube a ningún sitio.
  async function revisarResumen(wb, rs) {
    try {
      E.modo = 'resumen';
      E.rs = rs || RS.leer(wb);
      E.confirmadasRs = new Set();
      poner($('#lectura'), el('p', { class: 'nota' }, 'Comprobando lo que ya está publicado…'));
      const web = await M.leer('web', 'datos/indice.json'); E.indices.web = web ? web.json : null;
      E.acceso.borr = await M.acceso('borr');
      if (E.acceso.borr.ok) { const b = await M.leer('borr', 'datos/indice.json'); E.indices.borr = b ? b.json : null; }
      E.dest = enWeb(RS.identificador(E.rs.datos)) ? 'web' : E.acceso.borr.ok ? 'borr' : null;
      await asegurarRanking();
    } catch (e) {
      if (e.estado === 401) { pintarToken(e.message, true); $('#paso-revision').hidden = true; $('#paso-publicar').hidden = true; }
      if (!(e instanceof M.ErrorGH)) { await ofrecerGuardar('No he podido reconocerlo: no se ha podido leer el archivo del organizador. Comprueba que está guardado y que es el que rellenó o sacó él.'); return; }
      poner($('#lectura'), el('p', { class: 'nota caja' }, e instanceof M.ErrorGH ? e.message : 'No se ha podido leer el archivo del organizador. Comprueba que está guardado y que es el que rellenó o sacó él.'));
      return;
    }
    E.titulo = E.rs.datos.nombre || '';
    await montarCopia(false, propuestaDe(NOMBRE_TIPO[E.tipo]));
    pintarFrase();
    pintarDestino();
    pintarResumen();
    $('#registro').hidden = true; $('#reintento').hidden = true; $('#resultado').hidden = true;
  }
  function valsResumen() {
    const id = RS.identificador(E.rs.datos);
    const v = RS.validar(E.rs, { indice: E.dest ? E.indices[E.dest] : E.indices.web });
    if (E.dest === 'borr' && enWeb(id)) v.push({ cod: 'M01', gravedad: 'avisa', msg: 'Este campeonato ya está en la web. El borrador es una copia aparte: la web no cambia hasta que lo publiques.' });
    if (E.dest === 'web' && !enWeb(id)) v.push({ cod: 'M02', gravedad: 'avisa', msg: 'Este campeonato todavía no está en la web: se publica ahora y lo ve todo el mundo.' });
    return v;
  }
  function copiarBloque(b, aviso, ya) {
    // Sustituir las filas de un torneo que ya está: se copian también filas vacías hasta cubrir las que tenía, para que no sobre ninguna al pegar encima.
    const vacias = ya ? Math.max(0, ya.filas - b.filas.length) : 0;
    const texto = b.tsv + (vacias ? '\n' + Array.from({ length: vacias }, () => '\t'.repeat(11)).join('\n') : '');
    const ok = () => {
      aviso.textContent = ya ? `Copiado: ${b.filas.length} filas${vacias ? ` y ${vacias} vacías, para borrar las que sobraban` : ''}. En el Excel del ranking, pincha en «▸ Bloque t${String(ya.col).padStart(2, '0')}» (el de ese torneo, columna ${ya.col}), ponte en la primera celda amarilla y pega con «Pegar valores». No crees otro torneo.`
        : `Copiado: ${b.filas.length} filas. En el Excel del ranking, pincha en «▸ Bloque» del torneo, ponte en la primera celda amarilla y pega con «Pegar valores».`;
    };
    const mal = () => { aviso.textContent = 'No se ha podido copiar. Selecciona la tabla de abajo y cópiala a mano.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, mal); else mal();
  }

  /* ---------- el bloque para el ranking: lo mismo que leer_torneo.html (assets/leerpdf.js) ---------- */
  const indiceDe = (bytes) => {
    const wb = XLSX.read(bytes, { type: 'array', sheets: ['Jugadores', 'Licencias', 'Torneos', 'Resultados'], ...LEER }), ix = LP.leerJugadores(wb, XLSX);
    ix.torneos = LP.leerTorneos(wb);              // los que ya están cargados: para no repetir uno
    return ix;
  };
  // El Excel del ranking sale de entregables/ (programas-domino) si está allí; si no, lo elige el árbitro. Se lee en este ordenador: nunca se publica.
  async function asegurarRanking() {
    if (E.ix) return;                                  // ya hay uno (el de otra subida o el que eligió el árbitro)
    if (!E.prog || !E.prog.ok) return;
    try {
      const r = await M.rankingDeEntregables();
      if (r) { E.ix = indiceDe(r.bytes); E.ixNombre = r.nombre; E.ixDe = 'entregables'; }
    } catch (e) { if (e.estado === 401) throw e; }
  }
  async function alElegirRanking(ev) {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try { E.ix = indiceDe(new Uint8Array(await f.arrayBuffer())); } catch (e) { E.ix = { jugadores: [], errores: ['✖ No se ha podido leer el Excel del ranking. ¿Es un Excel (.xlsx)?'], avisos: [] }; }
    E.ixNombre = f.name; E.ixDe = 'archivo'; E.dec = {};
    pintarResumen();
  }
  // La Hoja de resumen con la forma que lee armarAccess: nombres sueltos y licencia FVD (número) o NO.
  const licNum = (l) => { const x = RS.licencia(l); return x.tipo === 'fvd' ? x.n : 'NO'; };
  function comoAccess(rs) {
    const g = { A: [], B: [] };
    for (const k of ['A', 'B']) for (const x of rs.grupos[k].slice().sort((a, z) => Number(a.puesto) - Number(z.puesto))) {
      const par = RS.pareja(x.pareja);
      g[k].push({ puesto: Number(x.puesto), num: Number(x.num), pareja: x.pareja, nombres: par ? [par[0].completo, par[1].completo] : [String(x.pareja), ''], lic1: licNum(x.lic1), lic2: licNum(x.lic2) });
    }
    return { datos: rs.datos, grupos: g };
  }
  const aTsv = (filas) => filas.map((f) => f.map((v) => (v === null || v === undefined ? '' : String(v))).join('\t')).join('\n');
  // El bloque A:L según el tipo de archivo, o null si todavía no se puede (el PDF necesita el Excel del ranking).
  function calcularBloque() {
    const rs = E.rs, ix = E.ix && !E.ix.errores.length ? E.ix : null;
    if (rs.origen === 'pdf') return ix ? LP.armar(rs, ix, E.dec) : null;
    if (rs.origen === 'access') return LP.armarAccess(rs, ix, E.dec);
    const rb = RS.bloque(rs);
    if (!ix) return { filas: rb.filas, tsv: rb.tsv, pendientes: [], resueltos: [], errores: [], avisos: rb.avisos.concat('ℹ Falta el Excel del ranking: las licencias no se han comprobado.'), cuentas: { parejas: rb.parejas } };
    // Hoja de resumen: A a F salen de comprobar contra el ranking; G a L (retiradas y sustituciones) son de la hoja.
    const b = LP.armarAccess(comoAccess(rs), ix, E.dec);
    b.avisos = b.avisos.filter((t) => !/no dice si hubo retiradas/.test(t));
    if (b.filas.length) { let k = 0; b.filas = rb.filas.map((f) => (f[3] === '' ? f : b.filas[k++].slice(0, 6).concat(f.slice(6)))); b.tsv = aTsv(b.filas); }
    return b;
  }
  const ESTADOS_PEND = { doble: '⚠ En el archivo no trae licencia 46/ (vacía u otra provincia), pero en el ranking hay un jugador con ese nombre y licencia FVD vigente ese día. ¿Es él?', ninguno: 'No está en la lista.',
    varios: 'Hay varios con ese nombre en la lista.', repetido: 'Sale dos veces en el archivo y en la lista solo hay uno con ese nombre.', revisar: 'Lo estás cambiando.' };
  const etiquetaJ = (j) => `${j.ap1} ${j.ap2}, ${j.nombre}`.replace(/ ,/, ',') + (j.vigente ? ` (${j.vigente})` : '');
  const decidir = (clave, valor) => { E.dec[clave] = valor; pintarResumen(); };
  function pendientesUI(b) {
    const n = b.pendientes.length, masivo = [];
    const una = b.pendientes.filter((p) => p.estado === 'doble' && p.candidatos.length === 1);
    if (una.length) masivo.push(btn(una.length === 1 ? 'Confirmar la propuesta de un solo candidato (puntúa con su licencia de Valencia)' : `Confirmar las ${una.length} propuestas de un solo candidato (puntúan con su licencia de Valencia)`,
      () => { for (const p of una) E.dec[p.clave] = p.candidatos[0].codigo; pintarResumen(); }));
    const sin = b.pendientes.filter((p) => p.estado === 'ninguno' && !p.sugerencias.length);
    if (sin.length) masivo.push(btn(sin.length === 1 ? 'Marcar como no federado el que no está en la lista ni se parece a nadie' : `Marcar como no federados los ${sin.length} que no están en la lista ni se parecen a nadie`,
      () => { for (const p of sin) E.dec[p.clave] = 'NO'; pintarResumen(); }));
    const orden = E.ix.jugadores.slice().sort((a, z) => (a.ap1 + a.ap2 + a.nombre).localeCompare(z.ap1 + z.ap2 + z.nombre, 'es'));
    const grupo = (rotulo, js) => (js.length ? el('optgroup', { label: rotulo }, js.map((j) => el('option', { value: j.codigo }, etiquetaJ(j)))) : null);
    const filas = b.pendientes.slice().sort((a, z) => (z.candidatos.length + z.sugerencias.length > 0) - (a.candidatos.length + a.sugerencias.length > 0)).map((p) => {
      const sel = el('select', { 'aria-label': `Quién es «${p.texto}»` }, el('option', { value: '' }, 'Elige de la lista…'),
        grupo(['varios', 'repetido', 'revisar', 'doble'].includes(p.estado) ? 'Encajan' : 'Parecidos', p.candidatos.concat(p.sugerencias.filter((j) => !p.candidatos.includes(j)))), grupo('Toda la lista', orden));
      sel.addEventListener('change', () => { if (sel.value) decidir(p.clave, sel.value); });
      return el('div', { class: 'pend' },
        el('div', null, el('b', null, `Pareja ${p.num} (grupo ${p.grupo}, puesto ${p.puesto}), jugador ${p.quien}: `), `«${p.texto}». ${ESTADOS_PEND[p.estado]}${p.sugerencias.length ? ' Hay nombres parecidos.' : ''}`),
        el('div', { class: 'acciones sin-margen' }, sel, btn('No federado', () => decidir(p.clave, 'NO'))));
    });
    return [el('p', { class: 'nota sin-margen' }, el('b', null, n === 1 ? 'Falta identificar a 1 jugador.' : `Faltan por identificar ${n} jugadores.`),
      ' Elige quién es en la lista del ranking, o pulsa «No federado» si no tiene licencia de la FVD (irá con licencia NO y no puntuará). Hasta que no quede ninguno, no se puede copiar el bloque.'), el('div', { class: 'acciones' }, masivo), filas];
  }
  function resueltosUI(b) {
    const COMO = { solo: 'por su nombre', cortado: 'nombre cortado en el PDF', elegido: 'elegido por ti', NO: 'no federado' };
    const th = (t) => el('th', { scope: 'col' }, t);
    return el('details', { class: 'sep-10' }, el('summary', null, `Ver a quién se ha encontrado (${b.resueltos.length})`),
      el('div', { class: 'tabla-caja sep-12' }, el('table', { class: 'clasi' }, el('caption', { class: 'solo-lector' }, 'Cada jugador del archivo y quién es en la lista del ranking'),
        el('thead', null, el('tr', null, ['Pareja', 'En el archivo', 'En la lista', 'Licencia', 'Cómo', ''].map(th))),
        el('tbody', null, b.resueltos.map((x) => el('tr', null, el('td', null, x.num), el('td', null, x.texto), el('td', null, x.nombre || ''), el('td', null, x.lic === undefined ? 'NO' : x.lic === null ? '' : x.lic),
          el('td', null, COMO[x.como] || ''), el('td', null, btn('Cambiar', () => decidir(x.clave, '?')))))))));
  }
  function paraElRanking(b) {
    const aviso = el('p', { class: 'nota sin-margen', 'aria-live': 'polite' });
    const ix = E.ix;
    const fuente = !ix ? 'No hay ningún Excel del ranking en entregables/ de programas-domino. Elígelo para comprobar las licencias' + (E.rs.origen === 'pdf' ? ' y buscar a los jugadores del PDF por su nombre.' : '.')
      : ix.errores.length ? ix.errores.join(' ')
        : `Licencias comprobadas con el Excel del ranking «${E.ixNombre}»${E.ixDe === 'entregables' ? ' (el que hay en entregables/ de programas-domino)' : ' (el que has elegido)'}. Se lee en este ordenador y no se publica.`;
    // ¿El torneo ya está en el Excel del ranking (mismo nombre y fecha)? Entonces no se añade otro: se sustituyen sus filas.
    const ya = ix && !ix.errores.length && b ? (ix.torneos || []).find((t) => LP.mismoTorneo({ nombre: E.rs.datos.nombre, fecha: E.rs.datos.fecha }, t)) : null;
    const campo = el('input', { type: 'file', id: 'ranking-excel', accept: '.xlsx,.xlsm', 'aria-label': 'Elegir otro Excel del ranking' });
    campo.addEventListener('change', alElegirRanking);
    const msgs = b ? [...b.errores, ...b.avisos.map((t) => t.replace('en el paso 1b', 'aquí abajo'))].map((t) => el('li', { class: t.startsWith('✖') ? 'bloquea' : t.startsWith('⚠') ? 'avisa' : 'ok' }, t)) : [];
    const cab = ['Grupo', 'Puesto', 'Licencia 1', 'Jugador 1', 'Licencia 2', 'Jugador 2', 'Retirada', 'Lic. sustituto', 'Sustituto', 'Quién', 'Partidas', 'Caso'];
    const fila = (f) => el('tr', null, f.map((x, i) => el('td', { class: i === 3 || i === 5 || i === 8 ? 'txt' : null }, x === '' || x === null ? '' : String(x))));
    const tabla = b && b.tsv ? [
      el('p', { class: 'nota sin-margen' }, `El bloque tiene ${b.filas.length} filas (${b.cuentas.parejas} parejas). Lleva las licencias: se copia en este ordenador y no se sube a ningún sitio.`),
      el('div', { class: 'acciones' }, ya ? el('button', { class: 'boton', id: 'sustituir-bloque', type: 'button', onclick: () => copiarBloque(b, aviso, ya) }, 'Sustituir las filas de ese torneo')
        : el('button', { class: 'boton', id: 'copiar-bloque', type: 'button', onclick: () => copiarBloque(b, aviso) }, 'Copiar el bloque'), aviso),
      el('details', { class: 'sep-10' }, el('summary', null, 'Ver el bloque'), el('div', { class: 'tabla-caja sep-12' }, el('table', { class: 'clasi', id: 'bloque-ranking' },
        el('caption', { class: 'solo-lector' }, 'Bloque para pegar en el Excel del ranking'), el('thead', null, el('tr', null, cab.map((t) => el('th', { scope: 'col' }, t)))), el('tbody', null, b.filas.map(fila)))))] : null;
    return [el('h3', { class: 'subtitulo' }, 'Para el ranking'),
      el('p', { class: 'nota sin-margen', id: 'fuente-ranking' }, fuente), el('div', { class: 'acciones' }, campo),
      ya ? el('p', { class: 'nota caja', id: 'torneo-cargado' }, `⚠ Este torneo ya está en el Excel del ranking: columna ${ya.col}, «${ya.nombre}», ${ya.fecha.split('-').reverse().join('/')}, con ${ya.filas} ${ya.filas === 1 ? 'fila' : 'filas'}. No lo añadas como un torneo nuevo: se sustituyen las filas de ese torneo.`) : null,
      msgs.length ? el('ul', { class: 'vals' }, msgs) : null,
      b && b.pendientes.length ? pendientesUI(b) : null, b && b.resueltos.length ? resueltosUI(b) : null, tabla];
  }
  // En la vista previa del PDF, los nombres como vienen (el PDF no separa nombre y apellidos); en la Hoja, el nombre corto.
  const nombreVista = (p, id, pdf) => (!p ? '#' + id : pdf ? [[p.j1_nombre, p.j1_apellido1], [p.j2_nombre, p.j2_apellido1]].map((x) => x.join(' ')).join(' - ') : p.corto || '#' + id);
  function pintarResumen() {
    const d = E.rs.datos;
    E.valsRs = valsResumen();
    const bloquea = E.valsRs.some((x) => x.gravedad === 'bloquea');
    const lista = E.valsRs.map((x) => {
      if (x.gravedad === 'confirma') {
        const c = el('input', { type: 'checkbox', checked: E.confirmadasRs.has(x.cod) });
        c.addEventListener('change', () => { c.checked ? E.confirmadasRs.add(x.cod) : E.confirmadasRs.delete(x.cod); actualizarBotonResumen(); });
        return el('li', { class: 'confirma' }, el('label', null, c, el('span', null, el('span', { class: 'cod' }, x.cod), x.msg + ' ', el('b', null, 'Marca la casilla si quieres seguir.'))));
      }
      return el('li', { class: x.gravedad }, el('span', { class: 'cod' }, x.cod), el('b', null, ETIQ[x.gravedad] + ': '), x.msg);
    });
    if (!lista.length) lista.push(el('li', { class: 'ok' }, 'Todo en orden: no hay nada que avisar.'));
    let vista = null;
    const pdf = E.rs.origen === 'pdf', deAccess = !!E.rs.origen;    // del informe de Access (PDF o Excel): el nombre sale como viene
    if (!bloquea) {
      const j = RS.construir(E.rs, null), byId = new Map(j.participantes.map((p) => [p.id, p]));
      E.json = j;
      const clas = el('div', { class: 'tabla-caja sep-12' }, el('table', { class: 'clasi' },
        el('caption', { class: 'solo-lector' }, pdf ? 'Primeros puestos del grupo A leídos del PDF' : deAccess ? 'Primeros puestos del grupo A leídos del Excel de Access' : 'Primeros puestos del grupo A leídos de la Hoja de resumen'),
        el('thead', null, el('tr', null, el('th', null, '#'), el('th', { class: 'izq' }, 'Pareja'), el('th', null, 'P.G.'), el('th', null, 'Dif.'))),
        el('tbody', null, j.clasificacion.filter((r) => r.grupo === 'A').slice(0, 8).map((r) => el('tr', null, el('td', null, r.puesto),
          el('td', { class: 'pareja' }, el('span', { class: 'nom' }, nombreVista(byId.get(r.id), r.id, deAccess))), el('td', { class: 'gan' }, r.gan), el('td', null, r.dt))))));
      const intro = el('p', { class: 'nota sep-12' }, 'Así empieza la clasificación que verá la web (sin licencias):');
      vista = [intro, clas, ...paraElRanking(calcularBloque())];
    } else E.json = null;
    poner($('#revision'),
      el('div', { class: 'resumen' }, cuadro(d.nombre || '—', 'Campeonato'), cuadro(d.partidas == null ? '—' : d.partidas, 'partidas'),
        cuadro(E.rs.grupos.A.length + E.rs.grupos.B.length, 'parejas'), cuadro(E.rs.grupos.B.length ? 'Con grupo B' : 'Sin grupo B', 'grupos')),
      el('ul', { class: 'vals' }, lista),
      el('p', { class: 'nota sep-12' }, (pdf ? 'Es el PDF de la clasificación de un organizador.' : deAccess ? 'Es el Excel exportado de Access por un organizador.' : 'Es la Hoja de resumen de un organizador.') + ' A la web sube un campeonato de parejas con solo la clasificación, sin licencias. El bloque para el ranking sale abajo.'), vista);
    $('#paso-revision').hidden = false;
    $('#paso-publicar').hidden = false;
    actualizarBotonResumen();
  }
  function actualizarBotonResumen() {
    const v = E.valsRs || [];
    const bloquea = v.some((x) => x.gravedad === 'bloquea'), falta = v.some((x) => x.gravedad === 'confirma' && !E.confirmadasRs.has(x.cod));
    $('#publicar').textContent = E.dest === 'borr' ? 'Guardar como borrador' : 'Publicar en la web';
    $('#guardar-solo').hidden = !bloquea;
    const fc = faltaDeCopia();
    $('#publicar').disabled = !E.dest || bloquea || falta || !!fc;
    $('#pub-nota').textContent = !E.dest ? 'Elige dónde guardarlo.' : bloquea ? (E.rs && E.rs.origen ? 'Hay algo en rojo en el archivo del organizador. Pide que lo corrija o que lo exporte otra vez y vuelve a elegirlo, o guarda solo el archivo.' : 'Corrige lo que se marca en rojo en la Hoja de resumen, guárdala y elígela otra vez, o guarda solo el archivo.') : falta ? 'Marca las casillas para poder publicar.' : fc;
  }
  async function publicarResumen() {
    const boton = $('#publicar');
    const clave = E.dest, ahora = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const j = { ...E.json, publicado: ahora }, id = j.torneo.id, nn = String(j.jornada.numero).padStart(2, '0');
    const msg = `${clave === 'web' ? 'Publicar' : 'Borrador'} ${id}: clasificación final`;
    boton.disabled = true;
    const pasos = [
      { txt: `Escribir jornada_${nn}.json`, fn: () => M.poner(clave, `datos/${id}/jornada_${nn}.json`, C.aTexto(j), msg) },
      { txt: 'Escribir actual.json', fn: () => M.poner(clave, `datos/${id}/actual.json`, C.aTexto(C.conJornadas(j, [{ numero: j.jornada.numero, completa: true, publicado: ahora }])), msg) },
      { txt: 'Escribir indice.json', fn: async () => { const i = await M.leer(clave, 'datos/indice.json'); await M.poner(clave, 'datos/indice.json', C.aTexto(C.indiceNuevo(i && i.json, j)), msg); } },
    ];
    const final = clave === 'web' ? 'Publicado. La web lo mostrará en uno o dos minutos.' : 'Guardado como borrador. Solo lo ves tú, con el token de este navegador.';
    const ok = await correr([...pasos, ...pasosCopia().pasos], { pre: $('#registro'), acc: $('#reintento') }, conCopia(final), async () => {
      refrescarArchivos();
      poner($('#resultado'), el('a', { href: clave === 'web' ? `torneo.html?t=${encodeURIComponent(id)}` : `torneo.html?t=${encodeURIComponent(id)}&borrador=1`, target: '_blank', rel: 'noopener' }, clave === 'web' ? 'Abrir el campeonato en la web' : 'Ver el borrador'));
      $('#resultado').hidden = false;
      await cargarTorneos();
    });
    if (!ok) boton.disabled = !M.token.obtener();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.pagina !== 'publicar') return;
    pintarToken();
    $('#archivo').addEventListener('change', alElegirArchivo);
    $('#publicar').addEventListener('click', publicar);
    $('#cancelar').addEventListener('click', cancelarSubida);
    $('#guardar-solo').addEventListener('click', () => ofrecerGuardar('Lo guardo sin publicarlo.'));
    $('#actualizar').addEventListener('click', cargarTorneos);
    cargarTorneos();
  });
})();
