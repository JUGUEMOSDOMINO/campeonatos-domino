// Prueba de la mesa de control (publicar.html y torneo.html?borrador=1) en un navegador (Playwright), con una API de GitHub simulada para los dos repositorios.
// Uso: node pruebas/probar_publicar.cjs [url-base, por defecto http://localhost:8765]
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { instalar, recordarWeb, TOKEN, CONTRASENA_WEB } = require('./api_simulada.cjs');
const K = require('./cripto_prueba.cjs');
const base = process.argv[2] || 'http://localhost:8765';
const raiz = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tumesa-pub-'));
const xlsx = (id, nombre) => { const f = path.join(tmp, nombre || id + '.xlsx'); execFileSync('python3', [path.join(__dirname, 'hacer_xlsx.py'), path.join(__dirname, 'datos', id, 'actual.json'), f]); return f; };
const leerJson = (r) => JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', r), 'utf8'));
const sinPub = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.publicado; return c; };


const NOREPLY = { name: 'Mesa de control', email: '356692983+JUGUEMOSDOMINO@users.noreply.github.com' };
const vacio = () => JSON.stringify({ version: '1.0', publicado: '2026-01-01T00:00:00Z', torneos: [] }, null, 1) + '\n';
const hora = (iso) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace(',', '');

