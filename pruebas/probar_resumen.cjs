// Prueba de la pestaña Resumen: podio con las tres primeras y buscador «¿Quién eres?».
// Uso: node pruebas/probar_resumen.cjs [url-base] [carpeta-de-capturas]   (servidor: python3 -m http.server 8765)
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { recordarPrueba } = require('./cripto_prueba.cjs');
const base = process.argv[2] || 'http://localhost:8765';
const capt = process.argv[3];
const D = 'd=datos/_prueba';
const dato = (t) => JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', t, 'actual.json'), 'utf8'));
const top3A = (t) => dato(t).clasificacion.filter((r) => r.grupo === 'A').slice(0, 3).map((r) => r.id);

(async () => {
  const b = await chromium.launch();
  let ok = 0; const bien = (t) => { ok++; console.log('  ok  ' + t); };
  for (const [w, h] of [[320, 640], [390, 844], [1280, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await recordarPrueba(ctx);
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    const abrir = async (t, extra = '') => { await pg.goto(`${base}/torneo.html?t=${t}${extra}&${D}`); await pg.waitForSelector('.podio, .vacio'); };
    const ids = () => pg.locator('.podio-tarjeta').evaluateAll((x) => x.map((e) => +e.dataset.id));
    console.log(`A ${w} px`);

    // pestañas y pestaña por defecto
    await abrir('sp-ejemplo');
    assert.deepStrictEqual(await pg.locator('nav.pestanas a').allInnerTexts(), ['Resumen', 'Clasificación', 'Partidas', 'Parejas', 'Calendario', 'Normativa']);
    assert.strictEqual(await pg.locator('nav.pestanas a[aria-current=page]').innerText(), 'Resumen');
    bien('seis pestañas, Resumen primera y abierta por defecto');

    // podio del SP en curso: las tres primeras, 1º en el centro (orden visual), «Pareja N», nombres y cifra
    assert.deepStrictEqual(await ids(), top3A('sp-ejemplo'));
    const t1 = pg.locator('.podio-tarjeta[data-puesto="1"]');
    const txt = await t1.innerText();
    assert(/pareja 1/i.test(txt) && /Nuria Escrivá/.test(txt) && /Pau Tomás/.test(txt), txt);
    assert(/\d+ de \d+/.test(await t1.locator('.podio-cifra').innerText()), 'cifra corta');
    const x = async (p) => (await pg.locator(`.podio-tarjeta[data-puesto="${p}"]`).boundingBox());
    const [b1, b2, b3] = [await x(1), await x(2), await x(3)];
    if (w >= 520) assert(b2.x < b1.x && b1.x < b3.x && Math.abs(b1.y - b2.y) < 200, 'en fila: 2º, 1º, 3º');
    else assert(b1.width > b2.width && b2.y > b1.y && b3.y > b1.y && b2.x < b3.x, `1º arriba a todo el ancho y 2º y 3º debajo (${JSON.stringify([b1, b2, b3])})`);
    for (const q of [b1, b2, b3]) assert(q.x >= 0 && q.x + q.width <= w, 'tarjeta dentro de la pantalla');
    assert.strictEqual(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'desborda');
    bien('podio: tres primeras, Pareja N, nombres y cifra; disposición correcta a este ancho, sin desbordar');
    if (capt) { fs.mkdirSync(capt, { recursive: true }); await pg.screenshot({ path: `${capt}/resumen_${w}.png`, fullPage: true }); }

    // individual: jugadores; y SP con grupo B: solo el A
    await abrir('individual-ejemplo-2026-11-14');
    assert.deepStrictEqual(await ids(), top3A('individual-ejemplo-2026-11-14'));
    assert(/jugador 6/i.test(await pg.locator('.podio-tarjeta[data-puesto="1"]').innerText()));
    bien('individual: «Jugador N»');
    await abrir('sp-ejemplo-anterior');
    assert.deepStrictEqual(await ids(), top3A('sp-ejemplo-anterior'));
    bien('SP con grupo B: el podio es solo del grupo A');

    // sin clasificación todavía: mensaje, sin podio
    // (los datos de prueba no traen un torneo sin jornadas cerradas ni resultados; lo cubre el aviso vacío del código)

    // buscador «¿Quién eres?»
    await abrir('sp-ejemplo');
    assert((await pg.locator('label[for=quien]').innerText()).includes('¿Quién eres?'));
    await pg.fill('#quien', 'escr');
    await pg.waitForSelector('.ficha[data-id="1"]');
    const ficha = await pg.locator('.ficha[data-id="1"]').innerText();
    assert(/pareja\s+1/i.test(ficha) && /Nuria Escrivá/.test(ficha) && /1\.º/.test(ficha) && /mesa 1/.test(ficha), ficha);
    assert((await pg.locator('.ficha[data-id="1"] a[href*="ver=clasificacion"][href*="p=1"]').count()) === 1);
    bien('buscador: nombre parcial (sin tilde) abre la ficha con pareja, puesto y mesa');
    await pg.fill('#quien', 'TOMAS');
    await pg.waitForSelector('.ficha[data-id="1"]');
    bien('buscador: segundo jugador de la pareja, en mayúsculas');
    await pg.fill('#quien', '4');
    await pg.waitForSelector('.ficha[data-id="4"]');
    assert.deepStrictEqual(await pg.locator('.ficha').evaluateAll((x) => x.map((e) => +e.dataset.id)), [4]);
    bien('buscador: un número busca esa pareja y solo esa');
    await pg.fill('#quien', 'zzzz');
    await pg.waitForSelector('text=No encuentro a nadie');
    assert.strictEqual(await pg.locator('.ficha').count(), 0);
    bien('buscador: sin coincidencias lo dice');
    await pg.fill('#quien', ''); assert.strictEqual(await pg.locator('.ficha').count(), 0);
    await pg.fill('#quien', 'a');
    await pg.waitForSelector('.ficha, .nota');
    bien('buscador: una sola letra no inunda de fichas');
    await pg.fill('#quien', 'e');
    await pg.waitForTimeout(100);
    assert((await pg.locator('.ficha').count()) <= 6);
    await pg.fill('#quien', 'escr');
    await pg.waitForSelector('.ficha[data-id="1"]');
    await pg.evaluate(() => window.scrollTo(0, 0));
    assert.strictEqual(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'ficha desborda');
    if (capt) await pg.screenshot({ path: `${capt}/resumen_ficha_${w}.png`, fullPage: true });
    bien('ficha sin desbordar');

    // el nº exacto en un campeonato grande: 3 no es 38 ni 13
    await abrir('sp-grande');
    await pg.fill('#quien', '3'); await pg.waitForSelector('.ficha');
    assert.deepStrictEqual(await pg.locator('.ficha').evaluateAll((x) => x.map((e) => +e.dataset.id)), [3]);
    bien('buscador: «3» es la pareja 3, no la 13 ni la 38');

    // individual: ficha de un jugador
    await abrir('individual-ejemplo-2026-11-14');
    await pg.fill('#quien', '6'); await pg.waitForSelector('.ficha[data-id="6"]');
    assert(/jugador\s+6/i.test(await pg.locator('.ficha[data-id="6"]').innerText()));
    bien('individual: ficha «Jugador N»');

    // ver= antiguos y nuevos
    for (const [ver, sel] of [['clasificacion', 'table.clasi'], ['mesas', '.mesa'], ['parejas', '.lista-parejas'], ['resumen', '.podio']]) {
      await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=${ver}&${D}`); await pg.waitForSelector(sel);
    }
    bien('los enlaces ver= siguen funcionando');
    await pg.click('nav.pestanas a:has-text("Clasificación")'); await pg.waitForSelector('table.clasi');
    assert(!/ver=/.test(await pg.locator('nav.pestanas a').first().getAttribute('href')));
    await pg.click('nav.pestanas a:has-text("Resumen")'); await pg.waitForSelector('.podio');
    bien('de Clasificación a Resumen y vuelta');
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }
  await b.close();
  console.log(`\n${ok} comprobaciones bien`);
})().catch((e) => { console.error('FALLA:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
