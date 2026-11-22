/* Mesa de control: el único código que habla con la API de GitHub. Lo cargan publicar.html y torneo.html (para ver borradores).
   Reglas (SECURITY.md): el token solo viaja al servidor de la API de GitHub; solo se toca campeonatos-domino y campeonatos-borradores;
   solo se escribe en datos/indice.json, datos/clave.json y datos/<id>/(jornada_NN|actual).json o normativa.pdf.cifrado, con id validado.
   Todo lo que va a campeonatos-domino (público) sale cifrado con la contraseña de la web (assets/cifra.js); los borradores, en claro. */
(function (raiz) {
  'use strict';
  const API = 'https://api.github.com';
  const DUENO = 'JUGUEMOSDOMINO';
  const REPOS = { web: 'campeonatos-domino', borr: 'campeonatos-borradores' };
  const RAMA = 'main';
  const CLAVE = 'tumesa.token';
  // Correo noreply de la cuenta (id de /users/JUGUEMOSDOMINO): así los commits no enseñan el correo real.
  const AUTOR = { name: 'Mesa de control', email: '356692983+JUGUEMOSDOMINO@users.noreply.github.com' };
  const ID = '[a-z0-9][a-z0-9-]{2,59}';
  const ID_OK = new RegExp('^' + ID + '$');
  const RUTA_OK = new RegExp('^datos/(indice\\.json|clave\\.json|' + ID + '/((jornada_\\d{2}|actual)\\.json|normativa\\.pdf\\.cifrado))$');
  const DIR_OK = new RegExp('^datos(/' + ID + ')?$');
  const BLOB_OK = /^\/git\/blobs\/[0-9a-f]{40}$/; // archivos de más de 1 MB: la API de contenidos no trae el contenido
  const ARCHIVO_DATOS = /^(jornada_\d{2}|actual)\.json$/;
  const NORMATIVA = 'normativa.pdf.cifrado', CLAVE_JSON = 'datos/clave.json';
  const MAX_PDF = 10 * 1024 * 1024;

  /* ---------- token ---------- */
  let memoria = null; // si el navegador no deja guardar, el token vive solo en esta pestaña
  const token = {
    usar(v) { memoria = v; }, // para comprobar un token antes de guardarlo
    obtener() { try { return localStorage.getItem(CLAVE) || memoria; } catch (e) { return memoria; } },
    guardar(v) { memoria = v; try { localStorage.setItem(CLAVE, v); return true; } catch (e) { return false; } },
    borrar() { memoria = null; try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ } },
  };

  /* ---------- GitHub ---------- */
  class ErrorGH extends Error { constructor(estado, msg, repo) { super(msg); this.estado = estado; this.repo = repo; } }
  const quitarQuery = (r) => r.split('?')[0];
  const SIN_ACCESO = {
    web: 'Con este token no se puede usar el repositorio campeonatos-domino. Comprueba que el token tiene ese repositorio en «Repository access» y el permiso «Contents: Read and write».',
    borr: 'Con este token no se puede usar el repositorio campeonatos-borradores. En GitHub, edita el token y, en «Repository access», añade campeonatos-borradores; en «Permissions», deja «Contents: Read and write».',
  };
  // Único punto por el que sale el token. `sufijo` es '' (el repositorio) o '/contents/<ruta>' con ruta permitida.
  async function llamar(clave, sufijo, opciones) {
    const nombre = Object.prototype.hasOwnProperty.call(REPOS, clave) ? REPOS[clave] : null; // «__proto__» o «constructor» no son repositorios
    if (!nombre) throw new ErrorGH(0, 'Repositorio no permitido: ' + clave);
    if (sufijo && !BLOB_OK.test(sufijo)) {
      const ruta = sufijo.replace(/^\/contents\//, '');
      if (!sufijo.startsWith('/contents/') || !(RUTA_OK.test(quitarQuery(ruta)) || DIR_OK.test(quitarQuery(ruta)))) throw new ErrorGH(0, 'Ruta no permitida: ' + sufijo);
    }
    const t = token.obtener();
    if (!t) throw new ErrorGH(401, 'Falta el token de GitHub. Pégalo en el paso 1.', clave);
    const ruta = `/repos/${DUENO}/${nombre}${sufijo}`;
    const destino = API + ruta;
    let ok = false;
    try { ok = new URL(destino).origin === API && ruta.startsWith(`/repos/${DUENO}/${nombre}`); } catch (e) { /* ok sigue en false */ }
    if (!ok) throw new ErrorGH(0, 'Dirección no permitida: el token solo se envía a GitHub.', clave);
    let r;
    try {
      r = await fetch(destino, {
        ...opciones, redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opciones && opciones.headers) },
      });
    } catch (e) { throw new ErrorGH(0, 'No hay conexión con GitHub. Comprueba que el ordenador tiene internet y prueba otra vez.', clave); }
    if (r.ok) return r.status === 204 ? null : r.json();
    if (r.status === 401) {
      token.borrar();
      throw new ErrorGH(401, 'GitHub no acepta el token: es incorrecto o ha caducado. Lo he borrado de este navegador. Crea uno nuevo, pégalo en el paso 1 y vuelve a intentarlo.', clave);
    }
    if (r.status === 403 || r.status === 404) throw new ErrorGH(r.status, SIN_ACCESO[clave], clave);
    if (r.status === 409 || r.status === 422) throw new ErrorGH(r.status, 'Alguien ha cambiado el archivo a la vez. Vuelve a intentarlo.', clave);
    throw new ErrorGH(r.status, `GitHub ha respondido con un error (${r.status}). Prueba otra vez dentro de un minuto.`, clave);
  }

  function bytesDe(b64) { const bin = atob(b64.replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function aBase64(txt) { const u = new TextEncoder().encode(txt); let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); }
  const noEncontrado = (e) => e.estado === 404;

  /* Qué puede hacer el token con un repositorio: { ok, push } o { ok: false, estado, msg }. */
  async function acceso(clave) {
    try { const r = await llamar(clave, ''); return { ok: true, push: !(r && r.permissions && r.permissions.push === false) }; }
    catch (e) { if (e.estado === 401) throw e; return { ok: false, estado: e.estado, msg: e.message }; }
  }
  /* Archivo tal cual está en el repositorio → { sha, texto } o null si no existe. En la web, `texto` es el sobre cifrado. */
  async function leerArchivo(clave, ruta) {
    try {
      let r = await llamar(clave, `/contents/${ruta}?ref=${RAMA}`);
      if (r && r.content === '' && r.encoding === 'none' && /^[0-9a-f]{40}$/.test(r.sha || '')) r = await llamar(clave, `/git/blobs/${r.sha}`); // más de 1 MB
      if (!r || typeof r.content !== 'string') throw new ErrorGH(0, 'GitHub no ha devuelto el contenido de ' + ruta, clave);
      return { sha: r.sha, texto: new TextDecoder().decode(bytesDe(r.content)) };
    } catch (e) { if (noEncontrado(e)) return null; throw e; } // 404 de un archivo = no existe; el del repositorio entero se distingue antes con acceso()
  }

  /* ---------- contraseña de la web ---------- */
  // cj: datos/clave.json publicado (null si la web aún no tiene contraseña); clave: la de este navegador, comprobada; pendiente: un cambio a medias.
  const CL = { cj: null, clave: null, pendiente: null };
  async function estadoClave() {
    const f = await leerArchivo('web', CLAVE_JSON);
    try { CL.cj = f ? JSON.parse(f.texto) : null; } catch (e) { CL.cj = null; }
    if (CL.cj && !Cifra.claveJsonValido(CL.cj)) throw new ErrorGH(0, 'El archivo datos/clave.json de la web está dañado. No toques nada y avisa a quien mantiene la web.', 'web');
    CL.pendiente = await Cifra.cargarPendiente();
    const g = await Cifra.cargarClave('datos');
    CL.clave = g && CL.cj && await Cifra.comprobar(g, CL.cj) ? g : null;
    if (!CL.clave && CL.pendiente && CL.cj && await Cifra.comprobar(CL.pendiente.clave, CL.cj)) { // el cambio llegó a subir clave.json: solo faltaba guardarla aquí
      CL.clave = CL.pendiente.clave; await Cifra.guardarClave('datos', CL.clave, true); Cifra.olvidarPendiente(); CL.pendiente = null;
    }
    if (g && !CL.clave && CL.cj) Cifra.olvidarClave('datos');
    return { hay: !!CL.cj, abierta: !!CL.clave, pendiente: !!CL.pendiente, cambio: !!g && !CL.clave && !!CL.cj };
  }
  async function abrirClave(contrasena, recordar) {
    const k = CL.cj && await Cifra.abrir(contrasena, CL.cj);
    if (!k) return false;
    await Cifra.guardarClave('datos', k, recordar);
    CL.clave = k;
    return true;
  }
  function olvidarClave() { Cifra.olvidarClave('datos'); CL.clave = null; }
  const sinClave = () => new ErrorGH(0, CL.cj ? 'Para leer y escribir la web hace falta su contraseña: escríbela en el paso 2.' : 'La web todavía no tiene contraseña. Establécela en el paso 2 antes de publicar nada.', 'web');
  // Sobre → bytes, con la clave de ahora o con la de un cambio a medias.
  async function abrirSobre(s, ruta) {
    for (const k of [CL.clave, CL.pendiente && CL.pendiente.clave]) if (k) { try { return await Cifra.descifrar(k, s); } catch (e) { /* la otra */ } }
    if (!CL.clave) throw sinClave();
    throw new ErrorGH(0, `No puedo abrir ${ruta} con la contraseña de este navegador. Puede que alguien la haya cambiado desde otro sitio: pulsa «Olvidar contraseña en este dispositivo» y escribe la nueva.`, 'web');
  }
  // Un archivo de la web en texto: descifrado si es un sobre; tal cual si aún está en claro (antes de cifrar lo publicado).
  async function textoDe(clave, ruta, texto) {
    if (clave !== 'web' || ruta === CLAVE_JSON || !Cifra.esSobreTexto(texto)) return { texto, enClaro: clave === 'web' && ruta !== CLAVE_JSON };
    return { texto: new TextDecoder().decode(await abrirSobre(JSON.parse(texto), ruta)), enClaro: false };
  }
  // Última barrera: a la web no sube nada que no sea un sobre cifrado (o un clave.json bien formado).
  function exigirCifrado(clave, ruta, texto) {
    if (clave !== 'web') return;
    let ok;
    if (ruta === CLAVE_JSON) { try { ok = Cifra.claveJsonValido(JSON.parse(texto)); } catch (e) { ok = false; } } else ok = Cifra.esSobreTexto(texto);
    if (!ok) throw new ErrorGH(0, 'No se sube nada sin cifrar a la web (' + ruta + ').', 'web');
  }
  async function cifrarPara(clave, ruta, texto) {
    if (clave !== 'web' || ruta === CLAVE_JSON) return texto;
    if (!CL.clave) throw sinClave();
    return JSON.stringify(await Cifra.cifrarTexto(CL.clave, texto)) + '\n';
  }

  async function leer(clave, ruta) {
    const f = await leerArchivo(clave, ruta);
    if (!f) return null;
    const t = await textoDe(clave, ruta, f.texto);
    try { return { sha: f.sha, texto: t.texto, json: JSON.parse(t.texto), enClaro: t.enClaro }; } catch (e) { throw new ErrorGH(0, `El archivo ${ruta} no es un JSON válido.`, clave); }
  }
  /* Carpeta → lista de { name, type } o null si no existe. */
  async function listar(clave, dir) {
    try {
      const r = await llamar(clave, `/contents/${dir}?ref=${RAMA}`);
      return Array.isArray(r) ? r : null;
    } catch (e) { if (noEncontrado(e)) return null; throw e; }
  }
  async function escribir(clave, ruta, texto, sha, mensaje) {
    if (!RUTA_OK.test(ruta)) throw new ErrorGH(0, 'Ruta no permitida: ' + ruta + '. Solo se escribe en datos/indice.json, datos/clave.json y datos/<id>/jornada_NN.json, actual.json o normativa.pdf.cifrado.');
    exigirCifrado(clave, ruta, texto);
    const cuerpo = { message: mensaje, content: aBase64(texto), branch: RAMA, author: AUTOR, committer: AUTOR };
    if (sha) cuerpo.sha = sha;
    return llamar(clave, `/contents/${ruta}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
  }
  async function borrar(clave, ruta, sha, mensaje) {
    if (!RUTA_OK.test(ruta)) throw new ErrorGH(0, 'Ruta no permitida: ' + ruta + '. Solo se borra datos/<id>/jornada_NN.json o actual.json.');
    return llamar(clave, `/contents/${ruta}`, { method: 'DELETE', body: JSON.stringify({ message: mensaje, sha, branch: RAMA, author: AUTOR, committer: AUTOR }) });
  }
  const choque = (e) => e.estado === 409 || e.estado === 422;
  /* Escribe un archivo se haya o no escrito antes: busca su sha al momento y, si alguien lo cambió entre medias, lo busca otra vez.
     `texto` va en claro: si el destino es la web, se cifra aquí. */
  async function poner(clave, ruta, texto, mensaje) { return ponerTal(clave, ruta, await cifrarPara(clave, ruta, texto), mensaje); }
  async function ponerTal(clave, ruta, texto, mensaje) {
    for (let intento = 0; ; intento++) {
      const f = await leerArchivo(clave, ruta);
      try { return await escribir(clave, ruta, texto, f && f.sha, mensaje); } catch (e) { if (!choque(e) || intento) throw e; }
    }
  }
  /* Borra un archivo si existe. Devuelve false si ya no estaba. */
  async function quitar(clave, ruta, mensaje) {
    for (let intento = 0; ; intento++) {
      const f = await leerArchivo(clave, ruta);
      if (!f) return false;
      try { await borrar(clave, ruta, f.sha, mensaje); return true; } catch (e) { if (!choque(e) || intento) throw e; }
    }
  }

  /* ---------- torneos ---------- */
  const C = () => raiz.Contrato;
  const ahora = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ordenArchivos = (a, b) => (a === 'actual.json') - (b === 'actual.json') || (a < b ? -1 : a > b ? 1 : 0); // jornadas primero, actual.json al final
  const idValido = (id) => ID_OK.test(id || '');
  function exigirId(id) { if (!idValido(id)) throw new ErrorGH(0, 'Identificador no permitido: ' + id); }

  /* Los archivos de datos de un torneo en un repositorio, y si tiene normativa. Lo que no es de datos (un folleto.pdf, por ejemplo) queda en `otros`. */
  async function archivosDe(clave, id) {
    exigirId(id);
    const lista = await listar(clave, `datos/${id}`);
    if (!lista) return null;
    const nombres = lista.filter((x) => x.type === 'file' && ARCHIVO_DATOS.test(x.name)).map((x) => x.name).sort(ordenArchivos);
    const normativa = lista.some((x) => x.type === 'file' && x.name === NORMATIVA);
    return { nombres, normativa, otros: lista.filter((x) => !nombres.includes(x.name) && x.name !== NORMATIVA).map((x) => x.name) };
  }
  /* Además los lee y comprueba que son JSON del torneo pedido. */
  async function leerTorneo(clave, id) {
    const dir = await archivosDe(clave, id);
    if (!dir) return null;
    if (!dir.nombres.includes('actual.json')) throw new ErrorGH(0, `La carpeta datos/${id} no tiene actual.json.`, clave);
    const archivos = [];
    for (const nombre of dir.nombres) {
      const f = await leer(clave, `datos/${id}/${nombre}`);
      if (!f || !f.json.torneo || f.json.torneo.id !== id) throw new ErrorGH(0, `${nombre} no es del torneo ${id}.`, clave);
      archivos.push({ nombre, ruta: `datos/${id}/${nombre}`, texto: f.texto, json: f.json });
    }
    return { archivos, otros: dir.otros, normativa: dir.normativa, actual: archivos[archivos.length - 1].json };
  }
  const entradaDe = (ind, id) => ((ind && ind.torneos) || []).find((x) => x.id === id) || null;

  /* Cada operación devuelve un plan: pasos en orden seguro que se pueden repetir (cada uno vuelve a leer lo que necesita). */
  const paso = (txt, fn) => ({ txt, fn });
  const pasoIndice = (clave, mensaje, nuevo) => paso(`Actualizar indice.json (${clave === 'web' ? 'web' : 'borradores'})`, async () => {
    const i = await leer(clave, 'datos/indice.json');
    await poner(clave, 'datos/indice.json', C().aTexto(nuevo(i && i.json)), mensaje);
  });
  const pasosCopiar = (a, archivos, mensaje) => archivos.map((x) => paso(`Copiar ${x.nombre} a ${a === 'web' ? 'la web' : 'borradores'}`, () => poner(a, x.ruta, x.texto, mensaje)));
  const pasosBorrar = (clave, id, nombres, mensaje) => nombres.slice().sort((x, y) => ordenArchivos(y, x)) // actual.json primero: si queda algo a medias, nadie ve datos sueltos
    .map((n) => paso(`Borrar ${n} de ${clave === 'web' ? 'la web' : 'borradores'}`, () => quitar(clave, `datos/${id}/${n}`, mensaje)));

  /* Borrador → web: primero los datos, al final el índice. El borrador se queda donde estaba. */
  async function planPublicarBorrador(id) {
    const t = await leerTorneo('borr', id);
    if (!t) throw new ErrorGH(0, 'Ese borrador no tiene archivos en campeonatos-borradores.', 'borr');
    const ind = await leer('borr', 'datos/indice.json');
    const entrada = entradaDe(ind && ind.json, id);
    if (!entrada) throw new ErrorGH(0, 'Ese borrador no está en el índice de borradores, así que no sé cómo apuntarlo en la web.', 'borr');
    const msg = `Publicar borrador ${id}`;
    return { otros: t.otros, archivos: t.archivos.length, entrada, pasos: [
      ...pasosCopiar('web', t.archivos, msg),
      pasoIndice('web', msg, (i) => C().indiceCon(i, entrada, ahora())),
    ] };
  }

  /* Web → borradores. Orden: 1) copia a borradores (datos, luego su índice); 2) quita la entrada del índice de la web;
     3) borra los archivos de la web. Así la portada pública nunca apunta a archivos que no existen. */
  async function planOcultar(id) {
    const t = await leerTorneo('web', id);
    if (!t) throw new ErrorGH(0, 'Ese torneo no tiene archivos en la web.', 'web');
    const ind = await leer('web', 'datos/indice.json');
    const entrada = entradaDe(ind && ind.json, id);
    if (!entrada) throw new ErrorGH(0, 'Ese torneo no está en el índice de la web.', 'web');
    const msg = `Ocultar ${id}`;
    return { otros: t.otros, normativa: t.normativa, archivos: t.archivos.length, pasos: [
      ...pasosCopiar('borr', t.archivos, msg),
      pasoIndice('borr', msg, (i) => C().indiceCon(i, entrada, ahora())),
      pasoIndice('web', msg, (i) => C().indiceSin(i, id, ahora())),
      ...pasoQuitarNormativa('web', id, t.normativa, msg),
      ...pasosBorrar('web', id, t.archivos.map((x) => x.nombre), msg),
    ] };
  }

  /* Borra un torneo de un repositorio: primero lo quita del índice, luego borra sus archivos. */
  async function planEliminar(clave, id) {
    const dir = await archivosDe(clave, id);
    const msg = `Eliminar ${id}`;
    return { otros: dir ? dir.otros : [], normativa: !!(dir && dir.normativa), archivos: dir ? dir.nombres.length : 0, pasos: [
      pasoIndice(clave, msg, (i) => C().indiceSin(i, id, ahora())),
      ...pasoQuitarNormativa(clave, id, dir && dir.normativa, msg),
      ...pasosBorrar(clave, id, dir ? dir.nombres : [], msg),
    ] };
  }

  /* Cambia nombre, temporada y estado (en actual.json y en indice.json) y el orden en la portada (solo indice.json). Primero los datos, al final el índice. */
  const TEMPORADA_OK = /^\d{4}(-\d{2}(\d{2})?)?$/;
  function validarEdicion(c) {
    const nombre = String(c.nombre == null ? '' : c.nombre).trim();
    if (nombre.length < 3 || nombre.length > 120 || /[\u0000-\u001f]/.test(nombre)) return 'El nombre tiene que tener entre 3 y 120 caracteres.';
    const temp = String(c.temporada == null ? '' : c.temporada).trim();
    if (temp && !TEMPORADA_OK.test(temp)) return 'La temporada se escribe como 2026-2027 o 2026-27 (o se deja vacía).';
    if (!['en_juego', 'proximo', 'terminado'].includes(c.estado)) return 'El estado tiene que ser en juego, próximo o terminado.';
    if (!Number.isInteger(c.orden) || c.orden < 1 || c.orden > 999) return 'El puesto en la portada es un número entero desde 1.';
    return null;
  }
  async function planEditar(clave, id, c) {
    exigirId(id);
    const fallo = validarEdicion(c);
    if (fallo) throw new ErrorGH(0, fallo, clave);
    const a = await leer(clave, `datos/${id}/actual.json`);
    if (!a || !a.json.torneo) throw new ErrorGH(0, `No encuentro datos/${id}/actual.json.`, clave);
    const nuevo = { nombre: String(c.nombre).trim(), temporada: String(c.temporada || '').trim() || null, estado: c.estado, orden: c.orden };
    const primero = (a.json.clasificacion || []).find((x) => x.grupo === 'A' && x.puesto === 1);
    const p = primero && (a.json.participantes || []).find((x) => x.id === primero.id);
    nuevo.ganador = p ? { id: p.id, corto: p.corto } : null;
    const act = JSON.parse(a.texto);
    Object.assign(act.torneo, { nombre: nuevo.nombre, temporada: nuevo.temporada, estado: nuevo.estado });
    const msg = `Editar ${id}`;
    return { otros: [], archivos: 1, pasos: [
      paso('Guardar actual.json', () => poner(clave, `datos/${id}/actual.json`, C().aTexto(act), msg)),
      pasoIndice(clave, msg, (i) => C().indiceEditado(i, id, nuevo, ahora())),
    ] };
  }

  /* ---------- normativa (PDF cifrado) ---------- */
  const pasoQuitarNormativa = (clave, id, hay, msg) => (hay ? [paso(`Borrar ${NORMATIVA} de ${clave === 'web' ? 'la web' : 'borradores'}`, () => quitar(clave, `datos/${id}/${NORMATIVA}`, msg))] : []);
  const esPdf = (u) => u.length > 4 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46; // %PDF
  function planNormativa(id, bytes) {
    exigirId(id);
    if (!esPdf(bytes)) throw new ErrorGH(0, 'Ese archivo no es un PDF. Elige el PDF de la normativa.', 'web');
    if (bytes.length > MAX_PDF) throw new ErrorGH(0, `Ese PDF pesa ${Math.round(bytes.length / 1048576)} MB; el máximo son ${MAX_PDF / 1048576} MB.`, 'web');
    if (!CL.clave) throw sinClave();
    return { pasos: [paso(`Cifrar y subir ${NORMATIVA}`, async () => ponerTal('web', `datos/${id}/${NORMATIVA}`, JSON.stringify(await Cifra.cifrar(CL.clave, bytes)) + '\n', `Normativa ${id}`))] };
  }
  const planQuitarNormativa = (id) => { exigirId(id); return { pasos: pasoQuitarNormativa('web', id, true, `Quitar normativa ${id}`) }; };

  /* ---------- cifrar lo publicado ---------- */
  /* Vuelve a cifrar todo lo publicado con `nueva` ({ json, clave }): para estrenar contraseña (los archivos están en claro), para cambiarla
     y para «Cifrar lo publicado» (nueva = la de ahora). Orden: los datos de cada torneo, después indice.json y al final clave.json,
     así la web cambia de contraseña de golpe. Cada paso mira el archivo al momento: si ya va con la clave nueva, no lo toca; por eso se puede repetir. */
  async function planRecifrar(nueva) {
    const cambia = !CL.cj || CL.cj.sal !== nueva.json.sal;
    if (!cambia && !CL.clave) throw sinClave();
    const raizDatos = (await listar('web', 'datos')) || [];
    const rutas = [];
    for (const d of raizDatos.filter((x) => x.type === 'dir' && ID_OK.test(x.name))) {
      for (const f of (await listar('web', `datos/${d.name}`)) || []) if (f.type === 'file' && (ARCHIVO_DATOS.test(f.name) || f.name === NORMATIVA)) rutas.push(`datos/${d.name}/${f.name}`);
    }
    if (raizDatos.some((x) => x.type === 'file' && x.name === 'indice.json')) rutas.push('datos/indice.json');
    const msg = !CL.cj ? 'Poner contraseña a la web' : cambia ? 'Cambiar la contraseña de la web' : 'Cifrar lo publicado';
    const pasos = rutas.map((r) => paso(`Cifrar ${r.slice(6)}`, () => recifrar(r, nueva.clave, msg)));
    if (cambia) {
      pasos.push(paso('Subir clave.json (la web cambia de contraseña)', () => ponerTal('web', CLAVE_JSON, JSON.stringify(nueva.json, null, 1) + '\n', msg)));
      pasos.push(paso('Guardar la clave nueva en este navegador', async () => { await Cifra.guardarClave('datos', nueva.clave, true); Cifra.olvidarPendiente(); Object.assign(CL, { cj: nueva.json, clave: nueva.clave, pendiente: null }); }));
    }
    return { pasos, archivos: rutas.length, cambia };
  }
  async function recifrar(ruta, k, msg) {
    for (let intento = 0; ; intento++) {
      const f = await leerArchivo('web', ruta);
      if (!f) return;
      let bytes;
      if (Cifra.esSobreTexto(f.texto)) {
        const s = JSON.parse(f.texto);
        try { await Cifra.descifrar(k, s); return; } catch (e) { /* aún con la clave de antes */ }
        bytes = await abrirSobre(s, ruta);
      } else if (ruta.endsWith('.json')) bytes = new TextEncoder().encode(f.texto); // JSON en claro de antes de la contraseña
      else throw new ErrorGH(0, `${ruta} no es un archivo cifrado.`, 'web');
      try { return await escribir('web', ruta, JSON.stringify(await Cifra.cifrar(k, bytes)) + '\n', f.sha, msg); } catch (e) { if (!choque(e) || intento) throw e; }
    }
  }
  /* Un cambio de contraseña empieza guardando la clave nueva en este navegador: si la página se cierra a medias, se puede terminar. */
  async function planCifrarPublicado() { if (!CL.cj || !CL.clave) throw sinClave(); return planRecifrar({ json: CL.cj, clave: CL.clave }); }
  async function empezarCambio(nueva) { CL.pendiente = nueva; await Cifra.guardarPendiente(nueva); }

  /* Ejecuta los pasos en orden. Si uno falla, devuelve lo hecho y lo que queda para poder repetirlo. */
  async function ejecutar(pasos, alAnotar) {
    const hechos = [];
    for (let i = 0; i < pasos.length; i++) {
      try { await pasos[i].fn(); } catch (error) { return { hechos, pendientes: pasos.slice(i), error }; }
      hechos.push(pasos[i].txt);
      if (alAnotar) alAnotar(pasos[i].txt);
    }
    return { hechos, pendientes: [], error: null };
  }

  /* Carpetas de datos/ de la web que no salen en la portada (restos de un ocultar o un eliminar a medias). */
  async function restosWeb(indice) {
    const dirs = await listar('web', 'datos');
    return (dirs || []).filter((x) => x.type === 'dir' && ID_OK.test(x.name) && !entradaDe(indice, x.name)).map((x) => x.name);
  }

  const Mesa = { REPOS, AUTOR, ID_OK, RUTA_OK, MAX_PDF, token, ErrorGH, llamar, acceso, leer, listar, escribir, borrar, poner, quitar, archivosDe, leerTorneo, entradaDe,
    planPublicarBorrador, planOcultar, planEliminar, planEditar, validarEdicion, ejecutar, restosWeb, ahora,
    estadoClave, abrirClave, olvidarClave, planRecifrar, planCifrarPublicado, empezarCambio, planNormativa, planQuitarNormativa, get pendiente() { return CL.pendiente; }, get claveJson() { return CL.cj; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = Mesa; else raiz.Mesa = Mesa;
})(typeof window !== 'undefined' ? window : globalThis);
