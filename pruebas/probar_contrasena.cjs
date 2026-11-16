// La web con contraseña: pantalla de contraseña, «recordar», contraseña errónea, «Olvidar», descarga de la normativa cifrada,
// y que con la web servida tal cual y sin clave no se lee ningún nombre ni hay texto legible en datos/.
// Uso: node pruebas/probar_contrasena.cjs [url-base, por defecto http://localhost:8765]
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const K = require('./cripto_prueba.cjs');
const base = process.argv[2] || 'http://localhost:8765';
const raiz = path.join(__dirname, '..');
const D = 'd=datos/_prueba';
let ok = 0; const bien = (t) => { ok++; console.log('  ok  ' + t); };

const todos = (dir, pre = '') => fs.readdirSync(path.join(dir, pre), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? todos(dir, path.join(pre, e.name)) : [path.join(pre, e.name)]));
// Lo que no debe leerse sin contraseña: nombres y apellidos de los participantes (y de las sustituciones), teléfonos y cuentas.
function nombresDe(dir) {
  const n = new Set();
  for (const f of todos(dir).filter((x) => x.endsWith('.json'))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    for (const p of [...(j.participantes || []), ...(j.sustituciones || [])]) {
      for (const [k, v] of Object.entries(p)) if (typeof v === 'string' && /apellido1$|^corto$/.test(k) && v.length >= 4) n.add(v);
      for (const pre of ['j1', 'j2', 'sale', 'entra']) if (p[pre + '_nombre']) n.add(`${p[pre + '_nombre']} ${p[pre + '_apellido1']}`);
    }
  }
  return [...n];
}
const PROHIBIDO = [/Calap/i, /ES76/i, /(?<!\d)[6-9]\d{2}[ .-]?\d{3}[ .-]?\d{3}(?!\d)/];
const html = ['index.html', 'torneo.html'].map((f) => fs.readFileSync(path.join(raiz, f), 'utf8')).join(' ');
const NOMBRES_PRUEBA = nombresDe(path.join(__dirname, 'datos')).filter((x) => !html.includes(x));

