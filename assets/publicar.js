/* publicar.html · mesa de control: contraseña de la web, lista de campeonatos (web y borradores), subir un Excel con destino, publicar, ocultar,
   editar, eliminar y la normativa en PDF. Todo lo que toca GitHub pasa por assets/mesa.js, que cifra lo que va a la web. Los textos que vienen de un JSON se pintan siempre como texto. */
(function () {
  'use strict';
  const { el, poner, instante, TIPOS, ESTADOS } = window.TuMesa;
  const C = window.Contrato;
  const P = window.Partidas;
  const M = window.Mesa;
  // Límites al leer el Excel (el real pesa unos 7 MB; la hoja WEB cabe en 210 filas y 53 columnas).
  const MAX_BYTES = 25 * 1024 * 1024, MAX_FILAS = 300, MAX_COLUMNAS = 80;
  const $ = (s) => document.querySelector(s);
  const NOMBRE_REPO = { web: 'la web', borr: 'borradores' };
  const E = { json: null, raw: null, partidas: [], sel: new Set(), aviso: null, omitidas: [], pub: null, vals: [], confirmadas: new Set(), dest: null, indices: { web: null, borr: null }, acceso: { web: null, borr: null }, archivo: '' };
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
        const borr = await M.acceso('borr');
        const guardado = M.token.guardar(v);
        pintarToken((guardado ? 'Token comprobado y guardado.' : 'El navegador no deja guardar el token (¿ventana privada?). Se usará solo hasta que cierres esta pestaña.') + (borr.ok ? '' : ' Ojo: este token no tiene acceso a campeonatos-borradores; la lista de borradores te dice qué falta.'), !guardado || !borr.ok);
        cargarTorneos();
      } catch (e) { M.token.borrar(); boton.disabled = false; nota.textContent = e.message; nota.className = 'nota caja'; }
    });
    poner($('#token-estado'),
      el('p', null, 'La primera vez hace falta un token de GitHub con acceso a los repositorios campeonatos-domino y campeonatos-borradores (Contents: Read and write) y a nada más. Pégalo aquí. No lo escribas en ningún chat ni correo.'),
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
  }
  function pintarLista(clave, r) {
    const caja = $(clave === 'web' ? '#lista-web' : '#lista-borr');
    if (r.estado === 'sinAcceso') poner(caja, el('p', { class: 'nota caja' }, r.msg));
    else if (r.estado === 'error') poner(caja, el('p', { class: 'nota caja' }, r.msg));
    else {
      poner(caja,
        r.soloLectura ? el('p', { class: 'nota caja' }, 'Este token solo puede leer ' + M.REPOS[clave] + '. Para escribir hace falta el permiso «Contents: Read and write».') : null,
        r.enClaro ? el('p', { class: 'nota caja' }, M.claveJson ? 'Hay archivos de la web sin cifrar. Pulsa «Cifrar lo publicado» en el paso 2.' : 'La web todavía no tiene contraseña y lo publicado está sin cifrar: cualquiera puede leerlo. Establece la contraseña en el paso 2.') : null,
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

  /* ---------- paso 3: leer el Excel ---------- */
  async function alElegirArchivo(ev) {
    const f = ev.target.files[0];
    ev.target.value = ''; // así se puede volver a elegir el mismo archivo tras guardarlo de nuevo
    E.json = null; E.partidas = [];
    $('#paso-revision').hidden = true; $('#paso-publicar').hidden = true;
    if (!f) { poner($('#lectura')); return; }
    const aviso = (t) => poner($('#lectura'), el('p', { class: 'nota caja' }, t));
    if (f.size > MAX_BYTES) { aviso(`Ese archivo pesa ${Math.round(f.size / 1048576)} MB y es demasiado grande (el máximo son ${MAX_BYTES / 1048576} MB). ¿Es el Excel del campeonato?`); return; }
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) { aviso('Elige el archivo Excel del campeonato (termina en .xlsx).'); return; }
    if (!M.token.obtener()) { aviso('Primero pega el token de GitHub en el paso 1.'); return; }
    poner($('#lectura'), el('p', { class: 'nota' }, 'Leyendo la hoja WEB…'));
    let wb, bytes;
    try {
      bytes = await f.arrayBuffer();
      wb = XLSX.read(bytes, { type: 'array', sheets: 'WEB', cellFormula: false, cellHTML: false, cellStyles: false, cellNF: false });
    } catch (e) { aviso('No se ha podido leer ese archivo. ¿Está dañado o es de otro programa?'); return; }
    const ws = wb.Sheets && wb.Sheets.WEB;
    if (!ws) { aviso('Este archivo no tiene la hoja WEB. ¿Es el Excel del campeonato?'); return; }
    const rg = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    if (rg.e.r + 1 > MAX_FILAS || rg.e.c + 1 > MAX_COLUMNAS) { aviso('La hoja WEB es mucho más grande de lo normal. ¿Es el Excel del campeonato?'); return; }
    E.archivo = f.name;
    await revisar(ws, wb, bytes);
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
      poner($('#lectura'), el('p', { class: 'nota caja' }, e instanceof M.ErrorGH ? e.message : 'Esa hoja WEB no se puede leer. Comprueba que es la del campeonato y que el Excel está guardado.'));
      return;
    }
    leido();
    nuevaSeleccion();
    pintarRevision();
  }
  const leido = () => {
    const n = E.partidas.length;
    poner($('#lectura'), el('p', { class: 'nota' }, `Leído «${E.archivo}»: ${E.json.torneo.nombre || 'sin nombre'}.` + (n > 1 ? ` Trae ${n} ${unidad()}s con datos.` : '')));
  };
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
    const sel = marcadas();
    const bloquea = sel.some((p) => p.vals.some((x) => x.gravedad === 'bloquea'));
    const falta = sel.some((p) => p.vals.filter((x) => x.gravedad === 'confirma').some((x) => !E.confirmadas.has(p.k + ':' + x.cod)));
    const n = sel.length, u = unidad();
    $('#publicar').textContent = (E.dest === 'borr' ? 'Guardar como borrador' : 'Publicar en la web') + (n > 1 ? ` (${n} ${u}s)` : '');
    $('#publicar').disabled = !E.dest || !n || bloquea || falta;
    $('#pub-nota').textContent = !E.dest ? 'Elige dónde guardarlo.' : !n ? `Marca al menos una ${u}.` : bloquea ? 'Corrige lo que se marca en rojo, guarda el Excel y elígelo otra vez, o desmarca esa ' + u + '.' : falta ? 'Marca las casillas para poder publicar.' : '';
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
    const ok = await correr(planExcel(clave, js, esReciente), salida, final, async () => {
      poner($('#resultado'), el('a', { href: clave === 'web' ? `torneo.html?t=${encodeURIComponent(id)}` : `torneo.html?t=${encodeURIComponent(id)}&borrador=1`, target: '_blank', rel: 'noopener' }, clave === 'web' ? 'Abrir el campeonato en la web' : 'Ver el borrador'));
      $('#resultado').hidden = false;
      E.pub = await estadoPublicado(id, clave, E.partidas.map((p) => p.k)).catch(() => E.pub);
      repintar(); boton.disabled = true; // la lista pasa a decir «ya publicada»; para subir otra vez, se cambia algo
      await cargarTorneos();
    });
    if (!ok) boton.disabled = !M.token.obtener();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.pagina !== 'publicar') return;
    pintarToken();
    $('#archivo').addEventListener('change', alElegirArchivo);
    $('#publicar').addEventListener('click', publicar);
    $('#actualizar').addEventListener('click', cargarTorneos);
    cargarTorneos();
  });
})();
