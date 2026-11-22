// API de contenidos de GitHub simulada para los tres repositorios de la mesa de control (web, borradores y programas-domino).
// puts y log: escrituras en campeonatos-domino y borradores; putsProg y logProg: escrituras en programas-domino (copias de los originales y DESCARGAS.md).
// Uso: const api = await instalar(contexto, opciones); api.repos.web / api.repos.borr / api.repos.prog son Map(ruta -> {sha, texto, plano}). En prog, `texto` puede ser un Buffer (archivos binarios).
// `texto` es lo que hay de verdad en el repositorio (en la web, sobres cifrados); `plano` es lo descifrado con las claves que la prueba conoce,
// para poder comprobar el contenido (api.json). Cada PUT a la web que no va cifrado queda en api.enClaro.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const K = require('./cripto_prueba.cjs');
const raiz = path.join(__dirname, '..');
const DATOS = path.join(__dirname, 'datos'); // los JSON inventados, en claro
// Contraseña de la web simulada (la de datos/_prueba es otra). Se deriva una sola vez.
const CONTRASENA_WEB = 'contraseña de la web simulada';
const WEB = K.claveJson(CONTRASENA_WEB);
const CLAVE_WEB_B64 = WEB.clave.toString('base64');
const MAX_CONTENIDO = 1000000; // como GitHub: un archivo de más de 1 MB no trae «content» y hay que pedir el blob
const NOMBRES = { 'campeonatos-domino': 'web', 'campeonatos-borradores': 'borr', 'programas-domino': 'prog' };
const OTROS = { web: 'campeonatos-domino', borr: 'campeonatos-borradores', prog: 'programas-domino' };
const TOKEN = 'ghp_TOKEN_DE_PRUEBA';

// Copia un torneo de pruebas/datos a un repositorio simulado (sin Excel: solo JSON) y lo apunta en su índice.
// En la web va cifrado con la clave de la web simulada, salvo con { enClaro: true } (la web de antes de cifrar). { normativa: true } sube también su PDF cifrado.
function sembrar(api, clave, id, op = {}) {
  const dir = path.join(DATOS, id);
  const poner = (r, t) => (clave === 'web' && !op.enClaro ? api.ponerCifrado(r, t) : api.poner(clave, r, t));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) poner(`datos/${id}/${f}`, fs.readFileSync(path.join(dir, f), 'utf8'));
  if (op.normativa) api.ponerCifrado(`datos/${id}/normativa.pdf.cifrado`, fs.readFileSync(path.join(DATOS, 'sp-ejemplo/normativa.pdf')));
  const act = JSON.parse(fs.readFileSync(path.join(dir, 'actual.json'), 'utf8'));
  const t = act.torneo;
  const ind = JSON.parse(fs.readFileSync(path.join(DATOS, 'indice.json'), 'utf8')).torneos.find((x) => x.id === id)
    || { id, nombre: t.nombre, tipo: t.tipo, temporada: t.temporada, fecha: t.fecha, estado: t.estado, jornada_actual: act.jornada.numero, n_jornadas: t.n_jornadas, n_participantes: t.n_participantes, ganador: null };
  const base = api.json(clave, 'datos/indice.json') || { version: '1.0', publicado: '2026-01-01T00:00:00Z', torneos: [] };
  base.torneos.push(ind);
  poner('datos/indice.json', JSON.stringify(base, null, 1) + '\n');
}