(async () => {
  const b = await chromium.launch();
  let ok = 0; const bien = (t) => { ok++; console.log('  ok  ' + t); };
  const abiertos = [], externos = [], apis = [];
  // Cada escenario es un navegador limpio con su propio repositorio simulado.
  async function escenario({ semilla, token = true, acceso, clave = true, sinClave = false } = {}) {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, timezoneId: 'Europe/Madrid', locale: 'es-ES', acceptDownloads: true });
    const api = await instalar(ctx, { acceso, sinClave });
    apis.push(api);
    if (clave) await recordarWeb(ctx); // la contraseña de la web ya está escrita en este navegador
    await K.recordarPrueba(ctx); // y la de datos/_prueba, para ver la web de prueba
    if (semilla) semilla(api);
    if (token) await ctx.addInitScript((t) => { if (!localStorage.getItem('tumesa.token') && !sessionStorage.getItem('sin-token')) localStorage.setItem('tumesa.token', t); }, TOKEN);
    ctx.on('request', (r) => { const u = new URL(r.url()); if (!['data:', 'blob:'].includes(u.protocol) && u.origin !== new URL(base).origin && u.origin !== 'https://api.github.com') externos.push(r.url()); });
    const pg = await ctx.newPage();
    const errores = []; pg.on('pageerror', (e) => errores.push(e.message));
    pg.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && errores.push('consola: ' + m.text()));
    await pg.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    abiertos.push(ctx);
    return { ctx, pg, api, errores };
  }
  const sembrarWeb = (api) => { api.ponerCifrado('datos/indice.json', vacio()); sembrar(api, 'web', 'sp-ejemplo'); };
  const { sembrar } = require('./api_simulada.cjs');
  const abrir = async (pg) => { await pg.goto(base + '/publicar.html'); await pg.waitForSelector('#lista-web[data-listo]'); await pg.waitForSelector('#lista-borr[data-listo]'); };
  const nombres = (pg, lista) => pg.$$eval(`#lista-${lista} li.torneo`, (l) => l.map((x) => x.dataset.id));

  /* ============ 1. Token y lista de torneos ============ */
  {
    const { pg, api, errores } = await escenario({ token: false, semilla: (a) => { sembrarWeb(a); sembrar(a, 'borr', 'parejas-ejemplo-2026-11-14'); } });
    await pg.goto(base + '/publicar.html');
    await pg.waitForSelector('#token');
    const aviso = await pg.textContent('#token-estado');
    assert(/campeonatos-domino, campeonatos-borradores y programas-domino/.test(aviso) && /Contents: Read and write/.test(aviso) && /ningún chat ni correo/.test(aviso), aviso);
    bien('paso 1: el aviso del token nombra los tres repositorios, con «Contents: Read and write» y el aviso de no pegarlo en chats ni correos');
    await pg.fill('#token', 'ghp_MAL'); await pg.click('text=Guardar y comprobar');
    await pg.waitForSelector('text=GitHub no acepta el token');
    bien('token incorrecto: mensaje en lenguaje llano');
    await pg.fill('#token', TOKEN); await pg.click('text=Guardar y comprobar');
    await pg.waitForSelector('text=Hay un token guardado');
    assert.strictEqual(await pg.evaluate(() => localStorage.getItem('tumesa.token')), TOKEN);
    bien('token guardado en localStorage');
    assert(api.reqs.some((r) => r.ruta === '/repos/JUGUEMOSDOMINO/campeonatos-domino') && api.reqs.some((r) => r.ruta === '/repos/JUGUEMOSDOMINO/campeonatos-borradores'));
    bien('al guardar, el token se comprueba contra los dos repositorios');
    await pg.waitForSelector('#lista-web[data-listo]'); await pg.waitForSelector('#lista-borr[data-listo]');
    assert.deepStrictEqual(await nombres(pg, 'web'), ['sp-ejemplo']);
    assert.deepStrictEqual(await nombres(pg, 'borr'), ['parejas-ejemplo-2026-11-14']);
    const gr = await pg.$$eval('#paso-torneos h3', (h) => h.map((x) => x.textContent));
    assert.deepStrictEqual(gr, ['En la web', 'Borradores']);
    bien('dos grupos: «En la web» y «Borradores», cada uno con sus torneos');
    const web = await pg.textContent('#lista-web li.torneo');
    assert(web.includes('CAMPEONATO SÚPER-PRESTIGIO DE EJEMPLO') && web.includes('Super-Prestigio') && /Jornada 3 de 14/.test(web) && web.includes(hora('2026-11-14T18:30:00Z')), web);
    const bor = await pg.textContent('#lista-borr li.torneo');
    assert(bor.includes('CAMPEONATO DE PAREJAS DE EJEMPLO') && bor.includes('Parejas') && /Partida 2 de 7/.test(bor) && bor.includes(hora('2026-11-14T18:30:00Z')), bor);
    bien('cada torneo enseña nombre, tipo, jornada publicada y fecha de la última publicación');
    const acc = async (lista) => pg.$$eval(`#lista-${lista} li.torneo:first-child .acciones button, #lista-${lista} li.torneo:first-child .acciones a`, (x) => x.map((e) => e.textContent));
    assert.deepStrictEqual(await acc('web'), ['Ver', 'Editar', 'Subir normativa (PDF)', 'Ocultar', 'Eliminar']);
    assert.deepStrictEqual(await acc('borr'), ['Ver', 'Editar', 'Publicar', 'Eliminar']);
    bien('acciones: web = ver, editar, subir normativa, ocultar, eliminar; borrador = ver, editar, publicar, eliminar');
    assert.strictEqual(await pg.getAttribute('#lista-borr li.torneo a[href*="borrador=1"]', 'href'), 'torneo.html?t=parejas-ejemplo-2026-11-14&borrador=1');
    assert.strictEqual(await pg.getAttribute('#lista-web li.torneo a[href^="torneo.html"]', 'href'), 'torneo.html?t=sp-ejemplo');
    bien('«Ver» abre torneo.html?t=<id>&borrador=1 en borradores y torneo.html?t=<id> en la web');
    assert.deepStrictEqual(errores, []);
  }

  // un nombre con HTML en un JSON se pinta como texto
  {
    const { pg } = await escenario({ semilla: (a) => {
      sembrarWeb(a); sembrar(a, 'borr', 'parejas-ejemplo-2026-11-14');
      const ind = a.json('borr', 'datos/indice.json'); ind.torneos[0].nombre = '<img src=x onerror=alert(1)><b>Hola</b>';
      a.poner('borr', 'datos/indice.json', JSON.stringify(ind));
    } });
    await abrir(pg);
    assert.strictEqual(await pg.$$eval('#lista-borr li.torneo img, #lista-borr li.torneo b', (x) => x.length), 0);
    assert((await pg.textContent('#lista-borr .torneo-nombre')).includes('<img src=x onerror=alert(1)><b>Hola</b>'));
    bien('un nombre con HTML dentro de un JSON se pinta como texto');
  }

  // token sin acceso a campeonatos-borradores: dice qué permiso falta y el resto sigue
  {
    const { pg, api } = await escenario({ acceso: { borr: false }, semilla: sembrarWeb });
    await abrir(pg);
    const msg = await pg.textContent('#lista-borr');
    assert(msg.includes('campeonatos-borradores') && msg.includes('Repository access'), msg);
    assert.deepStrictEqual(await nombres(pg, 'web'), ['sp-ejemplo']);
    assert.strictEqual(api.dels.length + api.puts.length, 0);
    bien('token sin acceso a borradores: el grupo dice que falta «Repository access» y la lista de la web sigue');
    assert.strictEqual(await pg.isDisabled('#paso-torneos .acciones button:text("Ocultar")'), false);
    await pg.setInputFiles('#archivo', xlsx('sp-ejemplo'));
    await pg.waitForSelector('.tabla-caja');
    assert.strictEqual(await pg.isDisabled('input[name=destino][value=borr]'), true);
    assert.strictEqual(await pg.isChecked('input[name=destino][value=web]'), true);
    bien('sin acceso a borradores se puede subir un Excel a la web y la opción «Borrador» queda desactivada');
  }
  {
    const { pg, api } = await escenario({ semilla: sembrarWeb });
    api.soloLectura.borr = true;
    await abrir(pg);
    assert((await pg.textContent('#lista-borr')).includes('Contents: Read and write'));
    bien('token de solo lectura en borradores: avisa de que falta «Contents: Read and write»');
  }

  /* ============ 2. Subir un Excel con destino ============ */
  {
    const { pg, api, errores } = await escenario({ semilla: (a) => { sembrarWeb(a); sembrar(a, 'borr', 'parejas-ejemplo-2026-11-14'); } });
    await abrir(pg);
    await pg.setInputFiles('#archivo', xlsx('sp-ejemplo'));
    await pg.waitForSelector('.tabla-caja');
    assert.strictEqual(await pg.isChecked('input[name=destino][value=web]'), true);
    bien('destino por defecto: Web si el torneo ya está en la web');
    await pg.setInputFiles('#archivo', xlsx('individual-ejemplo-2026-11-14'));
    await pg.waitForSelector('text=CAMPEONATO INDIVIDUAL DE EJEMPLO');
    await pg.waitForSelector('.tabla-caja');
    assert.strictEqual(await pg.isChecked('input[name=destino][value=borr]'), true);
    assert.strictEqual(await pg.textContent('#publicar'), 'Guardar como borrador');
    bien('destino por defecto: Borrador si el torneo es nuevo');
    api.puts.length = 0;
    await pg.click('#publicar'); await pg.waitForSelector('text=Guardado como borrador');
    assert.deepStrictEqual(api.puts.map((p) => p.clave + ' ' + p.ruta), ['borr datos/individual-ejemplo-2026-11-14/jornada_02.json', 'borr datos/individual-ejemplo-2026-11-14/actual.json', 'borr datos/indice.json']);
    for (const p of api.puts) { assert.deepStrictEqual(p.author, NOREPLY); assert.deepStrictEqual(p.committer, NOREPLY); assert.strictEqual(p.rama, 'main'); }
    assert.deepStrictEqual(api.json('web', 'datos/indice.json').torneos.map((t) => t.id), ['sp-ejemplo']);
    assert(!api.rutas('web').some((r) => r.includes('individual')));
    assert.deepStrictEqual(api.json('borr', 'datos/indice.json').torneos.map((t) => t.id), ['parejas-ejemplo-2026-11-14', 'individual-ejemplo-2026-11-14']);
    bien('subir como borrador: escribe datos y, al final, el índice, solo en campeonatos-borradores; la web no cambia');
    await pg.waitForFunction(() => document.querySelectorAll('#lista-borr li.torneo').length === 2);
    bien('la lista de borradores se actualiza tras subir');
    // cambiar el destino vuelve a validar contra el otro repositorio
    await pg.click('input[name=destino][value=web]');
    await pg.waitForFunction(() => document.querySelector('#publicar').textContent === 'Publicar en la web');
    assert.strictEqual(await pg.isDisabled('#publicar'), false);
    bien('al cambiar el destino a Web, el botón cambia de texto y se vuelve a validar');
    assert.deepStrictEqual(errores, []);
  }

  /* ============ 3. Ver un borrador ============ */
  {
    const { pg, api, errores } = await escenario({ semilla: (a) => { sembrarWeb(a); sembrar(a, 'borr', 'parejas-ejemplo-2026-11-14'); } });
    const externos = []; pg.on('request', (r) => { const u = new URL(r.url()); if (u.origin === new URL(base).origin && /\/datos\//.test(u.pathname)) externos.push(u.pathname); });
    await pg.goto(base + '/torneo.html?t=parejas-ejemplo-2026-11-14&borrador=1');
    await pg.waitForSelector('#cab h1');
    assert.strictEqual(await pg.textContent('#cab h1'), 'CAMPEONATO DE PAREJAS DE EJEMPLO');
    assert((await pg.textContent('.banda-prueba')).includes('Borrador privado'));
    await pg.waitForSelector('.podio');
    await pg.click('a:text("Partidas")'); await pg.waitForSelector('.mesa');
    assert(pg.url().includes('borrador=1'));
    assert.deepStrictEqual(externos, []);
    assert(api.reqs.filter((r) => r.ruta.includes('/contents/datos/')).every((r) => r.ruta.startsWith('/repos/JUGUEMOSDOMINO/campeonatos-borradores/') && r.auth === 'Bearer ' + TOKEN));
    bien('borrador con token: se ve (clasificación y mesas), lee de campeonatos-borradores por la API y no pide nada de datos/ a la web pública');
    assert.deepStrictEqual(errores, []);
    // la web pública sigue leyendo de datos/ sin tocar la API
    const antes = api.reqs.length;
    await pg.goto(base + '/torneo.html?t=sp-ejemplo&d=datos/_prueba'); await pg.waitForSelector('.podio');
    assert.strictEqual(api.reqs.length, antes);
    bien('sin borrador=1 la página no llama a GitHub');
  }
  for (const [caso, opc, preparar] of [
    ['sin token', { token: false }, null],
    ['con un token sin acceso a borradores', { acceso: { borr: false } }, null],
    ['con un token caducado', {}, (api) => { api.token = 'otro'; }],
    ['si el borrador no existe', {}, (api) => { api.repos.borr.clear(); }],
  ]) {
    const { pg, api } = await escenario({ ...opc, semilla: (a) => { sembrar(a, 'borr', 'parejas-ejemplo-2026-11-14'); } });
    if (preparar) preparar(api);
    const antes = api.reqs.length;
    await pg.goto(base + '/torneo.html?t=parejas-ejemplo-2026-11-14&borrador=1');
    await pg.waitForSelector('#contenido .aviso');
    const todo = await pg.textContent('body');
    assert(/borrador privado/.test(todo), caso + ': ' + todo);
    assert.strictEqual(await pg.$$eval('#cab *, table, .mesa', (x) => x.length), 0, caso);
    assert(!todo.includes('PAREJAS DE EJEMPLO'), caso);
    if (caso === 'sin token') assert.strictEqual(api.reqs.length, antes);
    if (caso === 'con un token caducado') assert.strictEqual(await pg.evaluate(() => localStorage.getItem('tumesa.token')), null);
    bien('ver un borrador ' + caso + ': dice que es privado y no enseña nada' + (caso === 'sin token' ? ' (sin llamar a GitHub)' : ''));
  }
  {
    // un borrador con HTML en el nombre sigue siendo texto
    const { pg } = await escenario({ semilla: (a) => {
      sembrar(a, 'borr', 'parejas-ejemplo-2026-11-14');
      const act = a.json('borr', 'datos/parejas-ejemplo-2026-11-14/actual.json'); act.torneo.nombre = '<img src=x onerror=alert(1)>Torneo';
      a.poner('borr', 'datos/parejas-ejemplo-2026-11-14/actual.json', JSON.stringify(act));
    } });
    await pg.goto(base + '/torneo.html?t=parejas-ejemplo-2026-11-14&borrador=1'); await pg.waitForSelector('#cab h1');
    assert.strictEqual(await pg.$$eval('#cab img', (x) => x.length), 0);
    assert.strictEqual(await pg.textContent('#cab h1'), '<img src=x onerror=alert(1)>Torneo');
    bien('borrador con HTML en el nombre: se pinta como texto');
  }

  /* ============ 4. El flujo de siempre, hacia la web ============ */
  const flujo = await escenario({ semilla: (a) => { a.ponerCifrado('datos/indice.json', vacio()); } });
  {
    const { pg, api, errores } = flujo; const repo = api.repos.web; const puts = api.puts;
    const antesPuts = () => puts.filter((p) => p.clave === 'web').map((p) => p.ruta);
    await abrir(pg);

    // Excel sin hoja WEB
    const sinWeb = path.join(tmp, 'sin.xlsx');
    execFileSync('python3', ['-c', `import openpyxl;w=openpyxl.Workbook();w.active.title='INICIO';w.save(r'${sinWeb}')`]);
    await pg.setInputFiles('#archivo', sinWeb);
    await pg.waitForSelector('#lectura :text("No es un archivo que la mesa publique")');
    assert.strictEqual(await pg.textContent('#publicar'), 'Guardar en programas-domino'); assert.strictEqual(await pg.isDisabled('#publicar'), true);
    bien('V01: un Excel sin hoja WEB no es de ningún tipo que se publique: no se publica nada y solo se ofrece guardarlo');
    const txt = path.join(tmp, 'a.txt'); fs.writeFileSync(txt, 'hola');
    await pg.setInputFiles('#archivo', txt);
    await pg.waitForFunction(() => document.querySelector('#lectura').textContent.includes('No es un archivo que la mesa publique') && document.querySelector('#lectura').textContent.includes('Mirando') === false);
    bien('archivo que no es Excel: lo mismo, sin publicar');
    await pg.setInputFiles('#archivo', { name: 'enorme.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.alloc(26 * 1024 * 1024) });
    await pg.waitForSelector('text=demasiado grande');
    bien('límite de tamaño: un archivo de 26 MB se rechaza');

    // Excel con un teléfono: bloquea
    const mal = path.join(tmp, 'mal.xlsx');
    execFileSync('python3', ['-c', `
import json,subprocess,sys
sys.argv=['x',r'${path.join(__dirname, 'datos/sp-ejemplo/actual.json')}',r'${mal}']
src=open(r'${path.join(__dirname, 'hacer_xlsx.py')}',encoding='utf-8').read().replace("wb.save(sys.argv[2])","ws['J5']='6' + '12 34' + ' 56 78'\\nwb.save(sys.argv[2])")
exec(src)`]);
    await pg.setInputFiles('#archivo', mal);
    await pg.waitForSelector('.vals li.bloquea');
    assert.strictEqual(await pg.isDisabled('#publicar'), true);
    assert((await pg.textContent('.vals li.bloquea')).includes('J5'));
    assert.strictEqual(await pg.isVisible('#guardar-solo'), true);
    bien('V06: teléfono bloquea, el botón queda desactivado y se ofrece guardar solo el archivo');

    // Publicar el SP de ejemplo (jornada 3): torneo nuevo → el destino por defecto es Borrador; se elige Web
    await pg.setInputFiles('#archivo', xlsx('sp-ejemplo'));
    await pg.waitForSelector('.tabla-caja');
    assert.strictEqual(await pg.isChecked('input[name=destino][value=borr]'), true);
    await pg.click('input[name=destino][value=web]');
    await pg.waitForFunction(() => document.querySelector('#publicar').textContent === 'Publicar en la web');
    const vals = await pg.$$eval('.vals > li', (l) => l.map((x) => x.className + ' | ' + x.textContent));
    console.log('     avisos:', vals.map((v) => v.slice(0, 90)).join(' // '));
    assert.strictEqual(await pg.isDisabled('#publicar'), false);
    await pg.screenshot({ path: path.join(tmp, '..', 'pub_revision.png'), fullPage: true });
    await pg.click('#publicar');
    await pg.waitForSelector('text=Publicado.');
    assert.deepStrictEqual(antesPuts(), ['datos/sp-ejemplo/jornada_03.json', 'datos/sp-ejemplo/actual.json', 'datos/indice.json']);
    assert.strictEqual(puts[0].rama, 'main');
    for (const p of puts) { assert.deepStrictEqual(p.author, NOREPLY); assert.deepStrictEqual(p.committer, NOREPLY); }
    bien('cada PUT lleva author y committer con el correo noreply (' + puts.length + ' PUT)');
    const esp = leerJson('sp-ejemplo/actual.json'); const { jornadas, ...espJornada } = esp;
    const j3 = api.json('web', 'datos/sp-ejemplo/jornada_03.json');
    assert.deepStrictEqual(sinPub(j3), sinPub(espJornada));
    bien('jornada_03.json idéntico al JSON de referencia');
    const act = api.json('web', 'datos/sp-ejemplo/actual.json');
    assert.deepStrictEqual(act.jornadas.map((x) => [x.numero, x.completa]), [[3, false]]);
    assert.strictEqual(api.bytes('web', 'datos/sp-ejemplo/jornada_03.json').toString('utf8').endsWith('}\n'), true);
    const ind = api.json('web', 'datos/indice.json');
    assert.deepStrictEqual(ind.torneos.map((t) => [t.id, t.jornada_actual, t.estado]), [['sp-ejemplo', 3, 'en_juego']]);
    bien('actual.json e indice.json escritos en orden y con el formato del contrato');

    // Publicar otro torneo: el índice los junta y ordena por fecha
    puts.length = 0;
    await pg.setInputFiles('#archivo', xlsx('parejas-ejemplo-2026-11-14'));
    await pg.waitForSelector('.tabla-caja');
    await pg.click('input[name=destino][value=web]');
    await pg.waitForFunction(() => document.querySelector('#publicar').textContent === 'Publicar en la web');
    await pg.click('#publicar'); await pg.waitForSelector('text=Publicado.');
    assert.deepStrictEqual(api.json('web', 'datos/indice.json').torneos.map((t) => t.id), ['parejas-ejemplo-2026-11-14', 'sp-ejemplo']);
    bien('segundo torneo: indice.json con los dos, el más reciente primero');

    // Republicar la misma jornada: ya está en la web, así que el destino por defecto es Web
    puts.length = 0;
    await pg.setInputFiles('#archivo', xlsx('sp-ejemplo'));
    await pg.waitForSelector('.tabla-caja');
    assert.strictEqual(await pg.isChecked('input[name=destino][value=web]'), true);
    await pg.click('#publicar'); await pg.waitForSelector('text=Publicado.');
    assert.strictEqual(puts.length, 3);
    bien('republicar la misma jornada sobrescribe con el sha anterior');

    // Jornada anterior a la publicada: pide confirmación y escribe solo su archivo
    const j2 = path.join(tmp, 'sp-j2.xlsx');
    execFileSync('python3', ['-c', `
import json,sys
j=json.load(open(r'${path.join(__dirname, 'datos/sp-ejemplo/jornada_02.json')}',encoding='utf-8'))
json.dump(j,open(r'${path.join(tmp, 'j2.json')}','w',encoding='utf-8'),ensure_ascii=False)
sys.argv=['x',r'${path.join(tmp, 'j2.json')}',r'${j2}']
exec(open(r'${path.join(__dirname, 'hacer_xlsx.py')}',encoding='utf-8').read())`]);
    puts.length = 0;
    await pg.setInputFiles('#archivo', j2);
    await pg.waitForSelector('.vals li.confirma');
    assert.strictEqual(await pg.isDisabled('#publicar'), true);
    await pg.check('.vals li.confirma input');
    assert.strictEqual(await pg.isDisabled('#publicar'), false);
    await pg.click('#publicar'); await pg.waitForSelector('text=solo se ha corregido');
    assert.deepStrictEqual(puts.map((p) => p.ruta), ['datos/sp-ejemplo/jornada_02.json', 'datos/sp-ejemplo/actual.json']);
    const act2 = api.json('web', 'datos/sp-ejemplo/actual.json');
    assert.deepStrictEqual(act2.jornadas.map((x) => [x.numero, x.completa]), [[2, true], [3, false]]);
    assert.deepStrictEqual(sinPub({ ...act2, jornadas: null }), sinPub({ ...act, jornadas: null }));
    bien('V09: jornada anterior pide casilla, escribe jornada_02.json y la apunta en la lista de actual.json');

    assert.deepStrictEqual(await pg.evaluate(() => window.__csp), []);
    bien('CSP: ninguna violación en publicar.html (lista, lee el Excel y publica)');
    assert.deepStrictEqual(errores, []);
    bien('sin errores de JavaScript en la página');
  }

  /* ============ 4b. Varias partidas de un mismo Excel ============ */
  {
    const PE = path.join(__dirname, 'datos', 'parejas-ejemplo-2026-11-14'), ID = 'parejas-ejemplo-2026-11-14';
    const partidas = (k0, ...extra) => { const f = path.join(tmp, `partidas-${k0}-${extra.join('')}.xlsx`); execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_partidas.py'), PE, String(k0), f, ...extra.map(String)]); return f; };
    // lo que tiene que quedar publicado: los JSON de prueba (el descanso, con el lado derecho vacío como en la hoja WEB real)
    const ref = (k) => { const j = leerJson(`${ID}/jornada_0${k}.json`); delete j.publicado; for (const m of j.emparejamientos) if (m.estado === 'descanso') { m.p_dcha = null; m.t_dcha = null; } return j; };
    const C = require('../assets/contrato.js');
    const casillas = (pg) => pg.$$eval('#partidas input[type=checkbox][data-k]', (l) => l.map((x) => [Number(x.dataset.k), x.checked]));
    const textos = (pg) => pg.$$eval('#partidas li.partida', (l) => l.map((x) => x.querySelector('label').textContent));
    // la web ya tiene publicadas las partidas de `ks` (de las del Excel: 1 y 2)
    const conPublicadas = (ks) => (a) => {
      sembrarWeb(a);
      const j = ks.map((k) => { const x = leerJson(`${ID}/jornada_0${k}.json`); return x; });
      const ultimo = j[j.length - 1];
      for (const x of j) a.ponerCifrado(`datos/${ID}/jornada_0${x.jornada.numero}.json`, JSON.stringify(x, null, 1) + '\n');
      a.ponerCifrado(`datos/${ID}/actual.json`, JSON.stringify(C.conJornadas(ultimo, j.map((x) => ({ numero: x.jornada.numero, completa: x.jornada.completa, publicado: x.publicado }))), null, 1) + '\n');
      const ind = a.json('web', 'datos/indice.json');
      ind.torneos.push({ id: ID, nombre: ultimo.torneo.nombre, tipo: 'parejas', temporada: null, fecha: ultimo.torneo.fecha, estado: 'en_juego', jornada_actual: ultimo.jornada.numero, n_jornadas: 7, n_participantes: 5, ganador: null });
      a.ponerCifrado('datos/indice.json', JSON.stringify(ind, null, 1) + '\n');
    };
    const rutas = (api) => api.puts.map((p) => p.clave + ' ' + p.ruta);

    // A. Un campeonato nuevo: una casilla por partida con datos, las dos marcadas, y se guardan las dos como borrador
    {
      const { pg, api, errores } = await escenario({ semilla: sembrarWeb });
      await abrir(pg);
      await pg.setInputFiles('#archivo', partidas(2));
      await pg.waitForSelector('#partidas');
      assert.deepStrictEqual(await casillas(pg), [[1, true], [2, true]]);
      const t = await textos(pg);
      assert(t[0].startsWith('Partida 1') && t[1].startsWith('Partida 2') && t.every((x) => !x.includes('ya publicada')), t.join(' | '));
      assert((await pg.textContent('#lectura')).includes('Trae 2 partidas con datos'));
      bien('un Excel con las partidas 1 y 2 con datos: dos casillas, las dos marcadas (ninguna está publicada), y lo dice al leerlo');
      assert.strictEqual(await pg.textContent('#publicar'), 'Guardar como borrador (2 partidas)');
      await pg.click('#publicar'); await pg.waitForSelector('text=Guardadas las partidas 1 y 2 como borrador');
      assert.deepStrictEqual(rutas(api), [`borr datos/${ID}/jornada_01.json`, `borr datos/${ID}/jornada_02.json`, `borr datos/${ID}/actual.json`, 'borr datos/indice.json']);
      for (const k of [1, 2]) assert.deepStrictEqual(sinPub(api.json('borr', `datos/${ID}/jornada_0${k}.json`)), ref(k));
      const act = api.json('borr', `datos/${ID}/actual.json`);
      assert.deepStrictEqual([act.jornada.numero, act.jornadas.map((x) => x.numero)], [2, [1, 2]]);
      assert.strictEqual(api.json('borr', 'datos/indice.json').torneos.find((x) => x.id === ID).jornada_actual, 2);
      assert.deepStrictEqual(api.violaciones, []);
      bien('varias partidas marcadas: cada una escribe su jornada_NN.json, y actual.json (con la lista de partidas) e indice.json una sola vez, al final');
      assert.deepStrictEqual(errores, []);
    }
    // B. La partida 1 ya está en la web: sin marcar y con el aviso; la 2 (sin publicar y la más reciente) va marcada
    {
      const { pg, api, errores } = await escenario({ semilla: conPublicadas([1]) });
      await abrir(pg);
      await pg.setInputFiles('#archivo', partidas(2));
      await pg.waitForSelector('#partidas');
      assert.deepStrictEqual(await casillas(pg), [[1, false], [2, true]]);
      const t = await textos(pg);
      assert(t[0].includes('ya publicada: se sobrescribirá') && !t[1].includes('ya publicada'), t.join(' | '));
      assert.strictEqual(await pg.textContent('#publicar'), 'Publicar en la web');
      bien('por defecto: marcada la que no está publicada, y la ya publicada sale sin marcar con «ya publicada: se sobrescribirá»');
      await pg.check('#partidas input[data-k="1"]');
      assert.strictEqual(await pg.textContent('#publicar'), 'Publicar en la web (2 partidas)');
      assert.strictEqual(await pg.isDisabled('#publicar'), false);
      api.puts.length = 0;
      await pg.click('#publicar'); await pg.waitForSelector('text=Publicadas las partidas 1 y 2');
      assert.deepStrictEqual(rutas(api), [`web datos/${ID}/jornada_01.json`, `web datos/${ID}/jornada_02.json`, `web datos/${ID}/actual.json`, 'web datos/indice.json']);
      for (const k of [1, 2]) assert.deepStrictEqual(sinPub(api.json('web', `datos/${ID}/jornada_0${k}.json`)), ref(k));
      const act = api.json('web', `datos/${ID}/actual.json`);
      assert.deepStrictEqual([act.jornada.numero, act.jornadas.map((x) => x.numero)], [2, [1, 2]]);
      assert.deepStrictEqual(api.enClaro, []); assert.deepStrictEqual(api.violaciones, []);
      assert(api.puts.every((p) => api.cifradoCon(p.ruta) === 0));
      bien('marcar también la ya publicada la sobrescribe: web con las dos partidas, todo cifrado y la web nunca apunta a un archivo que falte');
      assert((await textos(pg))[0].includes('ya publicada: se sobrescribirá') && (await textos(pg))[1].includes('ya publicada: se sobrescribirá'));
      assert.strictEqual(await pg.isDisabled('#publicar'), true);
      bien('tras publicar, la lista pasa a decir «ya publicada» en las dos y el botón espera a que cambies algo');
      assert.deepStrictEqual(errores, []);
    }
    // C. Las dos ya están en la web: se marca la más reciente (se sobrescribe); sin ninguna marcada no se puede subir; la anterior pide confirmación
    {
      const { pg, api } = await escenario({ semilla: conPublicadas([1, 2]) });
      await abrir(pg);
      await pg.setInputFiles('#archivo', partidas(2));
      await pg.waitForSelector('#partidas');
      assert.deepStrictEqual(await casillas(pg), [[1, false], [2, true]]);
      assert((await textos(pg)).every((x) => x.includes('ya publicada: se sobrescribirá')));
      bien('con las dos ya publicadas: las dos avisan de que se sobrescriben y solo va marcada la más reciente');
      await pg.uncheck('#partidas input[data-k="2"]');
      assert.strictEqual(await pg.isDisabled('#publicar'), true);
      assert((await pg.textContent('#pub-nota')).includes('Marca al menos una partida'));
      bien('sin ninguna casilla marcada no se puede subir nada, y lo dice');
      await pg.check('#partidas input[data-k="1"]');
      await pg.waitForSelector('.vals li.confirma');
      assert.strictEqual(await pg.isDisabled('#publicar'), true);
      await pg.check('.vals li.confirma input');
      assert.strictEqual(await pg.isDisabled('#publicar'), false);
      api.puts.length = 0;
      await pg.click('#publicar'); await pg.waitForSelector('text=solo se ha corregido');
      assert.deepStrictEqual(rutas(api), [`web datos/${ID}/jornada_01.json`, `web datos/${ID}/actual.json`]);
      assert.strictEqual(api.json('web', `datos/${ID}/actual.json`).jornada.numero, 2);
      bien('subir solo la partida anterior: pide su confirmación y deja actual.json en la última publicada');
    }
    // D0. Una partida con resultados que no se puede sacar: no se ofrece y la página explica qué hacer
    {
      const { pg } = await escenario({ semilla: sembrarWeb });
      await abrir(pg);
      await pg.setInputFiles('#archivo', partidas(2, '--sin-fijar-1'));
      await pg.waitForSelector('#partidas');
      assert.deepStrictEqual(await casillas(pg), [[2, true]]);
      const nota = await pg.textContent('#partidas');
      assert(nota.includes('No se ofrece la partida 1') && nota.includes('WEB_J_MANUAL'), nota);
      bien('una partida con resultados que no se puede sacar no se ofrece, y la página dice cuál es y que hay que ponerla en WEB_J_MANUAL');
    }
    // D. Un Excel sin las hojas de datos (solo WEB): una casilla, marcada
    {
      const { pg } = await escenario({ semilla: sembrarWeb });
      await abrir(pg);
      await pg.setInputFiles('#archivo', xlsx('sp-ejemplo'));
      await pg.waitForSelector('#partidas');
      assert.deepStrictEqual(await casillas(pg), [[3, true]]);
      assert((await textos(pg))[0].startsWith('Jornada 3'));
      bien('Excel solo con la hoja WEB: una casilla («Jornada 3» en SP), marcada');
    }
  }

  /* ============ 5. Publicar, ocultar, editar y eliminar ============ */
  const PAR = 'parejas-ejemplo-2026-11-14', SPE = 'sp-ejemplo';
  const semillaDos = (a) => { sembrarWeb(a); sembrar(a, 'borr', PAR); };
  const fila = (pg, lista, id) => pg.locator(`#lista-${lista} li.torneo[data-id="${id}"]`);
  const boton = (pg, lista, id, txt) => fila(pg, lista, id).locator(`.acciones button:text-is("${txt}")`);
  const MSG_OK = /^(Publicar|Borrador|Ocultar|Eliminar|Editar|Publicar borrador) [a-z0-9-]+(: jornada \d+)?$/;
  const copia = (api, de, a, id) => api.rutas(de).filter((r) => r.startsWith(`datos/${id}/`)).every((r) => api.repos[a].has(r) && api.bytes(a, r).equals(api.bytes(de, r)));

  // publicar un borrador
  {
    const { pg, api, errores } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    api.puts.length = 0;
    await boton(pg, 'borr', PAR, 'Publicar').click();
    await pg.waitForSelector('#lista-borr .aviso-accion');
    const aviso = await pg.textContent('#lista-borr .aviso-accion');
    assert(/público/.test(aviso) && /3 archivos/.test(aviso), aviso);
    assert.strictEqual(api.puts.length, 0);
    bien('publicar un borrador: antes de escribir pide confirmación y dice que será público');
    await pg.click('#lista-borr .panel button:text-is("Cancelar")');
    assert.strictEqual(api.puts.length, 0); assert.strictEqual(await pg.$$eval('#lista-borr .panel:not(:empty)', (x) => x.length), 0);
    await boton(pg, 'borr', PAR, 'Publicar').click();
    await pg.click('#lista-borr .panel button:text-is("Sí, publicar en la web")');
    await pg.waitForSelector('#registro-mesa:has-text("Publicado.")');
    assert.deepStrictEqual(api.log, [`PUT web datos/${PAR}/jornada_01.json`, `PUT web datos/${PAR}/jornada_02.json`, `PUT web datos/${PAR}/actual.json`, 'PUT web datos/indice.json']);
    assert(copia(api, 'borr', 'web', PAR));
    assert.deepStrictEqual(api.json('web', 'datos/indice.json').torneos.map((t) => t.id), [PAR, SPE]);
    assert(api.rutas('borr').includes(`datos/${PAR}/actual.json`));
    assert.deepStrictEqual(api.violaciones, []);
    bien('publicar un borrador: copia los datos a la web, añade el índice al final, deja el borrador y la web nunca apunta a archivos que faltan');
    for (const p of api.puts) { assert.deepStrictEqual(p.author, NOREPLY); assert.deepStrictEqual(p.committer, NOREPLY); assert(MSG_OK.test(p.mensaje), p.mensaje); }
    bien('mensajes de commit sin datos personales y firmados por «Mesa de control»');
    await pg.waitForFunction(() => document.querySelectorAll('#lista-web li.torneo').length === 2);
    assert((await fila(pg, 'borr', PAR).textContent()).includes('También está en la web'));
    assert.deepStrictEqual(errores, []);
  }

  // ocultar
  {
    const { pg, api, errores } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    api.puts.length = 0;
    await boton(pg, 'web', SPE, 'Ocultar').click();
    await pg.waitForSelector('#lista-web .aviso-accion');
    assert(/historial público de git/.test(await pg.textContent('#lista-web .aviso-accion')));
    assert.strictEqual(api.log.length, 0);
    await pg.click('#lista-web .panel button:text-is("Cancelar")');
    assert.strictEqual(api.log.length, 0);
    bien('ocultar: pide confirmación y avisa de que queda en el historial público de git');
    await boton(pg, 'web', SPE, 'Ocultar').click();
    await pg.click('#lista-web .panel button:text-is("Sí, ocultar")');
    await pg.waitForSelector('#registro-mesa:has-text("Ocultado.")');
    const d = `datos/${SPE}/`;
    assert.deepStrictEqual(api.log, [`PUT borr ${d}jornada_01.json`, `PUT borr ${d}jornada_02.json`, `PUT borr ${d}jornada_03.json`, `PUT borr ${d}actual.json`, 'PUT borr datos/indice.json',
      'PUT web datos/indice.json', `DELETE web ${d}actual.json`, `DELETE web ${d}jornada_03.json`, `DELETE web ${d}jornada_02.json`, `DELETE web ${d}jornada_01.json`]);
    assert.deepStrictEqual(api.violaciones, []);
    assert.deepStrictEqual(api.rutas('web'), ['datos/clave.json', 'datos/indice.json']);
    assert.deepStrictEqual(api.json('web', 'datos/indice.json').torneos, []);
    assert.deepStrictEqual(api.json('borr', 'datos/indice.json').torneos.map((t) => t.id), [PAR, SPE]);
    assert(api.rutas('borr').filter((r) => r.startsWith(d)).length === 4);
    for (const x of [...api.puts, ...api.dels]) { assert.deepStrictEqual(x.author, NOREPLY); assert(MSG_OK.test(x.mensaje), x.mensaje); }
    bien('ocultar: copia a borradores (datos y su índice), quita la entrada de la web y solo después borra sus archivos, sin que la web apunte nunca a nada que falte');
    await pg.waitForFunction(() => document.querySelectorAll('#lista-web li.torneo').length === 0 && document.querySelectorAll('#lista-borr li.torneo').length === 2);
    bien('tras ocultar, el torneo pasa de «En la web» a «Borradores»');
    assert.deepStrictEqual(errores, []);
  }

  // eliminar: hay que escribir el id
  {
    const { pg, api } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    await boton(pg, 'web', SPE, 'Eliminar').click();
    await pg.waitForSelector('#lista-web .panel input');
    assert(/historial público de git/.test(await pg.textContent('#lista-web .aviso-accion')));
    const si = pg.locator('#lista-web .panel button:text-is("Eliminar para siempre")');
    assert.strictEqual(await si.isDisabled(), true);
    await pg.fill('#lista-web .panel input', 'sp-ejempl'); assert.strictEqual(await si.isDisabled(), true);
    await pg.fill('#lista-web .panel input', SPE.toUpperCase()); assert.strictEqual(await si.isDisabled(), true);
    assert.strictEqual(api.log.length, 0);
    await pg.fill('#lista-web .panel input', SPE); assert.strictEqual(await si.isDisabled(), false);
    await si.click();
    await pg.waitForSelector('#registro-mesa:has-text("Eliminado.")');
    assert.deepStrictEqual(api.log, ['PUT web datos/indice.json', `DELETE web datos/${SPE}/actual.json`, `DELETE web datos/${SPE}/jornada_03.json`, `DELETE web datos/${SPE}/jornada_02.json`, `DELETE web datos/${SPE}/jornada_01.json`]);
    assert.deepStrictEqual(api.violaciones, []);
    assert.deepStrictEqual(api.rutas('borr').filter((r) => r.includes(SPE)), []);
    bien('eliminar de la web: pide escribir el id, quita la entrada y borra los archivos; no copia nada a borradores');
    // un borrador
    api.log.length = 0;
    await pg.waitForSelector(`#lista-borr li[data-id="${PAR}"]`);
    await boton(pg, 'borr', PAR, 'Eliminar').click();
    await pg.fill('#lista-borr .panel input', PAR);
    await pg.click('#lista-borr .panel button:text-is("Eliminar para siempre")');
    await pg.waitForSelector('#registro-mesa:has-text("Eliminado.")');
    assert.deepStrictEqual(api.log, ['PUT borr datos/indice.json', `DELETE borr datos/${PAR}/actual.json`, `DELETE borr datos/${PAR}/jornada_02.json`, `DELETE borr datos/${PAR}/jornada_01.json`]);
    assert.deepStrictEqual(api.json('borr', 'datos/indice.json').torneos, []);
    assert.deepStrictEqual(api.rutas('web'), ['datos/clave.json', 'datos/indice.json']);
    bien('eliminar un borrador: lo borra de campeonatos-borradores y no toca la web');
  }

  // editar
  {
    const { pg, api } = await escenario({ semilla: (a) => { semillaDos(a); sembrar(a, 'web', PAR); } });
    await abrir(pg);
    assert.deepStrictEqual(await nombres(pg, 'web'), [SPE, PAR]);
    await boton(pg, 'web', PAR, 'Editar').click();
    await pg.waitForSelector('#ed-nombre');
    const aviso = await pg.textContent('#lista-web .aviso-accion');
    assert(/sobrescriben el nombre, la temporada y el estado/.test(aviso) && /INICIO/.test(aviso), aviso);
    assert.strictEqual(await pg.inputValue('#ed-orden'), '2');
    bien('editar: avisa de que la siguiente publicación desde el Excel sobrescribe nombre y temporada (y estado) si no se cambian también en INICIO');
    await pg.fill('#ed-nombre', 'ab'); await pg.click('#lista-web .panel button:text-is("Guardar cambios")');
    await pg.waitForSelector('#lista-web .panel .nota.caja');
    assert.strictEqual(api.log.length, 0);
    await pg.fill('#ed-nombre', 'PAREJAS CAMBIADO'); await pg.fill('#ed-temporada', 'verano'); await pg.click('#lista-web .panel button:text-is("Guardar cambios")');
    assert((await pg.textContent('#lista-web .panel .nota.caja')).includes('temporada'));
    assert.strictEqual(api.log.length, 0);
    bien('editar: un nombre o una temporada que no valen no escriben nada');
    await pg.fill('#ed-temporada', '2026-2027'); await pg.fill('#ed-orden', '1');
    await pg.click('#lista-web .panel button:text-is("Guardar cambios")');
    await pg.waitForSelector('#registro-mesa:has-text("Guardado.")');
    assert.deepStrictEqual(api.log, [`PUT web datos/${PAR}/actual.json`, 'PUT web datos/indice.json']);
    const act = api.json('web', `datos/${PAR}/actual.json`);
    assert.strictEqual(act.torneo.nombre, 'PAREJAS CAMBIADO'); assert.strictEqual(act.torneo.temporada, '2026-2027');
    assert.deepStrictEqual(Object.keys(act), Object.keys(leerJson(`${PAR}/actual.json`)));
    const ind = api.json('web', 'datos/indice.json').torneos;
    assert.deepStrictEqual(ind.map((t) => t.id), [PAR, SPE]);
    assert.strictEqual(ind[0].nombre, 'PAREJAS CAMBIADO'); assert.strictEqual(ind[0].temporada, '2026-2027');
    assert(!api.log.some((x) => x.includes('jornada_')));
    bien('editar: cambia nombre y temporada en actual.json (primero) e indice.json, y el orden de la portada; no toca las jornadas');
    await pg.waitForFunction(() => document.querySelector('#lista-web li.torneo')?.dataset.id === 'parejas-ejemplo-2026-11-14');
    // estado terminado
    api.log.length = 0;
    await boton(pg, 'web', PAR, 'Editar').click(); await pg.waitForSelector('#ed-estado');
    await pg.selectOption('#ed-estado', 'terminado');
    await pg.click('#lista-web .panel button:text-is("Guardar cambios")');
    for (let i = 0; i < 100 && api.log.length < 2; i++) await pg.waitForTimeout(50); // el registro anterior también dice «Guardado.»
    await pg.waitForSelector('#registro-mesa:has-text("Guardado.")');
    assert.strictEqual(api.json('web', `datos/${PAR}/actual.json`).torneo.estado, 'terminado');
    const e2 = api.json('web', 'datos/indice.json').torneos.find((t) => t.id === PAR);
    assert.strictEqual(e2.estado, 'terminado'); assert(e2.ganador && e2.ganador.corto);
    bien('editar el estado a «terminado»: cambia actual.json e indice.json y apunta al ganador');
    // un borrador también se edita, en su repositorio
    api.log.length = 0;
  }
  {
    const { pg, api } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    await boton(pg, 'borr', PAR, 'Editar').click(); await pg.waitForSelector('#ed-nombre');
    await pg.fill('#ed-nombre', 'BORRADOR RENOMBRADO'); await pg.click('#lista-borr .panel button:text-is("Guardar cambios")');
    await pg.waitForSelector('#registro-mesa:has-text("Guardado.")');
    assert.deepStrictEqual(api.log, [`PUT borr datos/${PAR}/actual.json`, 'PUT borr datos/indice.json']);
    assert.strictEqual(api.json('borr', 'datos/indice.json').torneos[0].nombre, 'BORRADOR RENOMBRADO');
    bien('editar un borrador: escribe solo en campeonatos-borradores');
  }

  // fallo a mitad: se cuenta qué quedó hecho y se repite solo lo que falta
  {
    const { pg, api } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    api.fallar = (m, clave, ruta) => (m === 'PUT' && clave === 'web' && ruta === `datos/${PAR}/actual.json` ? 500 : null);
    api.puts.length = 0; api.log.length = 0;
    await boton(pg, 'borr', PAR, 'Publicar').click();
    await pg.click('#lista-borr .panel button:text-is("Sí, publicar en la web")');
    await pg.waitForSelector('#reintento-mesa button:text-is("Reintentar")');
    const reg = await pg.textContent('#registro-mesa');
    assert(/✖/.test(reg) && /Quedó hecho: Copiar jornada_01\.json a la web; Copiar jornada_02\.json a la web/.test(reg) && /Falta: Copiar actual\.json a la web; Actualizar indice\.json \(web\)/.test(reg), reg);
    assert.deepStrictEqual(api.json('web', 'datos/indice.json').torneos.map((t) => t.id), [SPE]);
    assert.deepStrictEqual(api.violaciones, []);
    bien('publicar con fallo a mitad: dice qué quedó hecho y qué falta, y la web no apunta a nada que no exista');
    api.fallar = null; api.log.length = 0;
    await pg.click('#reintento-mesa button:text-is("Reintentar")');
    await pg.waitForSelector('#registro-mesa:has-text("Publicado.")');
    assert.deepStrictEqual(api.log, [`PUT web datos/${PAR}/actual.json`, 'PUT web datos/indice.json']);
    assert(copia(api, 'borr', 'web', PAR)); assert.deepStrictEqual(api.violaciones, []);
    assert.strictEqual(await pg.$$eval('#reintento-mesa button', (x) => x.length), 0);
    bien('Reintentar repite solo los pasos que faltaban y termina bien');
  }
  {
    const { pg, api } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    api.fallar = (m, clave, ruta) => (m === 'DELETE' && clave === 'web' && ruta === `datos/${SPE}/jornada_02.json` ? 500 : null);
    await boton(pg, 'web', SPE, 'Ocultar').click();
    await pg.click('#lista-web .panel button:text-is("Sí, ocultar")');
    await pg.waitForSelector('#reintento-mesa button:text-is("Reintentar")');
    assert.deepStrictEqual(api.violaciones, []);
    assert.deepStrictEqual(api.json('web', 'datos/indice.json').torneos, []);
    assert(api.rutas('borr').filter((r) => r.startsWith(`datos/${SPE}/`)).length === 4);
    bien('ocultar con fallo al borrar: el torneo ya está a salvo en borradores y fuera de la portada pública');
    // tras recargar, lo que quedó suelto en la web aparece como resto y se puede eliminar
    await pg.reload(); await pg.waitForSelector('#restos:not([hidden]) li.resto');
    assert.strictEqual(await pg.getAttribute('#restos li.resto', 'data-id'), SPE);
    bien('tras recargar, las carpetas que quedaron en la web sin entrada en el índice salen como «restos»');
    api.fallar = null;
    await pg.click('#restos li.resto button:text-is("Eliminar")');
    await pg.fill('#restos .panel input', SPE); await pg.click('#restos .panel button:text-is("Eliminar para siempre")');
    await pg.waitForSelector('#registro-mesa:has-text("Eliminado.")');
    assert.deepStrictEqual(api.rutas('web'), ['datos/clave.json', 'datos/indice.json']);
    await pg.waitForSelector('#restos', { state: 'hidden' });
    bien('eliminar un resto termina el trabajo');
  }
  {
    const { pg, api } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    await pg.setInputFiles('#archivo', xlsx(SPE));
    await pg.waitForSelector('.tabla-caja');
    api.fallar = (m, clave, ruta) => (m === 'PUT' && ruta === 'datos/indice.json' ? 500 : null);
    api.log.length = 0;
    await pg.click('#publicar');
    await pg.waitForSelector('#reintento button:text-is("Reintentar")');
    const reg = await pg.textContent('#registro');
    assert(/Quedó hecho: Escribir jornada_03\.json; Escribir actual\.json/.test(reg) && /Falta: Escribir indice\.json/.test(reg), reg);
    api.fallar = null; api.log.length = 0;
    await pg.click('#reintento button:text-is("Reintentar")');
    await pg.waitForSelector('#registro:has-text("Publicado.")');
    assert.deepStrictEqual(api.log, ['PUT web datos/indice.json']);
    bien('subir un Excel con fallo en el índice: informa y Reintentar escribe solo el índice');
  }

  /* ============ 6. Seguridad ============ */
  {
    const { pg, api } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    const intenta = (js, ...args) => pg.evaluate(async ([js, args]) => { try { await new Function('M', 'a', 'return ' + js)(window.Mesa, args); return 'PASÓ'; } catch (e) { return e.message; } }, [js, args]);
    const antes = api.reqs.length;
    const malas = ['assets/web.js', '.github/workflows/x.yml', 'README.md', 'datos/_prueba/actual.json', 'datos/../README.md', 'datos/sp-ejemplo/otro.json', 'datos/sp-ejemplo/folleto.pdf', 'datos/sp-ejemplo/normativa.pdf', 'datos/clave.json/x', 'datos/sp-ejemplo/jornada_1.json', 'datos/SP/actual.json', 'datos/sp-ejemplo/x/actual.json', 'datos/indice.json/..', '/datos/indice.json', 'datos/sp-ejemplo/actual.json\n', 'datos/-sp/actual.json'];
    for (const clave of ['web', 'borr']) for (const r of malas) {
      for (const [nom, js] of [['escribir', 'M.escribir(a[0], a[1], "{}", null, "x")'], ['borrar', 'M.borrar(a[0], a[1], "s", "x")'], ['leer', 'M.leer(a[0], a[1])']]) {
        const msg = await intenta(js, clave, r);
        assert(/Ruta no permitida/.test(msg), `${nom} ${clave} ${r} → ${msg}`);
      }
    }
    for (const dir of ['assets', 'datos/_prueba', '.github', 'datos/x', 'datos/sp-ejemplo/jornada_01.json/']) assert(/Ruta no permitida/.test(await intenta('M.listar(a[0], a[1])', 'web', dir)), dir);
    assert.strictEqual(api.reqs.length, antes);
    bien('rutas fuera de datos/ (' + malas.length + ' casos, en los dos repositorios): escribir, borrar y leer se rechazan sin llamar a GitHub');
    for (const otro of ['programas-domino', 'otro', '', 'web/../x', '__proto__', 'constructor']) {
      const msg = await intenta('M.escribir(a[0], "datos/indice.json", "{}", null, "x")', otro);
      assert(/Repositorio no permitido/.test(msg), otro + ' → ' + msg);
    }
    assert.strictEqual(api.reqs.length, antes);
    bien('un repositorio que no sea campeonatos-domino o campeonatos-borradores se rechaza sin llamar a GitHub');
    api.puts.length = 0; api.dels.length = 0;
    for (const [clave, r] of [['web', 'datos/indice.json'], ['web', 'datos/sp-ejemplo/actual.json'], ['borr', 'datos/sp-ejemplo/jornada_05.json'], ['borr', 'datos/indice.json']]) {
      assert.strictEqual(/Ruta no permitida|Repositorio no permitido/.test(await intenta('M.escribir(a[0], a[1], "{}", null, "x")', clave, r)), false, r);
    }
    bien('las rutas permitidas pasan el filtro en los dos repositorios');
    api.puts.length = 0; api.log.length = 0;
    for (const x of api.reqs) assert(/^\/repos\/JUGUEMOSDOMINO\/(campeonatos-domino|campeonatos-borradores)(\/|$)/.test(x.ruta) && !x.ruta.includes(TOKEN), x.ruta);
    bien('todas las llamadas con token van a api.github.com y a uno de los dos repositorios, sin el token en la dirección');
  }
  // 401 en mitad de una acción: se borra el token y se avisa
  {
    const { pg, api } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    api.token = 'otro';
    await boton(pg, 'borr', PAR, 'Publicar').click();
    await pg.waitForSelector('#token');
    assert.strictEqual(await pg.evaluate(() => localStorage.getItem('tumesa.token')), null);
    assert(/borrado de este navegador/.test(await pg.textContent('#token-estado')));
    bien('401 al preparar una acción: el token se borra y se pide uno nuevo');
  }

  // GitHub responde 401 (token caducado): se borra del navegador y se avisa
  {
    const { pg, api } = await escenario({ semilla: sembrarWeb });
    await abrir(pg);
    api.token = 'otro';
    await pg.setInputFiles('#archivo', xlsx('sp-ejemplo'));
    await pg.waitForSelector('text=Lo he borrado de este navegador');
    assert.strictEqual(await pg.evaluate(() => localStorage.getItem('tumesa.token')), null);
    await pg.waitForSelector('#token');
    bien('401: el token se borra del navegador, se avisa y se pide uno nuevo');
  }

  /* ============ 8. Cifrado: nada en claro hacia la web ============ */
  const NUEVA = 'otra contraseña para la web';
  const servirComoPages = (ctx, api) => ctx.route(base + '/datos/**', (route) => { // la web tal como la serviría GitHub Pages con lo que hay en el repositorio
    const r = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\//, '')), f = api.repos.web.get(r);
    return f ? route.fulfill({ status: 200, contentType: 'application/json', body: f.texto }) : route.fulfill({ status: 404, body: 'Not Found' });
  });
  const todasCon = (api, i) => api.rutas('web').filter((r) => r !== 'datos/clave.json').every((r) => api.cifradoCon(r) === i);
  {
    const { pg, api } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    const intenta = (js, ...args) => pg.evaluate(async ([js, args]) => { try { await new Function('M', 'a', 'return ' + js)(window.Mesa, args); return 'PASÓ'; } catch (e) { return e.message; } }, [js, args]);
    const antes = api.puts.length;
    for (const [r, t] of [['datos/sp-ejemplo/actual.json', '{"torneo":{"id":"sp-ejemplo"}}'], ['datos/indice.json', JSON.stringify({ version: '1.0', torneos: [] })], ['datos/sp-ejemplo/normativa.pdf.cifrado', '%PDF-1.4 normativa'], ['datos/clave.json', '{"version":1}']]) {
      assert(/sin cifrar/.test(await intenta('M.escribir("web", a[0], a[1], null, "x")', r, t)), r);
    }
    assert.strictEqual(api.puts.length, antes);
    assert.strictEqual(await intenta('M.escribir("borr", "datos/sp-nuevo/actual.json", a[0], null, "x")', JSON.stringify({ version: '1.0', torneos: [] })), 'PASÓ');
    bien('datos en claro no publicables: escribir en la web un JSON en claro, un PDF sin cifrar o un clave.json raro se rechaza sin llamar a GitHub; en borradores sí va en claro');
  }

  // Estrenar la contraseña con la web de hoy, en claro (los datos reales del repositorio), y comprobar la web resultante sin clave
  {
    const realEnClaro = !fs.existsSync(path.join(raiz, 'datos/clave.json'));
    const origen = realEnClaro ? path.join(raiz, 'datos') : path.join(__dirname, 'datos'); // tras la migración, los reales ya no se pueden leer: se usa la copia inventada
    const ids = JSON.parse(fs.readFileSync(path.join(origen, 'indice.json'), 'utf8')).torneos.map((t) => t.id);
    const { ctx, pg, api } = await escenario({ sinClave: true, clave: false, semilla: (a) => {
      a.poner('web', 'datos/indice.json', JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(origen, 'indice.json'), 'utf8')), torneos: JSON.parse(fs.readFileSync(path.join(origen, 'indice.json'), 'utf8')).torneos.filter((t) => fs.existsSync(path.join(origen, t.id))) }, null, 1) + '\n');
      for (const id of ids) for (const f of fs.readdirSync(path.join(origen, id)).filter((x) => x.endsWith('.json'))) a.poner('web', `datos/${id}/${f}`, fs.readFileSync(path.join(origen, id, f), 'utf8'));
    } });
    const nombres = new Set(); // lo que no debe leerse sin contraseña
    for (const r of api.rutas('web')) { const j = api.json('web', r); for (const p of [...(j.participantes || []), ...(j.sustituciones || [])]) for (const [k, v] of Object.entries(p)) if (typeof v === 'string' && /apellido1$|^corto$/.test(k) && v.length >= 4) nombres.add(v); }
    const estatico = ['index.html', 'torneo.html'].map((f) => fs.readFileSync(path.join(raiz, f), 'utf8')).join(' ');
    for (const x of [...nombres]) if (estatico.includes(x)) nombres.delete(x); // el pie de la página nombra a la mesa de control
    assert(nombres.size > 20);
    await abrir(pg);
    assert((await pg.textContent('#clave-estado')).includes('todavía no tiene contraseña'));
    assert((await pg.textContent('#lista-web')).includes('sin cifrar'));
    assert.strictEqual(await pg.locator('#lista-web li.torneo').count(), ids.length);
    bien('web sin contraseña (como hoy): la mesa lista lo publicado y avisa de que va sin cifrar');
    await pg.click('#clave-estado button:text-is("Establecer la contraseña")');
    const f1 = await pg.inputValue('#nueva-clave');
    assert(/^[a-zñ]+( [a-zñ]+){4}$/.test(f1), f1);
    await pg.click('#panel-clave button:text-is("Proponer otra")');
    const f2 = await pg.inputValue('#nueva-clave');
    assert(/^[a-zñ]+( [a-zñ]+){4}$/.test(f2) && f2 !== f1);
    bien(`propone una frase de 5 palabras («${f2}») y otra distinta al pulsar «Proponer otra»`);
    await pg.fill('#nueva-clave', 'trece letras.');
    await pg.check('#apuntada');
    assert(await pg.isDisabled('#panel-clave button:text-is("Cifrar con esta contraseña")'));
    assert((await pg.textContent('#panel-clave')).includes('14 caracteres'));
    bien('una contraseña escrita a mano de menos de 14 caracteres no vale');
    api.conocer(NUEVA);
    await pg.fill('#nueva-clave', NUEVA);
    await pg.click('#panel-clave button:text-is("Cifrar con esta contraseña")');
    await pg.waitForSelector('#registro-clave:has-text("Contraseña puesta")');
    assert.deepStrictEqual(api.enClaro, []);
    assert(todasCon(api, 1), 'todo con la clave nueva: ' + api.rutas('web').map((r) => r + '=' + api.cifradoCon(r)).join(' '));
    const orden = api.log.filter((x) => x.startsWith('PUT web'));
    assert.deepStrictEqual(orden.slice(-2), ['PUT web datos/indice.json', 'PUT web datos/clave.json'], 'datos primero, índice y clave.json al final');
    const guardado = await pg.evaluate(() => ({ ...localStorage }));
    assert.strictEqual(guardado['tumesa.clave'], K.abrir(NUEVA, api.json('web', 'datos/clave.json')).toString('base64'));
    assert(!JSON.stringify(guardado).includes(NUEVA) && !api.repos.web.get('datos/clave.json').texto.includes(NUEVA));
    assert(!guardado['tumesa.clave.pendiente']);
    bien(`estrenar la contraseña: ${orden.length - 1} archivos cifrados, índice y clave.json al final; el navegador guarda la clave, no la contraseña`);
    assert((await pg.textContent('#lista-web')).includes(api.json('web', 'datos/indice.json').torneos[0].nombre));
    assert(!(await pg.textContent('#lista-web')).includes('sin cifrar'));
    bien('después, la mesa lee la web cifrada con la clave guardada');

    // la web resultante, servida tal cual y sin clave
    await servirComoPages(ctx, api);
    const web = await ctx.newPage();
    await web.addInitScript(() => sessionStorage.setItem('sin-clave', '1'));
    await web.goto(base + '/index.html'); await web.evaluate(() => localStorage.clear()); await web.reload();
    await web.waitForSelector('#form-clave');
    for (const id of ids) for (const v of ['', '&ver=mesas', '&ver=parejas']) {
      await web.goto(`${base}/torneo.html?t=${id}${v}`); await web.waitForSelector('#form-clave');
      const t = await web.evaluate(() => document.body.innerText + document.title);
      assert.deepStrictEqual([...nombres].filter((x) => t.includes(x)), [], id + v);
    }
    for (const r of api.rutas('web')) {
      const t = api.repos.web.get(r).texto;
      // un sobre cifrado es base64 al azar: «ES76» puede salir por casualidad (pasaba una de cada cinco veces); basta con que sea un sobre. Lo que no es sobre se busca entero.
      // y un apellido corto («Roca») también: en un sobre se busca fuera de iv y ct
      const legible = K.esSobre(t) ? t.replace(/"(iv|ct)"\s*:\s*"[A-Za-z0-9+/=]*"/g, '') : t;
      for (const x of [...nombres, ...(K.esSobre(t) ? [] : [/Calap/i, /ES76/i, /(?<!\d)[6-9]\d{8}(?!\d)/])]) assert(!(x instanceof RegExp ? x.test(legible) : legible.includes(x)), `${r}: ${x}`);
      assert(r === 'datos/clave.json' || K.esSobre(t), r);
      assert(![...nombres].some((x) => r.toLowerCase().includes(x.toLowerCase())), r);
    }
    bien(`web servida tal cual sin clave: ninguna página enseña un nombre y ningún archivo (${api.rutas('web').length}) tiene texto legible, «Calap», teléfonos ni «ES76»${realEnClaro ? ' (con los datos reales de hoy)' : ''}`);
    await web.fill('#clave', CONTRASENA_WEB); await web.click('#form-clave button[type=submit]');
    await web.waitForSelector('#clave-msg:has-text("no es la correcta")');
    await web.fill('#clave', NUEVA); await web.click('#form-clave button[type=submit]');
    await web.waitForSelector('#cab h1');
    bien('con la contraseña nueva la web se abre; con otra, no');
  }

  // Cambiar la contraseña con un fallo a medias: Reintentar, y también cerrar la página y terminar después
  {
    const { ctx, pg, api } = await escenario({ semilla: (a) => { semillaDos(a); sembrar(a, 'web', PAR, { normativa: true }); } });
    const viejoCj = api.repos.web.get('datos/clave.json').texto;
    await abrir(pg);
    assert((await pg.textContent('#clave-estado')).includes('guardada en este navegador'));
    await pg.click('#clave-estado button:text-is("Cambiar la contraseña")');
    api.conocer(NUEVA);
    await pg.fill('#nueva-clave', NUEVA); await pg.check('#apuntada');
    let veces = 0;
    api.fallar = (m, c, r) => (m === 'PUT' && c === 'web' && r === `datos/${PAR}/actual.json` && !veces++ ? 500 : null);
    await pg.click('#panel-clave button:text-is("Cifrar con esta contraseña")');
    await pg.waitForSelector('#reintento-clave button:text-is("Reintentar")');
    assert.strictEqual(api.repos.web.get('datos/clave.json').texto, viejoCj, 'clave.json no cambia hasta el final');
    assert.strictEqual(api.cifradoCon('datos/indice.json'), 0, 'el índice sigue con la clave vieja');
    assert((await pg.textContent('#registro-clave')).includes('Quedó hecho'));
    const mezcla = api.rutas('web').filter((r) => r !== 'datos/clave.json').map((r) => api.cifradoCon(r));
    assert(mezcla.includes(0) && mezcla.includes(null), 'a medias: parte con la vieja y parte con una clave que aún no está publicada'); // la simulación aprende la nueva al ver su clave.json
    bien('fallo a medias: clave.json y el índice siguen con la contraseña vieja; el registro dice qué quedó hecho');
    await pg.click('#reintento-clave button:text-is("Reintentar")');
    await pg.waitForSelector('#registro-clave:has-text("Contraseña cambiada")');
    assert(todasCon(api, 1)); assert.deepStrictEqual(api.enClaro, []);
    assert(api.bytes('web', `datos/${PAR}/normativa.pdf.cifrado`).equals(fs.readFileSync(path.join(__dirname, 'datos/sp-ejemplo/normativa.pdf'))), 'la normativa se cifra de nuevo sin cambiar');
    assert.strictEqual(await pg.evaluate(() => localStorage.getItem('tumesa.clave')), K.abrir(NUEVA, api.json('web', 'datos/clave.json')).toString('base64'));
    bien('«Reintentar» termina: todo (también la normativa) con la clave nueva y la mesa guarda la clave nueva');

    // otra vez, pero se cierra la página a medias
    const TERCERA = 'tercera contraseña de la web'; api.conocer(TERCERA);
    await pg.click('#clave-estado button:text-is("Cambiar la contraseña")');
    await pg.fill('#nueva-clave', TERCERA); await pg.check('#apuntada');
    api.fallar = (m, c, r) => (m === 'PUT' && c === 'web' && r === 'datos/indice.json' ? 500 : null);
    await pg.click('#panel-clave button:text-is("Cifrar con esta contraseña")');
    await pg.waitForSelector('#reintento-clave button');
    api.fallar = null;
    await abrir(pg); // se recarga la página
    await pg.waitForSelector('#clave-estado:has-text("a medias")');
    assert((await pg.textContent('#lista-web')).includes(api.json('web', 'datos/indice.json').torneos[0].nombre), 'a medias, la mesa sigue leyendo la web');
    await pg.click('#clave-estado button:text-is("Terminar el cambio")');
    await pg.waitForSelector('#registro-clave:has-text("Contraseña cambiada")');
    assert(todasCon(api, 2));
    assert.strictEqual(await pg.evaluate(() => localStorage.getItem('tumesa.clave.pendiente')), null);
    bien('cambio a medias y página cerrada: al volver, «Terminar el cambio» acaba el trabajo con la contraseña nueva');

    await servirComoPages(ctx, api);
    const web = await ctx.newPage();
    await web.goto(`${base}/torneo.html?t=${PAR}&ver=normativa`); await web.waitForSelector('button:has-text("Descargar normativa (PDF)")');
    bien('la web, en el mismo navegador que la mesa, se abre con la contraseña nueva y enseña la normativa');
  }

  // Lo publicado sin cifrar se cifra solo en cuanto la mesa tiene la contraseña abierta: solo cambia lo que estaba en claro
  {
    const { pg, api } = await escenario({ semilla: (a) => { sembrarWeb(a); sembrar(a, 'web', PAR, { enClaro: true }); } });
    const cifrados = api.rutas('web').filter((r) => api.cifradoCon(r) === 0);
    api.log.length = 0;
    await abrir(pg);
    await pg.waitForSelector('#registro-clave:has-text("ya está cifrado")');
    await pg.waitForSelector('#lista-web[data-listo]');
    assert(todasCon(api, 0)); assert.deepStrictEqual(api.enClaro, []);
    assert(!api.log.some((x) => cifrados.some((r) => x === 'PUT web ' + r)), 'lo que ya iba cifrado no se toca');
    assert(!api.log.includes('PUT web datos/clave.json'));
    assert(!(await pg.textContent('#lista-web')).includes('sin cifrar'));
    bien('lo publicado sin cifrar se cifra solo al abrir la mesa con la contraseña: no hay que pulsar nada, no se toca lo ya cifrado ni clave.json');
    api.log.length = 0;
    await pg.click('#clave-estado button:text-is("Cifrar lo publicado")');
    await pg.waitForSelector('#registro-clave:has-text("Todo lo publicado está cifrado")');
    assert.deepStrictEqual(api.log.filter((x) => x.startsWith('PUT')), []);
    bien('«Cifrar lo publicado» sigue ahí para quien quiera usarlo; con todo cifrado no escribe nada');
  }
  // sin la contraseña abierta no se puede cifrar: espera a que se escriba y entonces lo hace solo
  {
    const { pg, api } = await escenario({ clave: false, semilla: (a) => { sembrarWeb(a); sembrar(a, 'web', PAR, { enClaro: true }); } });
    await pg.goto(base + '/publicar.html'); await pg.waitForSelector('#clave-web');
    assert.deepStrictEqual(api.puts.filter((x) => x.clave === 'web'), []);
    await pg.fill('#clave-web', CONTRASENA_WEB); await pg.click('#clave-estado button:text-is("Abrir")');
    await pg.waitForSelector('#registro-clave:has-text("ya está cifrado")');
    assert(todasCon(api, 0)); assert.deepStrictEqual(api.enClaro, []);
    bien('con la contraseña sin abrir no se escribe nada en la web; al escribirla, lo que estaba en claro se cifra solo');
  }
  // si el cifrado automático falla, no se vuelve a intentar en bucle: dice qué falta y ofrece «Reintentar»
  {
    const { pg, api } = await escenario({ semilla: (a) => { sembrarWeb(a); sembrar(a, 'web', PAR, { enClaro: true }); } });
    let intentos = 0;
    api.fallar = (m, c, r) => { if (m === 'PUT' && c === 'web') { intentos++; return 500; } return null; };
    await abrir(pg);
    await pg.waitForSelector('#reintento-clave button:text-is("Reintentar")');
    await pg.waitForTimeout(800);
    assert.strictEqual(intentos, 1, 'un solo intento automático');
    api.fallar = null;
    await pg.click('#reintento-clave button:text-is("Reintentar")');
    await pg.waitForSelector('#registro-clave:has-text("ya está cifrado")');
    assert(todasCon(api, 0)); assert.deepStrictEqual(api.enClaro, []);
    bien('si el cifrado automático falla, lo dice, no se repite en bucle y «Reintentar» lo termina');
  }

  // Sin la clave en el navegador: la mesa la pide; sin ella no lee la web
  {
    const { pg, api } = await escenario({ clave: false, semilla: semillaDos });
    await abrir(pg);
    await pg.waitForSelector('#clave-web');
    assert((await pg.textContent('#lista-web')).includes('contraseña'));
    await pg.fill('#clave-web', 'no es esta'); await pg.click('#clave-estado button:text-is("Abrir")');
    await pg.waitForSelector('#clave-web-msg:has-text("no es la correcta")');
    await pg.fill('#clave-web', CONTRASENA_WEB); await pg.click('#clave-estado button:text-is("Abrir")');
    await pg.waitForSelector('#lista-web li.torneo');
    assert.strictEqual(await pg.evaluate(() => localStorage.getItem('tumesa.clave')), api.clave().toString('base64'));
    bien('sin clave guardada: la mesa pide la contraseña de la web (la errónea no vale) y después lista los campeonatos');
    await pg.click('#clave-estado button:text-is("Olvidar contraseña en este dispositivo")');
    await pg.waitForSelector('#clave-web');
    assert.strictEqual(await pg.evaluate(() => localStorage.getItem('tumesa.clave')), null);
    bien('«Olvidar contraseña en este dispositivo» también en la mesa');
  }

  // Normativa: subir (cifrada) y quitar; un archivo que no es PDF no se sube; un PDF de más de 1 MB también se vuelve a cifrar
  {
    const { pg, api } = await escenario({ semilla: semillaDos });
    await abrir(pg);
    const pdf = fs.readFileSync(path.join(__dirname, 'datos/sp-ejemplo/normativa.pdf'));
    await boton(pg, 'web', SPE, 'Subir normativa (PDF)').click();
    await pg.setInputFiles(`#lista-web li.torneo[data-id="${SPE}"] .panel input[type=file]`, { name: 'normativa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('esto no es un PDF') });
    await pg.waitForSelector(`#lista-web li.torneo[data-id="${SPE}"] .panel :text("no es un PDF")`);
    const grande = Buffer.concat([pdf, Buffer.alloc(900000, 32)]);
    await pg.setInputFiles(`#lista-web li.torneo[data-id="${SPE}"] .panel input[type=file]`, { name: 'normativa.pdf', mimeType: 'application/pdf', buffer: grande });
    await pg.click(`#lista-web li.torneo[data-id="${SPE}"] .panel button:text-is("Cifrar y subir")`);
    await pg.waitForSelector('#registro-mesa:has-text("Normativa subida")');
    const r = `datos/${SPE}/normativa.pdf.cifrado`;
    assert(K.esSobre(api.repos.web.get(r).texto) && api.bytes('web', r).equals(grande) && api.repos.web.get(r).texto.length > 1000000);
    assert.deepStrictEqual(api.enClaro, []);
    await pg.waitForSelector(`#lista-web li.torneo[data-id="${SPE}"] button:text-is("Quitar normativa")`);
    bien('«Subir normativa (PDF)»: rechaza lo que no es PDF y sube el PDF cifrado como normativa.pdf.cifrado');
    api.conocer(NUEVA);
    await pg.click('#clave-estado button:text-is("Cambiar la contraseña")');
    await pg.fill('#nueva-clave', NUEVA); await pg.check('#apuntada');
    await pg.click('#panel-clave button:text-is("Cifrar con esta contraseña")');
    await pg.waitForSelector('#registro-clave:has-text("Contraseña cambiada")');
    assert(api.cifradoCon(r) === 1 && api.bytes('web', r).equals(grande));
    bien('cambiar la contraseña con una normativa de más de 1 MB (GitHub la da por blob) también la cifra de nuevo');
    await boton(pg, 'web', SPE, 'Quitar normativa').click();
    await pg.click(`#lista-web li.torneo[data-id="${SPE}"] .panel button:text-is("Sí, quitar la normativa")`);
    await pg.waitForSelector('#registro-mesa:has-text("Normativa quitada")');
    assert(!api.repos.web.has(r));
    bien('«Quitar normativa» la borra de la web');
  }

  /* ============ Ranking FVD: el Excel del ranking (hoja WEB 1.3) se publica como tipo «ranking», cifrado ============ */
  {
    const RKJ = path.join(__dirname, 'datos', 'ranking-ejemplo', 'actual.json');
    const libroRk = (extra = []) => { const f = path.join(tmp, 'ranking' + extra.join('') + '.xlsx'); execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_ranking.py'), RKJ, f, ...extra]); return f; };
    const ref = JSON.parse(fs.readFileSync(RKJ, 'utf8'));
    const sinPub = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.publicado; return c; };
    const { pg, api, errores } = await escenario({ semilla: sembrarWeb });
    await abrir(pg);
    await pg.setInputFiles('#archivo', libroRk());
    await pg.waitForSelector('#revision .resumen');
    const txt = await pg.textContent('#revision');
    assert(txt.includes('2026-27') && txt.includes('5 de 5') && txt.includes('torneos con resultados') && txt.includes('Ana Roig') && txt.includes('46/ 9201'), txt);
    assert(txt.includes('a la web solo suben cifradas'), txt);
    assert.strictEqual(await pg.isChecked('input[name=destino][value=borr]'), true);
    bien('ranking: se reconoce el Excel del ranking, enseña temporada, torneos, jugadores y los primeros puestos; destino por defecto Borrador');
    assert.strictEqual(await pg.locator('#revision li:has-text("Plazas provisionales")').count(), 0);
    const libroDe = (id) => { const f = path.join(tmp, id + '.xlsx'); execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_ranking.py'), path.join(__dirname, 'datos', id, 'actual.json'), f]); return f; };
    await pg.setInputFiles('#archivo', libroDe('ranking-provisional'));
    await pg.waitForSelector('#revision li.avisa:has-text("Plazas provisionales")');
    const prov = await pg.textContent('#revision');
    assert(prov.includes('aún no se ha jugado el Open') && prov.includes('no hay plazas Open') && prov.includes('el ranking marca sus 6') && prov.includes('SP') && prov.includes('Ranking (prov.)'), prov);
    await pg.setInputFiles('#archivo', libroDe('ranking-vacias'));
    await pg.waitForSelector('#revision li.avisa:has-text("quedan vacías")');
    assert((await pg.textContent('#revision')).includes('4 plazas del ranking quedan vacías: no hay nadie sin plaza hasta el puesto 20'));
    // plaza suelta por repartir, ½ plaza y plazas SP y Open vacías (el ejemplo con vacías de SP y Open se construye con los mismos datos y su META)
    await pg.setInputFiles('#archivo', libroDe('ranking-repartir'));
    await pg.waitForSelector('#revision li.avisa:has-text("por repartir")');
    const rep = await pg.textContent('#revision');
    assert(rep.includes('Plaza SP por repartir: la pareja N.º 6 la ha recibido y todavía no ha dicho si va') && rep.includes('SP por repartir'), rep);
    await pg.setInputFiles('#archivo', libroDe('ranking-medias'));
    await pg.waitForSelector('#revision li.avisa:has-text("Plaza Open por repartir")');
    assert((await pg.textContent('#revision')).includes('½ SP'));
    await pg.setInputFiles('#archivo', libroDe('ranking-vacias-sp-open'));
    await pg.waitForSelector('#revision li.avisa:has-text("del SP queda vacía")');
    const vsp = await pg.textContent('#revision');
    assert(vsp.includes('Una plaza del SP queda vacía: ninguna pareja de ese torneo, hasta la 10.ª, la quiere') && vsp.includes('2 plazas del Open quedan vacías'), vsp);
    await pg.setInputFiles('#archivo', libroRk());
    await pg.waitForSelector('#revision .resumen');
    bien('ranking: antes de publicar avisa de las plazas provisionales (SP u Open sin jugar) y de las que quedan vacías; enseña SP, Open y Ranking en la tabla');
    await pg.check('input[name=destino][value=web]');
    await pg.waitForSelector('#revision li.avisa:has-text("M02")');
    assert.strictEqual(await pg.textContent('#publicar'), 'Publicar en la web');
    await pg.click('#publicar');
    await pg.waitForSelector('#registro:has-text("Ranking publicado")');
    const r = 'datos/ranking-ejemplo/actual.json';
    assert(K.esSobre(api.repos.web.get(r).texto) && !/46\/ \d/.test(api.repos.web.get(r).texto), 'el ranking no va cifrado');
    assert.deepStrictEqual(sinPub(api.json('web', r)), sinPub(ref));
    const ind = api.json('web', 'datos/indice.json');
    const e = ind.torneos.find((t) => t.id === 'ranking-ejemplo');
    assert.deepStrictEqual(e, { id: 'ranking-ejemplo', nombre: 'Ranking FVD Jaume I', tipo: 'ranking', temporada: '2026-27', fecha: '2027-01-23', estado: 'en_juego', jornada_actual: 5, n_jornadas: 5, n_participantes: 14, ganador: null });
    assert(!/46\/ \d/.test(JSON.stringify(ind)) && K.esSobre(api.repos.web.get('datos/indice.json').texto));
    assert.strictEqual(await pg.getAttribute('#resultado a', 'href'), 'ranking.html?r=ranking-ejemplo');
    assert.deepStrictEqual(api.enClaro, []);
    bien('ranking: «Publicar en la web» escribe actual.json cifrado (el mismo JSON que web_export.py) y su línea de indice.json, tipo ranking y sin licencias');
    await pg.waitForSelector('#lista-web li.torneo[data-id="ranking-ejemplo"]');
    const tj = await pg.textContent('#lista-web li.torneo[data-id="ranking-ejemplo"]');
    assert(tj.includes('Ranking') && tj.includes('Torneos 5 de 5'), tj);
    bien('ranking: sale en la lista «En la web» como Ranking, con los torneos jugados');
    await pg.check('input[name=destino][value=borr]');
    await pg.waitForSelector('#revision li.avisa:has-text("M01")');
    await pg.click('#publicar');
    await pg.waitForSelector('#registro:has-text("guardado como borrador")');
    assert.deepStrictEqual(sinPub(api.json('borr', r)), sinPub(ref));
    bien('ranking: también se guarda como borrador (privado, en claro)');
    await pg.setInputFiles('#archivo', libroRk(['--errores', '3']));
    await pg.waitForSelector('#revision li.bloquea:has-text("VR6")');
    assert.strictEqual(await pg.isDisabled('#publicar'), true);
    bien('ranking: con errores (✖) en el Excel, VR6 no deja publicar');
    assert.deepStrictEqual(errores, []);
  }

  /* ============ Hoja de resumen de un organizador: a la web, parejas con solo Clasificación y sin licencias; el bloque del ranking, al portapapeles ============ */
  {
    const OJ = '1-campeonato-de-ejemplo-de-parejas-2027-02-06', ref = leerJson(OJ + '/actual.json'), ID = ref.torneo.id;
    const libroOr = (extra = []) => { const f = path.join(tmp, 'organizador' + extra.join('') + '.xlsx'); execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_organizador.py'), f, ...extra]); return f; };
    const { ctx, pg, api, errores } = await escenario({ semilla: sembrarWeb });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
    await abrir(pg);
    await pg.setInputFiles('#archivo', libroOr());
    await pg.waitForSelector('#revision .resumen');
    let txt = await pg.textContent('#revision');
    assert(txt.includes('1º CAMPEONATO DE EJEMPLO DE PAREJAS') && txt.includes('Con grupo B') && txt.includes('Todo en orden') && txt.includes('Mas-Ferrer'), txt);
    assert(txt.includes('sin licencias') && txt.includes('no se sube a ningún sitio'), txt);
    assert.strictEqual(await pg.isChecked('input[name=destino][value=borr]'), true);
    bien('resumen: se reconoce la Hoja de resumen (sin hoja WEB), enseña el campeonato, la clasificación y el bloque; destino por defecto Borrador');
    await pg.click('#copiar-bloque');
    await pg.waitForSelector('#revision :text("Copiado: 7 filas")');
    const pegado = await pg.evaluate(() => navigator.clipboard.readText());
    assert.strictEqual(pegado.split('\n')[2], ['A', 3, 9005, 'Marta Puig', 9006, 'Xavi Bosch', '', 9007, 'Elena Sala', 2, 3, 'E'].join('\t'));
    assert.strictEqual(pegado.split('\n').length, 7);
    bien('resumen: «Copiar el bloque» deja en el portapapeles las 12 columnas del ranking (7 filas, con licencias)');
    await pg.check('input[name=destino][value=web]');
    await pg.waitForSelector('#revision li.avisa:has-text("M02")');
    await pg.click('#publicar');
    await pg.waitForSelector('#registro:has-text("Publicado")');
    const sinPub = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.publicado; delete c.jornadas; return c; };
    for (const f of ['jornada_07.json', 'actual.json']) {
      const t = api.repos.web.get(`datos/${ID}/${f}`).texto;
      assert(K.esSobre(t), f + ' no va cifrado');
      assert.deepStrictEqual(sinPub(api.json('web', `datos/${ID}/${f}`)), sinPub(ref));
    }
    assert.deepStrictEqual(api.json('web', `datos/${ID}/actual.json`).jornadas.map((j) => j.numero), [7]);
    const e = api.json('web', 'datos/indice.json').torneos.find((t) => t.id === ID);
    assert.deepStrictEqual(e, { id: ID, nombre: ref.torneo.nombre, tipo: 'parejas', temporada: null, fecha: '2027-02-06', estado: 'terminado', jornada_actual: 7, n_jornadas: 7, n_participantes: 6, ganador: { id: 7, corto: 'Soler-Serra' } });
    assert.strictEqual(await pg.getAttribute('#resultado a', 'href'), 'torneo.html?t=' + ID);
    assert.deepStrictEqual(api.enClaro, []);
    bien('resumen: «Publicar en la web» escribe jornada_07.json, actual.json (cifrados, con una sola partida) y su línea de indice.json, tipo parejas, terminado');
    for (const [, x] of api.repos.web) if (x.plano && /ranking-ejemplo/.test(x.plano) === false) assert(!/licencia|46\/ \d|9001|9013|F201/.test(x.plano), 'licencia en un archivo publicado');
    bien('resumen: ningún archivo que sube a la web lleva licencias (ni las de la Hoja de resumen)');
    await pg.setInputFiles('#archivo', libroOr());
    await pg.waitForSelector('#revision li.confirma:has-text("R13")');
    assert.strictEqual(await pg.isDisabled('#publicar'), true);
    await pg.check('#revision li.confirma input');
    assert.strictEqual(await pg.isDisabled('#publicar'), false);
    bien('resumen: si ya está publicado, pide confirmar antes de sustituirlo');
    await pg.setInputFiles('#archivo', libroOr(['--dif-mal']));
    await pg.waitForSelector('#revision li.bloquea:has-text("R06")');
    assert.strictEqual(await pg.isDisabled('#publicar'), true);
    assert.strictEqual(await pg.locator('#copiar-bloque').count(), 0);
    bien('resumen: con una cuenta que no cuadra no se puede publicar y no se ofrece el bloque');
    await pg.setInputFiles('#archivo', libroOr(['--sin-b']));
    await pg.waitForSelector('#revision .resumen:has-text("Sin grupo B")');
    await pg.check('input[name=destino][value=borr]');
    await pg.waitForSelector('#revision li.avisa:has-text("M01")');
    await pg.click('#publicar');
    await pg.waitForSelector('#registro:has-text("borrador")');
    const bj = api.json('borr', `datos/${ID}/actual.json`);
    assert.deepStrictEqual([bj.torneo.hay_b, bj.clasificacion.length], [false, 4]);
    bien('resumen: sin grupo B también se guarda (borrador, privado)');
    assert.deepStrictEqual(errores, []);
  }

  /* ============ PDF «Clasificación Partida» de Access: lo mismo que la Hoja de resumen, sin bloque (no trae licencias) y sin columnas vacías ============ */
  {
    const espec = { titulo: 'Torneo de Ejemplo - Villa Inventada', fecha: '20/02/2027', partidas: 7, filas_por_pagina: 3, grupos: {
      A: [[1, 5, 'Ana Roig Mas - Pau Vidal Soler', 6, 1, 1500, 2100, 600], [2, 3, 'Marta Puig - Toni Serra Vila', 5, 2, -2100, 1994, 4094],
        [3, 7, 'Rosa Mas Gil - Vicent Vila Pons', 4, 3, 12, 1200, 1188], [4, 2, 'Lola Soler Ruiz - Joan Ferrer Bosch', 3, 4, -5, 900, 905],
        [5, 9, 'XXX XXX - ZZZ ZZZ', 0, 7, -2100, 0, 2100]],
      B: [[1, 12, 'Nuria Pons - Albert Mora', 3, 0, 480, 900, 420], [2, 14, 'Elena Roca - Hugo Sanz Vila', 2, 1, -5, 700, 705]] } };
    const pdf = (e, n) => { const j = path.join(tmp, n + '.json'), f = path.join(tmp, n + '.pdf'); fs.writeFileSync(j, JSON.stringify(e)); execFileSync('python3', ['-I', path.join(__dirname, 'hacer_pdf.py'), j, f]); return f; };
    const ID = 'torneo-de-ejemplo-villa-inventada-2027-02-20';
    const { ctx, pg, api, errores } = await escenario({ semilla: sembrarWeb });
    await abrir(pg);
    await pg.setInputFiles('#archivo', pdf(espec, 'clasif'));
    await pg.waitForSelector('#revision .resumen');
    let txt = await pg.textContent('#revision');
    assert(txt.includes('Torneo de Ejemplo - Villa Inventada') && txt.includes('Con grupo B') && txt.includes('parejas'), txt);
    assert(txt.includes('P02') && txt.includes('P03') && txt.includes('Ana Roig Mas - Pau Vidal Soler'), txt);
    assert.strictEqual(await pg.locator('#copiar-bloque').count(), 0);
    assert((await pg.textContent('#fuente-ranking')).includes('No hay ningún Excel del ranking'), 'sin el Excel del ranking no se puede buscar a los jugadores del PDF: lo pide');
    assert.strictEqual(await pg.locator('#revision li.bloquea').count(), 0);
    bien('pdf: se lee un PDF de dos páginas (grupo A partido, relleno, negativa con miles); avisa del relleno y de las partidas del B, enseña la clasificación y no ofrece bloque');
    await pg.check('input[name=destino][value=borr]');
    await pg.click('#publicar');
    await pg.waitForSelector('#registro:has-text("borrador")');
    const j = api.json('borr', `datos/${ID}/actual.json`);
    assert.deepStrictEqual([j.torneo.tipo, j.torneo.estado, j.torneo.n_jornadas, j.torneo.fecha, j.torneo.hay_b, j.clasificacion.length], ['parejas', 'terminado', 7, '2027-02-20', true, 7]);
    assert.deepStrictEqual(j.participantes.map((p) => p.zona), [null, null, null, null, null, null, null]);
    assert.deepStrictEqual(j.clasificacion.filter((c) => c.grupo === 'A').map((c) => [c.puesto, c.id, c.dt]), [[1, 5, 1500], [2, 3, -2100], [3, 7, 12], [4, 2, -5], [5, 9, -2100]]);
    assert(!/licencia|"lic/i.test(JSON.stringify(j)));
    assert.deepStrictEqual(api.enClaro, []);
    bien('pdf: lo que se guarda es un campeonato de parejas terminado, solo clasificación, sin zona ni licencias, cifrado');
    await pg.goto(base + `/torneo.html?t=${ID}&borrador=1&ver=clasificacion`);
    await pg.waitForSelector('table.clasi');
    assert.deepStrictEqual(await pg.locator('table.clasi thead th').allInnerTexts(), ['Puesto', 'Nº', 'Pareja', 'P.G.', 'P.F.', 'P.C.', 'Dif.']);
    assert.strictEqual(await pg.locator('table.clasi tbody tr').count(), 5);
    bien('pdf: la web no enseña la columna Zona cuando ninguna pareja la tiene');
    await pg.goto(base + '/publicar.html'); await pg.waitForSelector('#lista-web[data-listo]');
    // un PDF con una cuenta que no cuadra no se publica
    const roto = JSON.parse(JSON.stringify(espec)); roto.grupos.A[1][5] = -2000;
    await pg.setInputFiles('#archivo', pdf(roto, 'roto'));
    await pg.waitForSelector('#revision li.bloquea:has-text("R06")');
    assert.strictEqual(await pg.isDisabled('#publicar'), true);
    bien('pdf: con Dif. ≠ P.F. − P.C. no se puede publicar');
    // algo que no es una clasificación
    const nada = path.join(tmp, 'nada.pdf'); fs.writeFileSync(nada, 'esto no es un pdf');
    await pg.setInputFiles('#archivo', nada);
    await pg.waitForSelector('#lectura :text("No es un archivo que la mesa publique")');
    assert.strictEqual(await pg.textContent('#publicar'), 'Guardar en programas-domino');
    bien('pdf: un archivo que no es PDF no se reconoce, no se publica y solo se ofrece guardarlo');
    assert.deepStrictEqual(await pg.evaluate(() => window.__csp), []);
    assert.deepStrictEqual(errores, []);
    bien('pdf: pdf.js corre con la política de seguridad de la página, sin una sola infracción ni error');
  }

  /* ============ Excel exportado de Access (hoja PX_05_Clasificacion_Exportar): la entrada principal de los organizadores de Access ============ */
  {
    const XLSX = require('../assets/xlsx.mini.min.js');
    const CAB = ['DET_TORNEO', 'TOR_NOMBRE', 'TOR_LOGO1', 'TOR_LOGO2', 'DET_GRUPO', 'SumaDeDET_GANADAS', 'SumaDeDET_PERDIDAS', 'SumaDeDET_DIFERENCIA', 'SumaDeDET_PUNTOSF', 'SumaDeDET_PUNTOSC', 'PrimeroDeDET_ALEATORIO', 'DET_PAREJA', 'JUGADORES.JUG_LICENCIA', 'PT_JUGADOR1', 'JUGADORES_1.JUG_LICENCIA', 'PT_JUGADOR2'];
    const f = (g, gan, per, dif, pf, pc, n, l1, n1, l2, n2) => [46348, 'Torneo de Access de Ejemplo', 'EJE', null, g, gan, per, dif, pf, pc, 1712289161, n, l1, n1, l2, n2];   // 46348 = 22/11/2026 (1/1/2026 = 46023, el 22/11 es el día 326)
    const filas = [f('A', 6, 1, 1500, 2100, 600, 5, '46/0921', 'Ana Roig Mas', '46/0922', 'Pau Vidal Soler'), f('A', 5, 2, -2100, 1994, 4094, 3, '46/0923', 'Marta Puig', '', 'Toni Serra Vila'),
      f('A', 0, 7, -2100, 0, 2100, 43, '46/xxxx', 'XXX XXX', '46/xxxx', 'ZZZ ZZZ'), f('A', 4, 3, 12, 1200, 1188, 7, '02/xxxx', 'Rosa Mas Gil', '46/0925', 'Vicent Vila Pons'),
      f('B', 3, 0, 480, 900, 420, 12, '46/0926', 'Nuria Pons', '46/0927', 'Albert Mora')];
    const excel = (rows, n, cab = CAB) => { const fch = path.join(tmp, n + '.xlsx'); fs.writeFileSync(fch, XLSX.write({ SheetNames: ['PX_05_Clasificacion_Exportar'], Sheets: { PX_05_Clasificacion_Exportar: XLSX.utils.aoa_to_sheet([cab, ...rows]) } }, { type: 'buffer', bookType: 'xlsx' })); return fch; };
    const ID = 'torneo-de-access-de-ejemplo-2026-11-22';
    const { ctx, pg, api, errores } = await escenario({ semilla: sembrarWeb });
    await abrir(pg);
    await pg.setInputFiles('#archivo', excel(filas, 'access'));
    await pg.waitForSelector('#revision .resumen');
    const txt = await pg.textContent('#revision');
    assert(txt.includes('Torneo de Access de Ejemplo') && txt.includes('Con grupo B') && txt.includes('P05') && txt.includes('P02') && txt.includes('Ana Roig Mas - Pau Vidal Soler'), txt);
    assert.strictEqual(await pg.locator('#copiar-bloque').count(), 1);
    assert(txt.includes('No se han comprobado') && !txt.includes('paso 1b'), 'sin el Excel del ranking, el bloque sale con el aviso de que las licencias no se han comprobado');
    assert.strictEqual(await pg.locator('#revision li.bloquea').count(), 0);
    assert((await pg.textContent('#lectura')).includes('Excel de Access'));
    bien('access: se reconoce el Excel exportado de Access, deduce las 7 partidas, avisa del relleno, enseña la clasificación y deja el bloque para el ranking (sin comprobar las licencias, que no hay Excel del ranking)');
    await pg.check('input[name=destino][value=borr]');
    await pg.click('#publicar');
    await pg.waitForSelector('#registro:has-text("borrador")');
    const j = api.json('borr', `datos/${ID}/actual.json`);
    assert.deepStrictEqual([j.torneo.tipo, j.torneo.estado, j.torneo.n_jornadas, j.torneo.fecha, j.torneo.hay_b, j.clasificacion.length], ['parejas', 'terminado', 7, '2026-11-22', true, 5]);
    assert.deepStrictEqual(j.clasificacion.filter((c) => c.grupo === 'A').map((c) => [c.puesto, c.id, c.dt]), [[1, 5, 1500], [2, 3, -2100], [3, 7, 12], [4, 43, -2100]]);
    assert.strictEqual(j.torneo.n_participantes, 5, 'la pareja XXX cuenta en el total');
    assert.strictEqual(j.participantes.find((p) => p.id === 43).corto, 'XXX-ZZZ');
    assert(!/licencia|"lic|0921|0922/i.test(JSON.stringify(j)), 'licencia en el JSON');
    assert.deepStrictEqual(api.enClaro, []);
    bien('access: lo que se guarda es un campeonato de parejas terminado, solo clasificación y sin licencias; la pareja XXX cuenta: sale la última del grupo A y en el total');
    await pg.goto(base + `/torneo.html?t=${ID}&borrador=1&ver=clasificacion`); await pg.waitForSelector('table.clasi');
    const filasW = await pg.$$eval('table.clasi tbody tr', (l) => l.map((x) => x.textContent));
    assert.strictEqual(filasW.findIndex((t) => /XXX/.test(t)), 3, 'cuarta fila: la última del grupo A: ' + JSON.stringify(filasW));
    bien('access: la web enseña la pareja XXX en la clasificación del grupo A, la última, como en el PDF');
    await abrir(pg);
    const roto = filas.map((x) => x.slice()); roto[1][7] = -2000;
    await pg.setInputFiles('#archivo', excel(roto, 'access_roto'));
    await pg.waitForSelector('#revision li.bloquea:has-text("R06")');
    assert.strictEqual(await pg.isDisabled('#publicar'), true);
    bien('access: con Dif. ≠ P.F. − P.C. no se puede publicar');
    await pg.setInputFiles('#archivo', excel(filas.map((x) => x.filter((_, i) => CAB[i] !== 'DET_GRUPO')), 'access_sin_columna', CAB.filter((c) => c !== 'DET_GRUPO')));
    await pg.waitForSelector('#revision li.bloquea:has-text("DET_GRUPO")');
    assert.strictEqual(await pg.isDisabled('#publicar'), true);
    bien('access: si falta una columna, dice cuál (por su nombre) y no deja publicar');
    assert.deepStrictEqual(errores, []);
  }

  /* ============ Archivos: descargar de programas-domino/entregables y subir a entregables/del_arbitro (siempre al repositorio privado) ============ */
  {
    const crypto = require('crypto');
    const DESC = ['# Descargas', '', '## Programas de campeonato', '', '| Archivo | Qué es | Fecha |', '|---|---|---|',
      '| `sp/24_SP_sin_macros.xlsx` | El programa del 24º Súper Prestigio. | 2026-11-15 |', '',
      '## Ranking FVD', '', '| Archivo | Qué es | Fecha |', '|---|---|---|',
      '| `ranking/Ranking_FVD_plantilla.xlsx` | El ranking vacío. | 2026-11-10 |',
      '| `ranking/leer_torneo.html` | Página que se abre con doble clic y deja los resultados listos para el ranking. | 2026-11-22 |', '',
      '## Otros', '', '| Archivo | Qué es | Fecha |', '|---|---|---|', '| `fantasma.txt` | Una línea cuyo archivo ya no está. | 2026-11-01 |', '',
      '## Mantenimiento', '', '| Archivo | Qué es | Fecha |', '|---|---|---|',
      '| `web/recortar.py` | Programa que recorta las capturas. | 2026-11-16 |', '| `web/capturas/` | Capturas del manual. | 2026-11-22 |', ''].join('\n');
    const GRANDE = crypto.randomBytes(1500000);                       // más de 1 MB: GitHub no trae su «content» y hay que pedir el blob
    const semilla = (a) => {
      a.poner('prog', 'entregables/DESCARGAS.md', DESC); a.poner('prog', 'entregables/ranking/leer_torneo.html', '<html>hola</html>'); a.poner('prog', 'entregables/ranking/Ranking_FVD_plantilla.xlsx', 'vacio'); a.poner('prog', 'entregables/web/recortar.py', 'print()');
      a.poner('prog', 'entregables/sp/24_SP_sin_macros.xlsx', GRANDE); a.poner('prog', 'entregables/web/capturas/pub-01.png', Buffer.from([1, 2, 3]));
      a.poner('prog', 'entregables/sin_linea.txt', 'x'); a.poner('prog', 'entregables/.gitkeep', '');
      a.ponerFecha('entregables/ranking/leer_torneo.html', '2026-11-22T14:05:09Z'); a.ponerFecha('entregables/ranking/Ranking_FVD_plantilla.xlsx', '2026-11-10T08:00:00Z');
    };
    const subida = (n, bytes) => ({ name: n, mimeType: 'application/octet-stream', buffer: bytes });
    const { ctx, pg, api, errores } = await escenario({ semilla });
    await abrir(pg);
    assert.strictEqual(await pg.locator('#archivos-lista li').count(), 0);
    assert.strictEqual(api.reqs.some((r) => /programas-domino/.test(r.ruta)), false);
    bien('archivos: al abrir la mesa no se llama a programas-domino hasta pulsar «Ver los archivos»');
    await pg.click('#archivos-ver');
    await pg.waitForSelector('#archivos-lista li.archivo');
    const cats = await pg.$$eval('#archivos-lista details.categoria', (l) => l.map((d) => [d.querySelector('summary .cat-nombre').textContent, d.querySelector('summary .cat-n').textContent, d.open]));
    assert.deepStrictEqual(cats, [['Programas de campeonato', '1 archivo', true], ['Ranking FVD', '2 archivos', true], ['Mantenimiento', '1 archivo', false]]);
    bien('archivos: una sección por categoría, en su orden, con el número de archivos; las vacías no salen y Mantenimiento va la última y cerrada');
    const nombresA = await pg.$$eval('#archivos-lista li.archivo .archivo-nombre', (l) => l.map((x) => x.textContent));
    assert.deepStrictEqual(nombresA, ['24_SP_sin_macros.xlsx', 'leer_torneo.html', 'Ranking_FVD_plantilla.xlsx', 'recortar.py']);
    bien('archivos: dentro de cada categoría, lo más reciente primero');
    assert.strictEqual(await pg.isVisible('#archivos-lista li:has-text("recortar.py")'), false);
    await pg.click('#archivos-lista summary:has-text("Mantenimiento")');
    assert.strictEqual(await pg.isVisible('#archivos-lista li:has-text("recortar.py")'), true);
    await pg.click('#archivos-lista summary:has-text("Mantenimiento")');
    assert.strictEqual(await pg.isVisible('#archivos-lista li:has-text("recortar.py")'), false);
    await pg.click('#archivos-lista summary:has-text("Programas de campeonato")');
    assert.strictEqual(await pg.isVisible('#archivos-lista li:has-text("24_SP_sin_macros.xlsx")'), false);
    await pg.click('#archivos-lista summary:has-text("Programas de campeonato")');
    assert.strictEqual(await pg.isVisible('#archivos-lista li:has-text("24_SP_sin_macros.xlsx")'), true);
    bien('archivos: cada categoría se abre y se cierra con un clic en su título');
    const txtA = await pg.textContent('#archivos-estado') + await pg.textContent('#archivos-lista');
    assert(txtA.includes('Página que se abre con doble clic') && txtA.includes('Actualizado: 22/11/2026 15:05:09') && txtA.includes('1,4 MB') && txtA.includes('Hay 1 archivo sin descripción'), txtA);
    assert(!txtA.includes('fantasma') && !txtA.includes('pub-01') && !txtA.includes('.gitkeep') && !txtA.includes('Capturas del manual'), txtA);
    bien('archivos: lista lo que tiene línea en DESCARGAS.md y existe (nombre, carpeta, frase, fecha y tamaño); no enseña carpetas, huérfanos ni sin línea, y cuenta los sin descripción');
    const [d1] = await Promise.all([pg.waitForEvent('download'), pg.click('#archivos-lista li:has-text("24_SP_sin_macros.xlsx") button')]);
    assert.strictEqual(d1.suggestedFilename(), '24_SP_sin_macros.xlsx');
    assert(fs.readFileSync(await d1.path()).equals(GRANDE));
    assert(api.reqs.some((r) => /\/git\/blobs\/[0-9a-f]{40}$/.test(r.ruta) && r.auth === 'Bearer ' + TOKEN));
    bien('archivos: «Descargar» baja el archivo tal cual (también el de más de 1 MB) con la API de GitHub y el token del panel');
    const [d2] = await Promise.all([pg.waitForEvent('download'), pg.click('#archivos-lista li:has-text("leer_torneo.html") button')]);
    assert.strictEqual(fs.readFileSync(await d2.path(), 'utf8'), '<html>hola</html>');
    assert.strictEqual(await pg.locator('#subir-boton, #subir-archivo').count(), 0);
    bien('archivos: la sección solo lista y descarga; subir se hace con «Subir archivo» (paso 4)');
    assert.deepStrictEqual(await pg.evaluate(() => window.__csp), []);
    assert.deepStrictEqual(errores, []);
    bien('archivos: con la política de seguridad de la página no hay una sola infracción ni error');
    await ctx.close();
    {
      // sin permiso en programas-domino
      const sin = await escenario({ semilla, acceso: { prog: false } });
      await abrir(sin.pg);
      await sin.pg.click('#archivos-ver');
      await sin.pg.waitForFunction(() => document.querySelector('#archivos-estado').textContent.includes('programas-domino'));
      const t = await sin.pg.textContent('#archivos-estado');
      assert(t.includes('Repository access') && t.includes('Contents: Read and write') && t.includes('ningún otro token'), t);
      assert.strictEqual(await sin.pg.locator('#archivos-lista li').count(), 0);
      bien('archivos: con un token sin programas-domino lo dice y explica cómo añadirlo (Contents: Read and write), y el resto de la página sigue');
      await sin.ctx.close();
      // token de solo lectura: se puede descargar
      const lec = await escenario({ semilla });
      lec.api.soloLectura.prog = true;
      await abrir(lec.pg);
      await lec.pg.click('#archivos-ver');
      await lec.pg.waitForSelector('#archivos-lista li.archivo');
      assert.strictEqual(await lec.pg.locator('#archivos-lista li.archivo').count() > 0, true);
      bien('archivos: con un token de solo lectura se puede descargar');
      await lec.ctx.close();
    }

    /* ---- fecha y hora al segundo de cada archivo (último commit en programas-domino), con una sola consulta GraphQL ---- */
    {
      const DESC2 = ['# Descargas', '', '## Ranking FVD', '', '| Archivo | Qué es | Fecha |', '|---|---|---|',
        '| `ranking/Ranking_FVD_2026-27.xlsx` | El ranking de la temporada (copia del agente). | 2026-11-20 |',
        '| `del_arbitro/ranking-fvd/Ranking_FVD_2026-27.xlsx` | El ranking que subió el árbitro. | 2026-01-01 |',
        '| `ranking/leer_torneo.html` | Página de lectura. | 2026-11-30 |', '',
        '## Torneos', '', '| Archivo | Qué es | Fecha |', '|---|---|---|',
        '| `del_arbitro/torneos/Verano.xlsx` | Lista de verano. | 2026-12-31 |', ''].join('\n');
      const semilla2 = (a) => {
        a.poner('prog', 'entregables/DESCARGAS.md', DESC2);
        for (const r of ['ranking/Ranking_FVD_2026-27.xlsx', 'del_arbitro/ranking-fvd/Ranking_FVD_2026-27.xlsx', 'ranking/leer_torneo.html', 'del_arbitro/torneos/Verano.xlsx']) a.poner('prog', 'entregables/' + r, 'x');
        a.ponerFecha('entregables/ranking/Ranking_FVD_2026-27.xlsx', '2026-11-23T08:09:05Z');                 // invierno (UTC+1): 09:09:05
        a.ponerFecha('entregables/del_arbitro/ranking-fvd/Ranking_FVD_2026-27.xlsx', '2026-11-23T08:09:07Z');  // el mismo día, dos segundos después
        a.ponerFecha('entregables/ranking/leer_torneo.html', '2026-03-29T00:59:59Z');                          // el último segundo antes del cambio de hora: 01:59:59
        a.ponerFecha('entregables/del_arbitro/torneos/Verano.xlsx', '2026-07-15T21:59:59Z');                   // verano (UTC+2): 23:59:59
      };
      const e2 = await escenario({ semilla: semilla2 });
      await abrir(e2.pg);
      await e2.pg.click('#archivos-ver');
      await e2.pg.waitForSelector('#archivos-lista li.archivo');
      const fechas = await e2.pg.$$eval('#archivos-lista li.archivo', (l) => l.map((x) => [x.querySelector('.archivo-nombre').textContent, x.querySelector('.archivo-ruta').textContent, x.querySelector('.archivo-fecha').textContent]));
      assert.deepStrictEqual(fechas, [
        ['Ranking_FVD_2026-27.xlsx', 'del_arbitro/ranking-fvd/', 'Actualizado: 23/11/2026 09:09:07'],
        ['Ranking_FVD_2026-27.xlsx', 'ranking/', 'Actualizado: 23/11/2026 09:09:05'],
        ['leer_torneo.html', 'ranking/', 'Actualizado: 29/03/2026 01:59:59'],
        ['Verano.xlsx', 'del_arbitro/torneos/', 'Actualizado: 15/07/2026 23:59:59']]);
      bien('archivos: «Actualizado: dd/mm/aaaa hh:mm:ss» en hora de Madrid (invierno +1, verano +2), del último commit; lo más reciente primero y, con el mismo nombre en dos carpetas, se distinguen por carpeta y segundo (la columna Fecha de DESCARGAS.md no cuenta)');
      const texto2 = await e2.pg.textContent('#archivos-lista');
      assert(!/2026-11-20|2026-12-31|2026-11-30|31\/12\/2026/.test(texto2), texto2);
      bien('archivos: la fecha escrita a mano en DESCARGAS.md no se enseña');
      assert.strictEqual(e2.api.graphql.length, 1);
      assert.strictEqual(e2.api.graphql[0].auth, 'Bearer ' + TOKEN);
      assert.deepStrictEqual(Object.values(e2.api.graphql[0].variables).sort(), ['entregables/del_arbitro/ranking-fvd/Ranking_FVD_2026-27.xlsx', 'entregables/del_arbitro/torneos/Verano.xlsx', 'entregables/ranking/Ranking_FVD_2026-27.xlsx', 'entregables/ranking/leer_torneo.html']);
      assert(!/entregables\//.test(e2.api.graphql[0].query), 'las rutas van como variables, no pegadas en la consulta');
      const peticiones = e2.api.reqs.filter((r) => /programas-domino|graphql/.test(r.ruta)).map((r) => r.metodo + ' ' + r.ruta.replace(/[0-9a-f]{40}/, '<sha>'));
      assert.deepStrictEqual(peticiones, ['GET /repos/JUGUEMOSDOMINO/programas-domino', 'GET /repos/JUGUEMOSDOMINO/programas-domino/git/trees/main', 'GET /repos/JUGUEMOSDOMINO/programas-domino/contents/entregables/DESCARGAS.md', 'POST /graphql']);
      bien('archivos: una sola consulta GraphQL para todas las fechas (4 peticiones al abrir la lista, sin una por archivo), con el token del panel');
      assert.deepStrictEqual(await e2.pg.evaluate(() => window.__csp), []); assert.deepStrictEqual(e2.errores, []);
      await e2.ctx.close();
      for (const fallo of [500, 403, 'errores']) {
        const e3 = await escenario({ semilla: semilla2 });
        e3.api.fallarGraphql = fallo;
        await abrir(e3.pg);
        await e3.pg.click('#archivos-ver');
        await e3.pg.waitForSelector('#archivos-lista li.archivo');
        const f3 = await e3.pg.$$eval('#archivos-lista li.archivo', (l) => l.map((x) => [x.querySelector('.archivo-nombre').textContent, x.querySelector('.archivo-fecha').textContent]));
        assert.strictEqual(f3.length, 4);
        assert(f3.every((x) => x[1] === 'Fecha no disponible'), JSON.stringify(f3));
        assert.deepStrictEqual(await e3.pg.$$eval('#archivos-lista li.archivo button', (l) => l.length), 4);
        assert.strictEqual(await e3.pg.textContent('#archivos-estado'), '');
        assert.deepStrictEqual(e3.errores, []);
        await e3.ctx.close();
      }
      bien('archivos: si la consulta de fechas falla (500, sin permiso o con errores), la lista sale igual con «Fecha no disponible» y se puede descargar');
    }
  }


  /* ============ «Subir archivo»: un solo botón; reconoce el archivo por su contenido, dice qué va a hacer, pide confirmar y guarda copia del original en programas-domino ============ */
  {
    const XLSX = require('../assets/xlsx.mini.min.js');
    const DESCARGAS = ['# Descargas', '', '| Archivo | Qué es | Fecha |', '|---|---|---|', '| `sp/24_SP_sin_macros.xlsx` | El programa del 24º Súper Prestigio. | 2026-11-15 |', ''].join('\n');
    // Excel del ranking inventado: hojas Jugadores y Licencias como las del programa del ranking
    const JUG = [['J0001', 'Ana', 'Roig', 'Mas', '921'], ['J0002', 'Pau', 'Vidal', 'Soler', '922'], ['J0003', 'Marta', 'Puig', 'Sanz', '923'], ['J0004', 'Toni', 'Serra', 'Vila', '5551'],
      ['J0005', 'Rosa', 'Mas', 'Gil', '5552'], ['J0006', 'Rosa', 'Mas', 'Gil', '5553'], ['J0007', 'Vicent', 'Vila', 'Pons', '925'], ['J0008', 'Nuria', 'Pons', 'Gil', '926'],
      ['J0009', 'Albert', 'Mora', 'Roca', '927'], ['J0010', 'Lola', 'Soler', 'Gil', '9001'], ['J0011', 'Joan', 'Ferrer', 'Pla', '7001']];
    const LIC = [[921, 'J0001', 2020, null], [922, 'J0002', 2020, null], [923, 'J0003', 2020, null], [5551, 'J0004', 2026, null], [5552, 'J0005', 2026, null], [5553, 'J0006', 2025, null],
      [925, 'J0007', 2020, null], [926, 'J0008', 2020, null], [927, 'J0009', 2020, null], [9001, 'J0010', 2020, null], [7001, 'J0011', 2026, null]];
    // `torneos`: filas ya cargadas en el Excel del ranking (hojas Torneos y Resultados, con el bloque del torneo 1 desde la fila 6)
    const rankingXlsx = (torneos) => XLSX.write({ SheetNames: ['Jugadores', 'Licencias', ...(torneos ? ['Torneos', 'Resultados'] : [])], Sheets: { ...(torneos ? {
      Torneos: XLSX.utils.aoa_to_sheet([[], [], [1, torneos.nombre, torneos.fecha]]),
      Resultados: XLSX.utils.aoa_to_sheet([[], [], [], [], [], ...Array.from({ length: torneos.filas }, (_, i) => [i < 5 ? 'A' : 'B', i + 1, 'NO', 'Nombre inventado', 'NO', 'Otro nombre inventado'])]) } : {}),
      Jugadores: XLSX.utils.aoa_to_sheet([[], ['Código', 'Nombre', '1er apellido', '2º apellido', 'Licencia vigente'], ...JUG]),
      Licencias: XLSX.utils.aoa_to_sheet([[], ['Licencia', 'Código de jugador', 'Asociación', 'Año desde', 'Año hasta'], ...LIC.map((l) => [l[0], l[1], 'Asociación de ejemplo', l[2], l[3]])]) } }, { type: 'buffer', bookType: 'xlsx' });
    const semilla = (conRanking = true) => (a) => {
      sembrarWeb(a); a.poner('prog', 'entregables/DESCARGAS.md', DESCARGAS); a.poner('prog', 'entregables/sp/24_SP_sin_macros.xlsx', 'x');
      if (conRanking) { a.poner('prog', 'entregables/ranking/Ranking_FVD_2026-27.xlsx', rankingXlsx()); a.poner('prog', 'entregables/ranking/Ranking_FVD_plantilla.xlsx', 'vacia'); }
    };
    const RKJ = path.join(__dirname, 'datos', 'ranking-ejemplo', 'actual.json');
    const libroRk = () => { const f = path.join(tmp, 'ranking-unico.xlsx'); execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_ranking.py'), RKJ, f]); return f; };
    const libroOr = () => { const f = path.join(tmp, 'organizador-unico.xlsx'); execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_organizador.py'), f]); return f; };
    const espec = { titulo: 'Torneo de Ejemplo - Villa Inventada', fecha: '20/02/2027', partidas: 7, filas_por_pagina: 3, grupos: {
      A: [[1, 5, 'Ana Roig Mas - Pau Vidal Soler', 6, 1, 1500, 2100, 600], [2, 3, 'Marta Puig - Toni Serra Vila', 5, 2, -2100, 1994, 4094],
        [3, 7, 'Rosa Mas Gil - Vicent Vila Pons', 4, 3, 12, 1200, 1188], [4, 2, 'Lola Soler Ruiz - Joan Ferrer Bosch', 3, 4, -5, 900, 905],
        [5, 9, 'XXX XXX - ZZZ ZZZ', 0, 7, -2100, 0, 2100]],
      B: [[1, 12, 'Nuria Pons - Albert Mora', 3, 0, 480, 900, 420], [2, 14, 'Elena Roca - Hugo Sanz Vila', 2, 1, -5, 700, 705]] } };
    const pdf = (e, n) => { const j = path.join(tmp, n + '.json'), f = path.join(tmp, n + '.pdf'); fs.writeFileSync(j, JSON.stringify(e)); execFileSync('python3', ['-I', path.join(__dirname, 'hacer_pdf.py'), j, f]); return f; };
    const CAB = ['DET_TORNEO', 'TOR_NOMBRE', 'TOR_LOGO1', 'TOR_LOGO2', 'DET_GRUPO', 'SumaDeDET_GANADAS', 'SumaDeDET_PERDIDAS', 'SumaDeDET_DIFERENCIA', 'SumaDeDET_PUNTOSF', 'SumaDeDET_PUNTOSC', 'PrimeroDeDET_ALEATORIO', 'DET_PAREJA', 'JUGADORES.JUG_LICENCIA', 'PT_JUGADOR1', 'JUGADORES_1.JUG_LICENCIA', 'PT_JUGADOR2'];
    const f = (g, gan, per, dif, pf, pc, n, l1, n1, l2, n2) => [46348, 'Torneo de Access de Ejemplo', 'EJE', null, g, gan, per, dif, pf, pc, 1712289161, n, l1, n1, l2, n2];   // 46348 = 22/11/2026 (1/1/2026 = 46023, el 22/11 es el día 326)
    const filas = [f('A', 6, 1, 1500, 2100, 600, 5, '46/0921', 'Ana Roig Mas', '46/0922', 'Pau Vidal Soler'), f('A', 5, 2, -2100, 1994, 4094, 3, '46/0923', 'Marta Puig', '', 'Toni Serra Vila'),
      f('A', 0, 7, -2100, 0, 2100, 43, '46/xxxx', 'XXX XXX', '46/xxxx', 'ZZZ ZZZ'), f('A', 4, 3, 12, 1200, 1188, 7, '02/xxxx', 'Rosa Mas Gil', '46/0925', 'Vicent Vila Pons'),
      f('B', 3, 0, 480, 900, 420, 12, '46/0926', 'Nuria Pons', '46/0927', 'Albert Mora')];
    const excel = (rows, n, cab = CAB) => { const fch = path.join(tmp, n + '.xlsx'); fs.writeFileSync(fch, XLSX.write({ SheetNames: ['PX_05_Clasificacion_Exportar'], Sheets: { PX_05_Clasificacion_Exportar: XLSX.utils.aoa_to_sheet([cab, ...rows]) } }, { type: 'buffer', bookType: 'xlsx' })); return fch; };
    const accesoXlsx = () => excel(filas, 'access-unico');
    const copiaDe = (api, r) => api.bytes('prog', 'entregables/' + r);
    const lineaDe = (api, r) => api.repos.prog.get('entregables/DESCARGAS.md').texto.toString().split('\n').find((l) => l.includes('`' + r + '`'));
    const seccionDe = (api, r) => { let sec = null; for (const l of api.repos.prog.get('entregables/DESCARGAS.md').texto.toString().split('\n')) { const h = /^## (.*)$/.exec(l); if (h) sec = h[1]; if (l.includes('`' + r + '`')) return sec; } return null; };
    const soloDatos = (api) => api.puts.every((x) => /^datos\//.test(x.ruta) && !/\.(xlsx|xlsm|pdf|csv)$/.test(x.ruta.replace(/\.cifrado$/, '')) || /normativa\.pdf\.cifrado$/.test(x.ruta));
    const leerPortapapeles = (pg) => pg.evaluate(() => navigator.clipboard.readText());

    // --- Excel de un campeonato (hoja WEB): reconoce, pide confirmar, se puede cancelar, publica cifrado y guarda copia
    {
      const { ctx, pg, api, errores } = await escenario({ semilla: semilla() });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
      await abrir(pg);
      assert.strictEqual(await pg.locator('#archivo').getAttribute('accept'), null);
      assert.strictEqual(await pg.locator('input[type=file]').count(), 1, 'un solo campo para subir archivos en la página');
      const f = xlsx('sp-ejemplo', 'Mi campeonato de ejemplo.xlsx');
      await pg.setInputFiles('#archivo', f);
      await pg.waitForSelector('#revision .resumen');
      let t = await pg.textContent('#lectura');
      assert(t.includes('He reconocido un Excel de campeonato del Súper Prestigio') && t.includes('Voy a') && t.includes('copia del original en programas-domino') && t.includes('entregables/del_arbitro/torneos/'), t);
      assert.strictEqual(await pg.isVisible('#publicar'), true); assert.strictEqual(await pg.isVisible('#cancelar'), true);
      assert.deepStrictEqual([api.puts.length, api.putsProg.length], [0, 0]);
      bien('subir: reconoce el Excel de un campeonato por su contenido y dice en una frase qué va a hacer, con botón para confirmar y otro para cancelar; no toca nada todavía');
      await pg.click('#cancelar');
      assert((await pg.textContent('#lectura')).includes('Cancelado'));
      assert.strictEqual(await pg.isVisible('#paso-publicar'), false); assert.strictEqual(await pg.isVisible('#paso-revision'), false);
      assert.deepStrictEqual([api.puts.length, api.putsProg.length, api.dels.length], [0, 0, 0]);
      bien('subir: «Cancelar» lo deja todo como estaba y no escribe nada en ningún repositorio');
      await pg.setInputFiles('#archivo', f);
      await pg.waitForSelector('#revision .resumen');
      assert.strictEqual(await pg.inputValue('#subir-desc'), 'Excel del campeonato de «CAMPEONATO SÚPER-PRESTIGIO DE EJEMPLO».');
      await pg.fill('#subir-desc', 'Jornada 3 del SP de ejemplo | versión del árbitro');
      await pg.check('input[name=destino][value=web]');
      assert((await pg.textContent('#lectura')).includes('publicarlo en la web, cifrado'));
      await pg.click('#publicar');
      await pg.waitForSelector('#registro:has-text("Copia del original guardada")');
      assert(copiaDe(api, 'del_arbitro/torneos/Mi campeonato de ejemplo.xlsx').equals(fs.readFileSync(f)));
      assert.strictEqual(seccionDe(api, 'del_arbitro/torneos/Mi campeonato de ejemplo.xlsx'), 'Torneos');
      assert(lineaDe(api, 'del_arbitro/torneos/Mi campeonato de ejemplo.xlsx').includes('Jornada 3 del SP de ejemplo / versión del árbitro'));
      assert(api.puts.length >= 3 && soloDatos(api), 'a la web solo van datos cifrados: ' + api.puts.map((x) => x.ruta).join(', '));
      assert.deepStrictEqual(api.enClaro, []);
      assert.deepStrictEqual(api.putsProg.map((x) => x.ruta), ['entregables/del_arbitro/torneos/Mi campeonato de ejemplo.xlsx', 'entregables/DESCARGAS.md']);
      bien('subir: al confirmar publica cifrado como antes y guarda la copia del original en programas-domino/entregables/del_arbitro/torneos/, con su línea en Torneos (descripción propuesta y editable); el Excel no va a la web');
      await pg.click('#archivos-ver'); await pg.waitForSelector('#archivos-lista li:has-text("Mi campeonato de ejemplo.xlsx")');
      bien('subir: la copia sale en la lista de Archivos sin recargar');
      assert.deepStrictEqual(await pg.evaluate(() => window.__csp), []); assert.deepStrictEqual(errores, []);
      await ctx.close();
    }
    // --- Excel del ranking: se publica el ranking y la copia va a ranking-fvd/
    {
      const { pg, api } = await escenario({ semilla: semilla() });
      await abrir(pg);
      const f = libroRk();
      await pg.setInputFiles('#archivo', f);
      await pg.waitForSelector('#revision .resumen');
      const t = await pg.textContent('#lectura');
      assert(t.includes('He reconocido el Excel del ranking') && t.includes('entregables/del_arbitro/ranking-fvd/'), t);
      await pg.check('input[name=destino][value=web]');
      await pg.click('#publicar');
      await pg.waitForSelector('#registro:has-text("Ranking publicado")');
      await pg.waitForSelector('#registro:has-text("Copia del original guardada")');
      assert(copiaDe(api, 'del_arbitro/ranking-fvd/ranking-unico.xlsx').equals(fs.readFileSync(f)));
      assert.strictEqual(seccionDe(api, 'del_arbitro/ranking-fvd/ranking-unico.xlsx'), 'Ranking FVD');
      assert(soloDatos(api)); assert.deepStrictEqual(api.enClaro, []);
      bien('subir: el Excel del ranking se reconoce, se publica (cifrado, con licencias solo ahí) y su copia va a ranking-fvd/ con su línea en Ranking FVD');
    }
    // --- Excel de Access, con el Excel del ranking de entregables/: comprueba licencias, resuelve doble licencia y deja el bloque A:L
    {
      const { ctx, pg, api } = await escenario({ semilla: semilla() });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
      await abrir(pg);
      await pg.setInputFiles('#archivo', accesoXlsx());
      await pg.waitForSelector('#revision .resumen');
      assert((await pg.textContent('#lectura')).includes('He reconocido el Excel de Access'));
      assert((await pg.textContent('#fuente-ranking')).includes('Ranking_FVD_2026-27.xlsx') && (await pg.textContent('#fuente-ranking')).includes('entregables/'));
      assert(!(await pg.textContent('#fuente-ranking')).includes('plantilla'));
      assert((await pg.textContent('#revision')).includes('Faltan por identificar 2 jugadores'));
      assert.strictEqual(await pg.locator('.pend:has-text("XXX")').count(), 0, 'la pareja XXX no queda pendiente: cuenta, sin licencias');
      assert.strictEqual(await pg.locator('#copiar-bloque').count(), 0, 'con dudas sin resolver no se ofrece el bloque');
      assert.strictEqual(await pg.isDisabled('#publicar'), false, 'las dudas del bloque no impiden publicar la clasificación');
      await pg.click('button:text-is("Confirmar la propuesta de un solo candidato (puntúa con su licencia de Valencia)")');
      await pg.waitForSelector('#revision :text("Falta identificar a 1 jugador")');
      await pg.selectOption('.pend select', 'J0006');
      await pg.waitForSelector('#copiar-bloque');
      await pg.click('#copiar-bloque');
      await pg.waitForFunction(() => document.querySelector('#revision').textContent.includes('Copiado'));
      const tsv = await leerPortapapeles(pg), V = '\t\t\t\t\t\t';
      assert.deepStrictEqual(tsv.split('\n'), ['A\t1\t921\tAna Roig Mas\t922\tPau Vidal Soler' + V, 'A\t2\t923\tMarta Puig\t5551\tToni Serra' + V, 'A\t3\t5553\tRosa Mas\t925\tVicent Vila Pons' + V, 'A\t4\tNO\tXXX XXX\tNO\tZZZ ZZZ' + V, 'B\t1\t926\tNuria Pons\t927\tAlbert Mora' + V]);
      bien('access: con el Excel del ranking de entregables/ comprueba las licencias, propone la doble licencia (confirmar uno, elegir entre dos) y deja el bloque A:L para copiar');
      await pg.check('input[name=destino][value=borr]');
      await pg.click('#publicar');
      await pg.waitForSelector('#registro:has-text("Copia del original guardada")');
      assert(copiaDe(api, 'del_arbitro/torneos/access-unico.xlsx').equals(fs.readFileSync(path.join(tmp, 'access-unico.xlsx'))));
      assert(!JSON.stringify(api.json('borr', 'datos/torneo-de-access-de-ejemplo-2026-11-22/actual.json')).includes('5553'), 'las licencias no van a lo publicado');
      assert(soloDatos(api));
      bien('access: publica la clasificación sin licencias y guarda copia del original en torneos/');
      await ctx.close();
    }
    // --- Torneo que ya está en el Excel del ranking (mismo nombre y fecha): avisa y ofrece «Sustituir las filas de ese torneo»; nunca se duplica
    {
      const { ctx, pg } = await escenario({ semilla: (a) => { semilla()(a); a.poner('prog', 'entregables/ranking/Ranking_FVD_2026-27.xlsx', rankingXlsx({ nombre: '7º ACCESS EJEMPLO', fecha: 46348, filas: 8 })); } });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
      await abrir(pg);
      await pg.setInputFiles('#archivo', accesoXlsx());
      await pg.waitForSelector('#torneo-cargado');
      const aviso = await pg.textContent('#torneo-cargado');
      assert(aviso.includes('ya está en el Excel del ranking') && aviso.includes('columna 1') && aviso.includes('22/11/2026') && aviso.includes('8 filas') && aviso.includes('No lo añadas como un torneo nuevo'), aviso);
      await pg.waitForSelector('#revision :text("Faltan por identificar")');
      await pg.click('button:has-text("Confirmar la propuesta de un solo candidato")');
      await pg.selectOption('.pend select', 'J0006');
      await pg.waitForSelector('#sustituir-bloque');
      assert.strictEqual(await pg.locator('#copiar-bloque').count(), 0, 'con el torneo ya cargado no se ofrece copiar el bloque como nuevo');
      assert.strictEqual(await pg.textContent('#sustituir-bloque'), 'Sustituir las filas de ese torneo');
      await pg.click('#sustituir-bloque');
      await pg.waitForFunction(() => document.querySelector('#revision').textContent.includes('Copiado'));
      const filas = (await leerPortapapeles(pg)).split('\n');
      assert.strictEqual(filas.length, 8, 'las 5 filas del bloque y 3 vacías para cubrir las 8 que tenía el torneo');
      assert(filas.slice(5).every((f) => f === '\t'.repeat(11)) && filas[0].startsWith('A\t1\t921\tAna Roig'), filas.join(' // '));
      const msg = await pg.textContent('#revision');
      assert(msg.includes('3 vacías') && msg.includes('Bloque t01') && msg.includes('No crees otro torneo'), msg);
      bien('torneo ya cargado: avisa (columna, nombre, fecha y filas), ofrece «Sustituir las filas de ese torneo» y copia el bloque con filas vacías hasta cubrir las que tenía, para no duplicar');
      await ctx.close();
    }
    // el mismo Excel del ranking sin ese torneo cargado: se ofrece copiar el bloque como siempre
    {
      const { ctx, pg } = await escenario({ semilla: (a) => { semilla()(a); a.poner('prog', 'entregables/ranking/Ranking_FVD_2026-27.xlsx', rankingXlsx({ nombre: '3º OTRO TORNEO', fecha: 46348, filas: 8 })); } });
      await abrir(pg);
      await pg.setInputFiles('#archivo', accesoXlsx());
      await pg.waitForSelector('#revision :text("Faltan por identificar")');
      assert.strictEqual(await pg.locator('#torneo-cargado').count(), 0);
      bien('torneo ya cargado: otro nombre con la misma fecha no se confunde con el que se sube');
      await ctx.close();
    }
    // --- Hoja de resumen: A a F se comprueban contra el ranking; G a L (retiradas y sustituciones) son de la hoja
    {
      const { ctx, pg } = await escenario({ semilla: semilla() });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
      await abrir(pg);
      await pg.setInputFiles('#archivo', libroOr());
      await pg.waitForSelector('#revision .resumen');
      assert((await pg.textContent('#lectura')).includes('He reconocido la Hoja de resumen'));
      await pg.waitForSelector('#revision :text("Faltan por identificar 2 jugadores")');
      await pg.click('button:text-is("Confirmar las 2 propuestas de un solo candidato (puntúan con su licencia de Valencia)")');
      await pg.waitForSelector('#copiar-bloque'); await pg.click('#copiar-bloque');
      await pg.waitForFunction(() => document.querySelector('#revision').textContent.includes('Copiado'));
      const filas = (await leerPortapapeles(pg)).split('\n');
      assert(filas.includes('A\t3\t9005\tMarta Puig\t9006\tXavi Bosch\t\t9007\tElena Sala\t2\t3\tE'), filas.join(' // '));
      assert(filas.includes('A\t4\t9008\tNuria Pons\t9009\tPep Ribes\t6\t\t\t\t\t10'), filas.join(' // '));
      assert(filas.includes('B\t1\t925\tVicent Vila\t9010\tCarla Camps\t\t\t\t\t\t'), filas.join(' // '));
      assert(filas.some((x) => x.startsWith('B\t2\t9011\tQuique Torres\t9012\tAlba Llorca') && x.includes('\t9013\tIker Climent\t1\t2\t10')), filas.join(' // '));
      assert(filas.some((x) => /^A\t2\t9003\tRosa María Mas\t7001\tJoan Ferrer\t/.test(x)), filas.join(' // '));
      assert.strictEqual(filas.length, 7);
      bien('resumen: comprueba las licencias contra el Excel del ranking, resuelve la doble licencia y mantiene las retiradas y sustituciones de la hoja (columnas G a L)');
      await ctx.close();
    }
    // --- PDF: sin el Excel del ranking no se puede buscar a los jugadores; con él, resuelve dudas y deja el bloque
    {
      const { ctx, pg, api } = await escenario({ semilla: semilla(false) });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
      await abrir(pg);
      await pg.setInputFiles('#archivo', pdf(espec, 'clasif-unico'));
      await pg.waitForSelector('#fuente-ranking');
      assert((await pg.textContent('#fuente-ranking')).includes('No hay ningún Excel del ranking en entregables/'));
      assert.strictEqual(await pg.locator('#copiar-bloque').count(), 0);
      const rk = path.join(tmp, 'ranking-elegido.xlsx'); fs.writeFileSync(rk, rankingXlsx());
      await pg.setInputFiles('#ranking-excel', rk);
      await pg.waitForSelector('#revision :text("Faltan por identificar")');
      assert((await pg.textContent('#fuente-ranking')).includes('ranking-elegido.xlsx') && (await pg.textContent('#fuente-ranking')).includes('has elegido'));
      await pg.selectOption('.pend:has-text("Rosa Mas Gil") select', 'J0005');
      for (let i = 0; i < 6 && await pg.locator('.pend').count(); i++) await pg.click('.pend button:text-is("No federado")');
      await pg.waitForSelector('#copiar-bloque');
      await pg.click('#copiar-bloque');
      await pg.waitForFunction(() => document.querySelector('#revision').textContent.includes('Copiado'));
      const filas = (await leerPortapapeles(pg)).split('\n');
      assert(filas[0].startsWith('A\t1\t921\tAna Roig\t922\tPau Vidal') && filas.some((x) => x.startsWith('A\t3\t5552\tRosa Mas')) && filas.some((x) => /^B\t2\tNO\tElena Roca\tNO\tHugo Sanz Vila/.test(x)), filas.join(' // '));
      assert(filas.some((x) => /^A\t5\tNO\tXXX XXX\tNO\tZZZ ZZZ\t/.test(x)), 'la pareja XXX cuenta: la última del A, con licencias NO: ' + filas.join(' // '));
      bien('pdf: con el Excel del ranking elegido busca a los jugadores por su nombre, deja elegir o marcar «No federado» y da el bloque A:L');
      await pg.check('input[name=destino][value=borr]');
      await pg.click('#publicar');
      await pg.waitForSelector('#registro:has-text("Copia del original guardada")');
      assert(copiaDe(api, 'del_arbitro/torneos/clasif-unico.pdf').equals(fs.readFileSync(path.join(tmp, 'clasif-unico.pdf'))));
      bien('pdf: se publica y la copia del PDF original (con sus nombres) va a programas-domino');
      await ctx.close();
    }
    // --- Otro archivo: no se publica nada; solo se guarda, con categoría y descripción obligatorias
    {
      const { pg, api } = await escenario({ semilla: semilla() });
      await abrir(pg);
      const notas = path.join(tmp, 'Notas de la mesa.txt'); fs.writeFileSync(notas, 'cosas');
      await pg.setInputFiles('#archivo', notas);
      await pg.waitForSelector('#subir-cat');
      assert((await pg.textContent('#lectura')).includes('No es un archivo que la mesa publique') && (await pg.textContent('#lectura')).includes('No se publica nada'));
      assert.strictEqual(await pg.textContent('#publicar'), 'Guardar en programas-domino'); assert.strictEqual(await pg.isDisabled('#publicar'), true);
      assert.deepStrictEqual(await pg.$$eval('#subir-cat option', (l) => l.map((o) => o.value)), ['', 'Programas de campeonato', 'Ranking FVD', 'Rankings publicados', 'Torneos', 'Manuales y guías', 'Otros']);
      await pg.fill('#subir-desc', 'Apuntes de la mesa');
      assert.strictEqual(await pg.isDisabled('#publicar'), true); assert((await pg.textContent('#pub-nota')).includes('categoría'));
      await pg.selectOption('#subir-cat', 'Otros');
      assert.strictEqual(await pg.isDisabled('#publicar'), false);
      await pg.fill('#subir-desc', '  '); assert.strictEqual(await pg.isDisabled('#publicar'), true); assert((await pg.textContent('#pub-nota')).includes('obligatoria'));
      await pg.fill('#subir-desc', 'Apuntes de la mesa');
      await pg.click('#publicar');
      await pg.waitForSelector('#registro:has-text("Guardado en programas-domino")');
      assert.strictEqual(copiaDe(api, 'del_arbitro/otros/Notas de la mesa.txt').toString(), 'cosas');
      assert.strictEqual(seccionDe(api, 'del_arbitro/otros/Notas de la mesa.txt'), 'Otros');
      assert.deepStrictEqual([api.puts.length, api.dels.length], [0, 0]);
      bien('subir (otro): no publica nada; guarda en programas-domino/entregables/del_arbitro/<categoría>/ con su línea en esa categoría; categoría y descripción obligatorias');
      await pg.setInputFiles('#archivo', notas);
      await pg.waitForSelector('#subir-cat'); await pg.fill('#subir-desc', 'Otra vez'); await pg.selectOption('#subir-cat', 'Otros');
      await pg.waitForSelector('#subir-pisar', { state: 'visible' }); assert.strictEqual(await pg.isDisabled('#publicar'), true);
      await pg.check('#subir-pisar'); assert.strictEqual(await pg.isDisabled('#publicar'), false);
      await pg.selectOption('#subir-cat', 'Torneos'); await pg.waitForFunction(() => document.querySelector('#subir-pisar-caja').hidden); assert.strictEqual(await pg.isDisabled('#publicar'), false);
      bien('subir (otro): el mismo nombre en la misma categoría pide confirmar la sustitución; en otra categoría no');
    }
    // --- Reconocido pero con errores (un teléfono en la hoja WEB): no se publica; se ofrece guardarlo solo
    {
      const { pg, api } = await escenario({ semilla: semilla() });
      await abrir(pg);
      const mal = path.join(tmp, 'con-error.xlsx');
      execFileSync('python3', ['-c', `
import sys
sys.argv=['x',r'${path.join(__dirname, 'datos/sp-ejemplo/actual.json')}',r'${mal}']
src=open(r'${path.join(__dirname, 'hacer_xlsx.py')}',encoding='utf-8').read().replace("wb.save(sys.argv[2])","ws['J5']='6' + '12 34' + ' 56 78'\\nwb.save(sys.argv[2])")
exec(src)`]);
      await pg.setInputFiles('#archivo', mal);
      await pg.waitForSelector('.vals li.bloquea');
      assert.strictEqual(await pg.isDisabled('#publicar'), true);
      await pg.click('#guardar-solo');
      await pg.waitForSelector('#subir-cat');
      assert.strictEqual(await pg.isVisible('#paso-revision'), false);
      assert.strictEqual(await pg.inputValue('#subir-cat'), 'Torneos'); assert.strictEqual(await pg.inputValue('#subir-desc'), 'Excel del campeonato de «CAMPEONATO SÚPER-PRESTIGIO DE EJEMPLO» con errores: no se publicó.');
      await pg.fill('#subir-desc', 'Excel con un error, para corregir');
      await pg.click('#publicar');
      await pg.waitForSelector('#registro:has-text("Guardado en programas-domino")');
      assert(copiaDe(api, 'del_arbitro/torneos/con-error.xlsx').equals(fs.readFileSync(mal)));
      assert.deepStrictEqual([api.puts.length, api.dels.length], [0, 0]);
      bien('subir (con errores): no publica; explica y ofrece solo guardarlo, con categoría y descripción');
      // un Excel con hoja WEB que no se puede leer (no es de ninguna forma conocida)
      const roto = path.join(tmp, 'roto-unico.xlsx');
      fs.writeFileSync(roto, XLSX.write({ SheetNames: ['WEB'], Sheets: { WEB: XLSX.utils.aoa_to_sheet([['x', 'y']]) } }, { type: 'buffer', bookType: 'xlsx' }));
      await pg.setInputFiles('#archivo', roto);
      await pg.waitForSelector('#guardar-solo, #subir-cat', { state: 'visible' });
      assert.strictEqual(await pg.isDisabled('#publicar'), true);
      assert.strictEqual(api.puts.length, 0);
      bien('subir (no reconocido): una hoja WEB ilegible no se publica y solo se ofrece guardarla');
    }
    // --- Archivos de siempre: la categoría y la descripción salen sugeridas (y se pueden cambiar)
    {
      const { pg, api } = await escenario({ semilla: semilla() });
      await abrir(pg);
      const sugerido = async (f, cat, desc) => {
        await pg.setInputFiles('#archivo', f);
        await pg.waitForSelector('#sugerido');
        assert.strictEqual(await pg.inputValue('#subir-cat'), cat); assert.strictEqual(await pg.inputValue('#subir-desc'), desc);
        assert.strictEqual(await pg.isDisabled('#publicar'), false);
        assert((await pg.textContent('#sugerido')).includes('sugeridas'));
      };
      const sinHoja = path.join(tmp, 'Ranking_FVD_plantilla.xlsx');
      fs.writeFileSync(sinHoja, XLSX.write({ SheetNames: ['INICIO', 'Jugadores', 'Licencias'], Sheets: { INICIO: XLSX.utils.aoa_to_sheet([['x']]), Jugadores: XLSX.utils.aoa_to_sheet([['x']]), Licencias: XLSX.utils.aoa_to_sheet([['x']]) } }, { type: 'buffer', bookType: 'xlsx' }));
      await sugerido(sinHoja, 'Ranking FVD', 'Excel del ranking, sin la hoja para la web.');
      const prog = path.join(tmp, 'Programa de parejas vacio.xlsx');
      fs.writeFileSync(prog, XLSX.write({ SheetNames: ['INICIO', 'PAREJAS'], Sheets: { INICIO: XLSX.utils.aoa_to_sheet([['x']]), PAREJAS: XLSX.utils.aoa_to_sheet([['x']]) } }, { type: 'buffer', bookType: 'xlsx' }));
      await sugerido(prog, 'Programas de campeonato', 'Programa de parejas, sin la hoja para la web.');
      const html = path.join(tmp, 'pagina.html'); fs.writeFileSync(html, '<html><head><title>Leer un campeonato para el ranking</title></head></html>');
      await sugerido(html, 'Ranking FVD', 'Página que lee un campeonato y deja listo el bloque para el ranking.');
      const man = path.join(tmp, 'Manual de la web.pdf'); fs.writeFileSync(man, '%PDF-1.4 roto');
      await sugerido(man, 'Manuales y guías', 'Manual o guía: Manual de la web.');
      await pg.fill('#subir-desc', 'Manual para imprimir'); await pg.selectOption('#subir-cat', 'Otros');
      await pg.click('#publicar');
      await pg.waitForSelector('#registro:has-text("Guardado en programas-domino")');
      assert.strictEqual(seccionDe(api, 'del_arbitro/otros/Manual de la web.pdf'), 'Otros');
      assert(lineaDe(api, 'del_arbitro/otros/Manual de la web.pdf').includes('Manual para imprimir'));
      bien('subir: los archivos de siempre se reconocen por lo que llevan dentro (o por su nombre) y salen con la categoría y la descripción sugeridas, que se pueden cambiar');
      // lo que no se reconoce no sugiere nada: todo vacío y obligatorio
      const raro = path.join(tmp, 'raro.dat'); fs.writeFileSync(raro, 'xx');
      await pg.setInputFiles('#archivo', raro); await pg.waitForSelector('#subir-cat');
      assert.strictEqual(await pg.locator('#sugerido').count(), 0); assert.strictEqual(await pg.inputValue('#subir-cat'), ''); assert.strictEqual(await pg.inputValue('#subir-desc'), '');
      assert.strictEqual(await pg.isDisabled('#publicar'), true);
      bien('subir: si no se reconoce nada, la categoría y la descripción quedan vacías y obligatorias');
    }
    // --- Token que no escribe en programas-domino: se publica igual, avisando de que no habrá copia
    {
      const { pg, api } = await escenario({ semilla: semilla() });
      api.soloLectura.prog = true;
      await abrir(pg);
      await pg.setInputFiles('#archivo', xlsx('sp-ejemplo', 'sin-copia.xlsx'));
      await pg.waitForSelector('#revision .resumen');
      const t = await pg.textContent('#lectura');
      assert(t.includes('No guardaré copia del original') && t.includes('solo puede leer programas-domino'), t);
      assert((await pg.textContent('#copia')).includes('No se guardará copia'));
      await pg.check('input[name=destino][value=web]');
      await pg.click('#publicar');
      await pg.waitForSelector('#registro:has-text("Publicado")');
      assert.strictEqual(api.putsProg.length, 0); assert(api.puts.length >= 3);
      bien('subir: con un token de solo lectura en programas-domino se publica igual y dice que no habrá copia del original');
    }
    assert(apis.every((a) => soloDatos(a)), 'nada original del árbitro va a campeonatos-domino ni a borradores');
    bien('subir: en todos los casos, a campeonatos-domino y a borradores solo van datos (JSON o la normativa cifrada), nunca el archivo original');
  }

  assert.deepStrictEqual(apis.flatMap((a) => a.enClaro), [], 'algún PUT a la web iba sin cifrar');
  bien('en toda la prueba, ningún PUT a campeonatos-domino lleva un JSON en claro ni un PDF sin cifrar');
  assert.deepStrictEqual(externos, []);
  bien('ninguna petición de toda la prueba sale a otro sitio que la propia web o api.github.com');
  for (const c of abiertos) await c.close();
  await b.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${ok} comprobaciones bien`);
})().catch((e) => { console.error('FALLA:', e.message); process.exit(1); });
