/* Cifrado de lo publicado (SECURITY.md): WebCrypto, sin librerías.
   Clave = PBKDF2-SHA-256 (600 000 iteraciones, sal aleatoria de 16 bytes) de la contraseña → AES-256-GCM con IV aleatorio de 12 bytes por archivo.
   datos/clave.json es público: versión, sal, iteraciones y un verificador cifrado. Nunca lleva la contraseña ni la clave.
   Cada archivo publicado es un sobre {v, iv, ct} en base64. En el dispositivo se guarda la clave derivada, nunca la contraseña. */
(function (raiz) {
  'use strict';
  const sutil = raiz.crypto.subtle;
  const ITERACIONES = 600000, MIN_CARACTERES = 14, VERIFICADOR = 'tu mesa: contraseña correcta';
  const ALMACEN = 'tumesa.clave';

  const aB64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const deB64 = (b) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const azar = (n) => raiz.crypto.getRandomValues(new Uint8Array(n));
  const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

  const esSobre = (o) => !!o && typeof o === 'object' && !Array.isArray(o) && o.v === 1 && typeof o.iv === 'string' && typeof o.ct === 'string' && B64.test(o.iv) && B64.test(o.ct) && Object.keys(o).length === 3;
  function esSobreTexto(t) { try { return esSobre(JSON.parse(t)); } catch (e) { return false; } }

  async function derivar(contrasena, sal, iteraciones) {
    const base = await sutil.importKey('raw', new TextEncoder().encode(contrasena.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return sutil.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function cifrar(clave, bytes) {
    const iv = azar(12);
    const ct = new Uint8Array(await sutil.encrypt({ name: 'AES-GCM', iv }, clave, bytes));
    return { v: 1, iv: aB64(iv), ct: aB64(ct) };
  }
  async function descifrar(clave, sobre) {
    if (!esSobre(sobre)) throw new Error('No es un archivo cifrado.');
    return new Uint8Array(await sutil.decrypt({ name: 'AES-GCM', iv: deB64(sobre.iv) }, clave, deB64(sobre.ct)));
  }
  const cifrarTexto = (clave, t) => cifrar(clave, new TextEncoder().encode(t));
  const descifrarTexto = async (clave, s) => new TextDecoder('utf-8', { fatal: true }).decode(await descifrar(clave, s));

  async function crearClaveJson(contrasena) {
    const sal = azar(16);
    const clave = await derivar(contrasena, sal, ITERACIONES);
    return { clave, json: { version: 1, kdf: 'PBKDF2-SHA-256', iteraciones: ITERACIONES, sal: aB64(sal), verificador: await cifrarTexto(clave, VERIFICADOR) } };
  }
  async function comprobar(clave, cj) {
    try { return (await descifrarTexto(clave, cj.verificador)) === VERIFICADOR; } catch (e) { return false; }
  }
  const claveJsonValido = (cj) => !!cj && cj.version === 1 && cj.kdf === 'PBKDF2-SHA-256' && Number.isInteger(cj.iteraciones) && cj.iteraciones >= ITERACIONES && typeof cj.sal === 'string' && B64.test(cj.sal) && esSobre(cj.verificador);
  /* Contraseña → clave, o null si no es la buena (o si clave.json no vale). */
  async function abrir(contrasena, cj) {
    if (!claveJsonValido(cj) || !contrasena) return null;
    const clave = await derivar(contrasena, deB64(cj.sal), cj.iteraciones);
    return (await comprobar(clave, cj)) ? clave : null;
  }
  const exportar = async (clave) => aB64(new Uint8Array(await sutil.exportKey('raw', clave)));
  const importar = (b64) => sutil.importKey('raw', deB64(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);

  /* ---------- frase propuesta ---------- */
  const lista = () => raiz.Palabras || (typeof require === 'function' ? require('./palabras.js') : []);
  function alAzar(n) { // entero uniforme en [0, n), sin sesgo
    const tope = Math.floor(0x100000000 / n) * n, u = new Uint32Array(1);
    do raiz.crypto.getRandomValues(u); while (u[0] >= tope);
    return u[0] % n;
  }
  const frase = () => { const l = lista(); return Array.from({ length: 5 }, () => l[alAzar(l.length)]).join(' '); };
  const contrasenaValida = (c) => typeof c === 'string' && c === c.trim() && c.length >= MIN_CARACTERES;

  /* ---------- la clave en este dispositivo ---------- */
  // «Recordar»: localStorage. Si no: sessionStorage (se borra al cerrar la pestaña). `nombre` separa los datos de prueba de los reales.
  const almacenes = () => { const r = []; try { r.push(raiz.localStorage); } catch (e) { /* bloqueado */ } try { r.push(raiz.sessionStorage); } catch (e) { /* bloqueado */ } return r.filter(Boolean); };
  const nombreDe = (base) => ALMACEN + (base && base !== 'datos' ? ':' + base : '');
  async function guardarClave(base, clave, recordar) {
    const v = await exportar(clave);
    olvidarClave(base);
    try { (recordar ? raiz.localStorage : raiz.sessionStorage).setItem(nombreDe(base), v); return true; } catch (e) { return false; }
  }
  async function cargarClave(base) {
    for (const a of almacenes()) { const v = a.getItem(nombreDe(base)); if (v) { try { return await importar(v); } catch (e) { a.removeItem(nombreDe(base)); } } }
    return null;
  }
  function olvidarClave(base) { for (const a of almacenes()) a.removeItem(nombreDe(base)); }
  const hayClaveGuardada = (base) => almacenes().some((a) => a.getItem(nombreDe(base)));
  // Cambio de contraseña a medias (solo la mesa): la clave nueva y su clave.json se guardan hasta terminar, para poder acabarlo tras cerrar la página.
  const PENDIENTE = ALMACEN + '.pendiente';
  async function guardarPendiente(n) { try { localStorage.setItem(PENDIENTE, JSON.stringify({ cj: n.json, k: await exportar(n.clave) })); return true; } catch (e) { return false; } }
  async function cargarPendiente() {
    try { const p = JSON.parse(localStorage.getItem(PENDIENTE)); return p && claveJsonValido(p.cj) ? { json: p.cj, clave: await importar(p.k) } : null; } catch (e) { return null; }
  }
  function olvidarPendiente() { try { localStorage.removeItem(PENDIENTE); } catch (e) { /* nada */ } }

  // «Quién eres» (pestaña Resumen): solo el número de pareja o jugador, uno por campeonato. Nunca nombres. Si el navegador lo impide, no pasa nada.
  const QUIEN = 'tumesa.quien:';
  function quienGuardado(torneo) { try { const v = raiz.localStorage.getItem(QUIEN + torneo); return /^\d{1,3}$/.test(v) ? +v : null; } catch (e) { return null; } }
  function guardarQuien(torneo, id) { try { raiz.localStorage.setItem(QUIEN + torneo, String(+id)); return true; } catch (e) { return false; } }
  function olvidarQuien(torneo) { try { raiz.localStorage.removeItem(QUIEN + torneo); } catch (e) { /* nada */ } }

  const Cifra = { ITERACIONES, MIN_CARACTERES, esSobre, esSobreTexto, cifrar, descifrar, cifrarTexto, descifrarTexto, crearClaveJson, abrir, comprobar, claveJsonValido,
    exportar, importar, frase, contrasenaValida, guardarClave, cargarClave, olvidarClave, hayClaveGuardada, quienGuardado, guardarQuien, olvidarQuien, guardarPendiente, cargarPendiente, olvidarPendiente, get PALABRAS() { return lista(); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = Cifra; else raiz.Cifra = Cifra;
})(typeof window !== 'undefined' ? window : globalThis);