async function instalar(ctx, opciones = {}) {
  const api = {
    repos: { web: new Map(), borr: new Map(), prog: new Map() },
    puts: [], putsProg: [], dels: [], reqs: [], log: [], logProg: [], violaciones: [], // log: 'PUT clave ruta' / 'DELETE clave ruta' en orden; violaciones: veces que la web pública apuntó a archivos que no existían
    acceso: { web: true, borr: true, prog: true, ...(opciones.acceso || {}) }, // false: GitHub contesta 404, como con un token sin ese repositorio
    soloLectura: { web: false, borr: false, prog: false },
    token: TOKEN,
    fallar: null, // (metodo, clave, ruta) => estado HTTP o null
    n: 0,
    contrasenas: [CONTRASENA_WEB], claves: [WEB.clave], // las que la prueba conoce; la última es la de ahora
    enClaro: [], // PUT a la web que no iban cifrados (tiene que quedar vacío)
    conocer(c) { this.contrasenas.push(c); }, // una contraseña que la prueba va a poner: al subir su clave.json, la simulación aprende la clave
    clave() { return this.claves[this.claves.length - 1]; },
    // Qué clave abre un archivo de la web: su posición en api.claves, 'claro' si no va cifrado o null si ninguna.
    cifradoCon(ruta) {
      const f = this.repos.web.get(ruta); if (!f) return undefined;
      if (!K.esSobre(f.texto)) return 'claro';
      const s = JSON.parse(f.texto); const i = this.claves.findIndex((k) => K.descifrar(k, s)); return i < 0 ? null : i;
    },
    descifrar(texto) { if (!K.esSobre(texto)) return null; const s = JSON.parse(texto); for (const k of this.claves) { const p = K.descifrar(k, s); if (p) return p; } return null; },
    poner(clave, ruta, texto) {
      const sha = crypto.createHash('sha1').update(String(++this.n)).digest('hex');
      const plano = clave === 'web' && ruta !== 'datos/clave.json' ? this.descifrar(texto) : null;
      this.repos[clave].set(ruta, { sha, texto, plano });
    },
    ponerCifrado(ruta, datos) { this.poner('web', ruta, K.sobreTexto(this.clave(), datos) + '\n'); },
    // Descifrado perezoso: un archivo escrito con una clave que la simulación aún no conocía se abre en cuanto la aprende.
    plano(clave, f) { if (!f.plano && clave === 'web') f.plano = this.descifrar(f.texto); return f.plano; },
    json(clave, ruta) { const f = this.repos[clave].get(ruta); if (!f) return null; const p = this.plano(clave, f); return JSON.parse(p ? p.toString('utf8') : f.texto); },
    bytes(clave, ruta) { const f = this.repos[clave].get(ruta); return f ? (this.plano(clave, f) || Buffer.from(f.texto, 'utf8')) : null; },
    // Al subir un clave.json nuevo, aprende su clave si es de una contraseña conocida.
    aprender(cj) { for (const c of this.contrasenas) { const k = K.abrir(c, cj); if (k && !this.claves.some((x) => x.equals(k))) { this.claves.push(k); return; } } },
    // La web pública nunca debe apuntar a algo que no existe: cada torneo del índice tiene su actual.json y cada actual.json tiene las jornadas que lista.
    revisar(donde) {
      const w = this.repos.web, ind = w.get('datos/indice.json');
      if (!ind) return;
      const ij = this.json('web', 'datos/indice.json');
      if (!ij || !ij.torneos) return; // con una clave que la simulación aún no conoce
      for (const t of ij.torneos) {
        const a = w.get(`datos/${t.id}/actual.json`);
        if (!a) { this.violaciones.push(`${donde}: ${t.id} está en indice.json y no tiene actual.json`); continue; }
        for (const j of this.json('web', `datos/${t.id}/actual.json`).jornadas || []) if (!w.has(`datos/${t.id}/jornada_${String(j.numero).padStart(2, '0')}.json`)) this.violaciones.push(`${donde}: actual.json de ${t.id} lista la jornada ${j.numero} y no existe`);
      }
    },
    rutas(clave) { return [...this.repos[clave].keys()].sort(); },
  };
  if (!opciones.sinClave) api.poner('web', 'datos/clave.json', JSON.stringify(WEB.json, null, 1) + '\n');
  const buf = (t) => (Buffer.isBuffer(t) ? t : Buffer.from(t, 'utf8'));
  const enc = (t) => buf(t).toString('base64').replace(/(.{60})/g, '$1\n');
  await ctx.route('https://api.github.com/**', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    const metodo = req.method();
    api.reqs.push({ metodo, ruta: u.pathname, auth: req.headers().authorization });
    if (req.headers().authorization !== 'Bearer ' + api.token) return route.fulfill({ status: 401, body: '{"message":"Bad credentials"}' });
    const m = /^\/repos\/JUGUEMOSDOMINO\/([^/]+)(?:\/contents\/(.*)|\/git\/blobs\/([0-9a-f]{40})|\/git\/trees\/(main))?$/.exec(u.pathname);
    const clave = m && NOMBRES[m[1]];
    if (!clave || !api.acceso[clave]) return route.fulfill({ status: 404, body: '{"message":"Not Found"}' });
    if (m[3]) {
      const f = [...api.repos[clave].values()].find((x) => x.sha === m[3]);
      return f ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: f.sha, encoding: 'base64', content: enc(f.texto) }) }) : route.fulfill({ status: 404, body: '{}' });
    }
    if (m[4]) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ truncated: false, tree: [...api.repos[clave]].map(([r, f]) => ({ path: r, type: 'blob', sha: f.sha, size: buf(f.texto).length })) }) });
    if (!m[2]) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: m[1], permissions: { push: !api.soloLectura[clave] } }) });
    const ruta = decodeURIComponent(m[2]);
    const forzado = api.fallar && api.fallar(metodo, clave, ruta);
    if (forzado) return route.fulfill({ status: forzado, body: '{"message":"error simulado"}' });
    const repo = api.repos[clave];
    if (metodo === 'GET') {
      const f = repo.get(ruta);
      if (f && buf(f.texto).length > MAX_CONTENIDO) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'file', path: ruta, sha: f.sha, size: buf(f.texto).length, encoding: 'none', content: '' }) });
      if (f) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'file', path: ruta, sha: f.sha, content: enc(f.texto) }) });
      const hijos = new Map();
      for (const [r, v] of repo) if (r.startsWith(ruta + '/')) { const nombre = r.slice(ruta.length + 1).split('/')[0]; const esDir = r.slice(ruta.length + 1).includes('/'); if (!hijos.has(nombre)) hijos.set(nombre, { name: nombre, path: ruta + '/' + nombre, type: esDir ? 'dir' : 'file', sha: v.sha }); }
      if (hijos.size) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...hijos.values()]) });
      return route.fulfill({ status: 404, body: '{"message":"Not Found"}' });
    }
    const c = JSON.parse(req.postData());
    const f = repo.get(ruta);
    if (metodo === 'PUT') {
      if (f && c.sha !== f.sha) return route.fulfill({ status: 409, body: '{}' });
      if (!f && c.sha) return route.fulfill({ status: 422, body: '{}' });
      const bytes = Buffer.from(c.content, 'base64'), texto = clave === 'prog' ? bytes : bytes.toString('utf8');
      if (clave === 'web') {
        let valido = K.esSobre(texto);
        if (ruta === 'datos/clave.json') { try { const cj = JSON.parse(texto); valido = cj.version === 1 && K.esSobre(JSON.stringify(cj.verificador)) && !texto.includes(api.contrasenas[api.contrasenas.length - 1]); if (valido) api.aprender(cj); } catch (e) { valido = false; } }
        if (!valido) api.enClaro.push(ruta);
      }
      api.poner(clave, ruta, texto);
      (clave === 'prog' ? api.logProg : api.log).push('PUT ' + clave + ' ' + ruta);
      (clave === 'prog' ? api.putsProg : api.puts).push({ clave, ruta, mensaje: c.message, rama: c.branch, author: c.author, committer: c.committer }); // putsProg: lo que va a programas-domino (copias y DESCARGAS.md)
      if (clave === 'web') api.revisar('tras escribir ' + ruta);
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"content":{},"commit":{}}' });
    }
    if (metodo === 'DELETE') {
      if (!f) return route.fulfill({ status: 404, body: '{}' });
      if (c.sha !== f.sha) return route.fulfill({ status: 409, body: '{}' });
      repo.delete(ruta);
      (clave === 'prog' ? api.logProg : api.log).push('DELETE ' + clave + ' ' + ruta);
      api.dels.push({ clave, ruta, mensaje: c.message, rama: c.branch, author: c.author, committer: c.committer });
      if (clave === 'web') api.revisar('tras borrar ' + ruta);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"commit":{}}' });
    }
    return route.fulfill({ status: 405, body: '{}' });
  });
  return api;
}

// Guarda en el navegador la clave de la web simulada, como si la mesa ya hubiera escrito la contraseña.
const recordarWeb = (ctx) => ctx.addInitScript((k) => { if (!localStorage.getItem('tumesa.clave') && !sessionStorage.getItem('sin-clave')) localStorage.setItem('tumesa.clave', k); }, CLAVE_WEB_B64);

module.exports = { instalar, sembrar, recordarWeb, TOKEN, OTROS, CONTRASENA_WEB, CLAVE_WEB_B64, WEB };