(async () => {
  assert(NOMBRES_PRUEBA.length > 150, 'hay nombres que buscar');
  const b = await chromium.launch();
  const nuevo = async (vp = { width: 390, height: 844 }) => {
    const ctx = await b.newContext({ viewport: vp, acceptDownloads: true });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && errs.push(m.text()));
    return { ctx, pg, errs };
  };
  const texto = (pg) => pg.evaluate(() => document.body.innerText + ' ' + document.title + ' ' + [...document.querySelectorAll('[title],[aria-label],[data-q]')].map((e) => e.title + e.getAttribute('aria-label') + (e.dataset.q || '')).join(' '));
  const sinNombres = async (pg, donde) => {
    const t = await texto(pg);
    const vistos = NOMBRES_PRUEBA.filter((x) => t.includes(x));
    assert.deepStrictEqual(vistos, [], donde + ': se ve un nombre sin contraseña');
  };

  /* ---------- pantalla de contraseña ---------- */
  {
    const { ctx, pg, errs } = await nuevo();
    await pg.goto(`${base}/index.html?${D}`);
    await pg.waitForSelector('#form-clave');
    assert.strictEqual(await pg.locator('.tarjeta').count(), 0);
    assert(await pg.isChecked('#recordar'), '«recordar en este dispositivo» marcado por defecto');
    assert.strictEqual(await pg.getAttribute('#clave', 'type'), 'password');
    assert(!(await pg.isVisible('#buscar')), 'sin contraseña no hay buscador');
    await sinNombres(pg, 'portada sin clave');
    bien('sin clave en el dispositivo: pantalla de contraseña, «recordar» marcado y ningún nombre');

    await pg.fill('#clave', 'esta no es la contraseña');
    await pg.click('#form-clave button[type=submit]');
    await pg.waitForSelector('#clave-msg:has-text("no es la correcta")');
    const msg = await pg.textContent('#clave-msg');
    assert(!/letra|caracter|palabra|empieza|parec/i.test(msg), 'sin pistas: ' + msg);
    assert.strictEqual(await pg.locator('.tarjeta').count(), 0);
    assert.deepStrictEqual(await pg.evaluate(() => [Object.keys(localStorage), Object.keys(sessionStorage)]), [[], []]);
    bien('contraseña errónea: mensaje claro sin pistas, sigue cerrada y no se guarda nada');

    await pg.fill('#clave', K.CONTRASENA_PRUEBA);
    await pg.click('#form-clave button[type=submit]');
    await pg.waitForSelector('.tarjeta');
    const guardado = await pg.evaluate(() => ({ ...localStorage }));
    assert.deepStrictEqual(Object.keys(guardado), ['tumesa.clave:datos/_prueba']);
    assert.strictEqual(guardado['tumesa.clave:datos/_prueba'], K.clavePrueba().toString('base64'), 'se guarda la clave derivada');
    assert(!JSON.stringify(guardado).includes('prueba de la mesa'), 'nunca la contraseña');
    assert(await pg.isVisible('#buscar'));
    bien('contraseña buena con «recordar»: se abre la portada y localStorage guarda la clave derivada, no la contraseña');

    await pg.reload(); await pg.waitForSelector('.tarjeta');
    await pg.click('.tarjeta >> nth=0'); await pg.waitForSelector('#cab h1');
    assert.strictEqual(await pg.locator('#form-clave').count(), 0);
    bien('recordada: al recargar y al entrar en un campeonato no la vuelve a pedir');

    assert(await pg.isVisible('#olvidar-clave'), 'botón visible para olvidar la contraseña');
    assert.strictEqual((await pg.textContent('#olvidar-clave')).trim(), 'Olvidar contraseña en este dispositivo');
    await pg.click('#olvidar-clave');
    await pg.waitForSelector('#form-clave');
    assert.deepStrictEqual(await pg.evaluate(() => [Object.keys(localStorage), Object.keys(sessionStorage)]), [[], []]);
    await sinNombres(pg, 'torneo tras olvidar');
    bien('«Olvidar contraseña en este dispositivo» borra la clave y vuelve a pedirla');

    await pg.uncheck('#recordar'); await pg.fill('#clave', K.CONTRASENA_PRUEBA); await pg.click('#form-clave button[type=submit]');
    await pg.waitForSelector('#cab h1');
    assert.deepStrictEqual(await pg.evaluate(() => [Object.keys(localStorage), Object.keys(sessionStorage)]), [[], ['tumesa.clave:datos/_prueba']]);
    bien('sin «recordar»: la clave solo vive en esta pestaña (sessionStorage)');

    // una clave guardada que ya no vale (la mesa cambió la contraseña)
    await pg.evaluate(() => { sessionStorage.clear(); localStorage.setItem('tumesa.clave:datos/_prueba', btoa(String.fromCharCode(...new Uint8Array(32)))); });
    await pg.reload(); await pg.waitForSelector('#form-clave');
    assert((await pg.textContent('#candado')).includes('ha cambiado'));
    assert.deepStrictEqual(await pg.evaluate(() => Object.keys(localStorage)), []);
    bien('clave guardada que ya no abre: dice que la contraseña ha cambiado y la vuelve a pedir');
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  /* ---------- normativa en PDF ---------- */
  {
    const { ctx, pg, errs } = await nuevo({ width: 1280, height: 800 });
    await K.recordarPrueba(ctx);
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=normativa&${D}`);
    const boton = pg.locator('button:has-text("Descargar normativa (PDF)")');
    await boton.waitFor();
    const [descarga] = await Promise.all([pg.waitForEvent('download'), boton.click()]);
    const bytes = fs.readFileSync(await descarga.path());
    assert(bytes.equals(fs.readFileSync(path.join(__dirname, 'datos/sp-ejemplo/normativa.pdf'))), 'el PDF descargado es el original');
    assert(/\.pdf$/.test(descarga.suggestedFilename()), descarga.suggestedFilename());
    assert.strictEqual(await pg.locator('iframe, embed, object').count(), 0);
    bien('Normativa: «Descargar normativa (PDF)» descifra en el navegador y descarga el PDF original, sin iframe');
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo-anterior&ver=normativa&${D}`); await pg.waitForSelector('.libro');
    await pg.waitForTimeout(300);
    assert.strictEqual(await boton.count(), 0);
    bien('sin normativa publicada, no sale el botón');
    assert.deepStrictEqual(errs, [], 'sin violaciones de CSP');
    await ctx.close();
  }

  /* ---------- la web servida tal cual, sin clave ---------- */
  {
    const { ctx, pg } = await nuevo({ width: 1280, height: 800 });
    const ind = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos/indice.json'), 'utf8')).torneos.map((t) => t.id);
    for (const u of ['index.html?' + D, ...ind.flatMap((id) => ['', '&ver=mesas', '&ver=parejas', '&ver=folleto', '&ver=normativa'].map((v) => `torneo.html?t=${id}${v}&${D}`))]) {
      await pg.goto(`${base}/${u}`); await pg.waitForSelector('#form-clave');
      await sinNombres(pg, u);
    }
    bien(`sin clave, ninguna de las ${1 + ind.length * 4} páginas de prueba enseña un nombre`);
    // lo que se descarga de datos/_prueba tal como lo sirve la web
    for (const f of todos(K.DIR_PRUEBA)) {
      const r = await ctx.request.get(`${base}/datos/_prueba/${f}`);
      assert.strictEqual(r.status(), 200, f);
      const t = await r.text();
      if (f === 'clave.json') { const cj = JSON.parse(t); assert.deepStrictEqual(Object.keys(cj), ['version', 'kdf', 'iteraciones', 'sal', 'verificador']); continue; }
      assert(K.esSobre(t), f + ' no es un sobre cifrado');
      for (const x of [...NOMBRES_PRUEBA, ...PROHIBIDO]) assert(!(x instanceof RegExp ? x.test(t) : t.includes(x)), `${f} deja leer ${x}`);
      assert(!/[a-záéíóúñ]{4,}[ -][a-záéíóúñ]{4,}/i.test(t.replace(/"(v|iv|ct)"/g, '')), f + ': parece texto legible');
      assert(!NOMBRES_PRUEBA.some((x) => f.toLowerCase().includes(x.toLowerCase())), f + ': el nombre del archivo delata a alguien');
    }
    bien('cada archivo de datos/_prueba, descargado tal cual: sobre cifrado sin nombres, «Calap», teléfonos ni «ES76», y nombres de archivo sin nombres');

    // los datos reales: en cuanto hay datos/clave.json, nada de datos/ puede ir en claro
    const real = path.join(raiz, 'datos');
    const enClaro = todos(real).filter((f) => !f.startsWith('_prueba') && f !== 'clave.json' && f !== '.gitkeep' && !K.esSobre(fs.readFileSync(path.join(real, f), 'utf8')));
    await pg.goto(`${base}/index.html`);
    if (fs.existsSync(path.join(real, 'clave.json'))) {
      assert.deepStrictEqual(enClaro, [], 'archivos de datos/ sin cifrar');
      await pg.waitForSelector('#form-clave');
      const t = await texto(pg);
      assert(!PROHIBIDO.some((r) => r.test(t)));
      bien('datos reales: hay datos/clave.json, todo datos/ va cifrado y la portada pide la contraseña');
    } else {
      await pg.waitForSelector('#candado:has-text("preparando")');
      assert.strictEqual(await pg.locator('.tarjeta').count(), 0);
      const nombresReales = nombresDe(real).filter((x) => !html.includes(x));
      const t = await texto(pg);
      assert.deepStrictEqual(nombresReales.filter((x) => t.includes(x)), []);
      bien('datos reales sin datos/clave.json: la portada dice que se está preparando y no lee los JSON en claro');
      console.log(`  AVISO: falta cifrar lo publicado. ${enClaro.length} archivos de datos/ siguen en claro (${enClaro.join(', ')}). Lo hace la mesa de control con «Establecer o cambiar la contraseña».`);
    }
    await ctx.close();
  }
  await b.close();
  console.log(`\n${ok} comprobaciones bien`);
})().catch((e) => { console.error('FALLA:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
