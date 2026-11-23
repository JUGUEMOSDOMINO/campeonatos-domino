// Prueba de la web pública en un navegador: buscador, pestañas, jornadas, ancho de pantalla y refresco.
// Uso: node pruebas/probar_web.cjs [url-base] [carpeta-de-capturas]
const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');
const { recordarPrueba } = require('./cripto_prueba.cjs');
const base = process.argv[2] || 'http://localhost:8765';
const capt = process.argv[3];
const D = 'd=datos/_prueba';
(async () => {
  const b = await chromium.launch();
  let ok = 0; const bien = (t) => { ok++; console.log('  ok  ' + t); };
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
    await recordarPrueba(ctx); // como si ya se hubiera escrito la contraseña de los datos de prueba
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && !/(normativa\.pdf\.cifrado|\/datos\/clave\.json(\?t=\d+)?)$/.test(m.location().url) && errs.push(m.text())); // 404 esperados: campeonato sin normativa; web real aún sin contraseña
    const sinDesborde = async (n) => assert.strictEqual(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'desborda: ' + n);
    console.log(`A ${w} px`);

    await pg.goto(`${base}/index.html?${D}`);
    await pg.waitForSelector('.tarjeta');
    assert.strictEqual(await pg.locator('.tarjeta').count(), 7);
    assert.strictEqual((await pg.locator('#lista h2.seccion').first().textContent()).trim(), 'Ranking');
    assert.strictEqual(await pg.getAttribute('#lista ul.tarjetas >> nth=0 >> a.tarjeta', 'href'), 'ranking.html?r=ranking-ejemplo&d=datos%2F_prueba');
    await sinDesborde('portada'); bien('portada: el ranking en su propia sección, la primera, y los 5 campeonatos, sin desbordar');
    assert.strictEqual(await pg.locator('.fecha-ficha').count(), 0);
    assert(!/\b(oct|nov|ene|feb)\b/i.test(await pg.locator('#lista').innerText()), 'queda la marca de fecha');
    bien('portada: sin la fecha de inicio en las tarjetas');
    // buscador: un jugador en dos torneos
    await pg.fill('#buscar', 'pons');
    await pg.waitForSelector('.persona .puesto:not(:text("…"))');
    await pg.waitForTimeout(300);
    const pons = await pg.locator('.persona', { hasText: 'Vicent Pons' });
    assert.strictEqual(await pons.locator('li').count(), 2);
    const txt = await pons.innerText();
    assert(/Campeones/.test(txt) && /1\.º/.test(txt), txt);
    bien('buscador: Vicent Pons sale en 2 torneos, con su puesto y como campeón del terminado');
    await sinDesborde('buscador');
    if (capt) await pg.screenshot({ path: `${capt}/buscador_${w}.png`, fullPage: true });
    await pg.fill('#buscar', 'beltran');
    await pg.waitForSelector('.persona:has-text("Rosa Beltrán")');
    assert(/Jugó hasta la jornada 2; le sustituyó Hugo Lorente/.test(await pg.locator('.persona').first().innerText()));
    bien('buscador: sin tildes encuentra a Rosa Beltrán y cuenta su sustitución');
    await pg.fill('#buscar', 'zzzz'); await pg.waitForSelector('text=No hay nadie');
    bien('buscador: sin coincidencias lo dice');
    await pg.fill('#buscar', 'orts'); await pg.waitForSelector('.persona:has-text("Gemma Orts")');
    assert.strictEqual(await pg.locator('.persona', { hasText: 'Gemma Orts' }).locator('li').count(), 2);
    bien('buscador: Gemma Orts en parejas y en SP');

    // torneo SP en curso (Plan 2.10.2): la clasificación de la J3 en vivo, con ⏳ en quien aún no ha jugado
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=clasificacion&${D}`);
    await pg.waitForSelector('table.clasi');
    assert((await pg.locator('table.clasi caption').innerText()).includes('jornada 3'));
    const nota = await pg.locator('.nota.caja').innerText();
    assert(nota.includes('en juego') && nota.includes('la clasificación se actualiza con cada resultado'), nota);
    assert(!/en este grupo/.test(nota), nota);
    assert.strictEqual(await pg.locator('.plazo').innerText(), 'Jornada 3 · se juega del 10/11 al 23/11');
    assert(!/Cómo se ordena|criterio|desempate/i.test(await pg.locator('main').innerText()));
    assert.deepStrictEqual(await pg.locator('nav.pestanas a').allInnerTexts(), ['Resumen', 'Clasificación', 'Partidas', 'Parejas', 'Calendario', 'Bases del campeonato']);
    bien('clasificación: nota sin recuento, fechas de juego, sin criterios y seis pestañas en orden');
    // columnas como en el Excel, y la leyenda en el mismo orden
    const COLS = ['CLAS.', 'PAREJA', 'NOMBRE', 'ENC.J', 'ENC.G', 'DIF. P.', 'DIF. PUNT.', 'P. G.', 'P. P.', 'PUNT. F.', 'PUNT. C.'];
    assert.deepStrictEqual(await pg.locator('table.clasi thead th').allInnerTexts(), COLS);
    const ley = await pg.locator('.leyenda').innerText();
    assert.deepStrictEqual(COLS.slice(3).map((c) => ley.indexOf(c + ':')).every((x, i, v) => x >= 0 && (i === 0 || x > v[i - 1])), true, 'leyenda en el orden de las columnas: ' + ley);
    bien('clasificación: columnas CLAS., PAREJA, NOMBRE, ENC.J … PUNT. C. y leyenda en el mismo orden');
    // parejas e individual: las columnas de la clasificación del Excel sin Desempate, que el árbitro no quiere en la web (Puesto, Nº, Pareja/Jugador, Zona, P.G., P.F., P.C., Dif.)
    for (const [t, unidad, nombre, zona, cifras] of [['parejas-ejemplo-2026-11-14', 'Pareja', 'Gemma Orts - Toni Ballester', 'Norte', ['2', '600', '512', '+88']], ['individual-ejemplo-2026-11-14', 'Jugador', 'Aitana Cebrián', 'Norte', ['2', '600', '505', '+95']]]) {
      await pg.goto(`${base}/torneo.html?t=${t}&ver=clasificacion&${D}`);
      await pg.waitForSelector('table.clasi tbody tr');
      assert.deepStrictEqual(await pg.locator('table.clasi thead th').allInnerTexts(), ['Puesto', 'Nº', unidad, 'Zona', 'P.G.', 'P.F.', 'P.C.', 'Dif.'], t);
      const celdas = await pg.locator('table.clasi tbody tr').first().locator('td').allInnerTexts();
      assert.strictEqual(celdas[1], t.startsWith('parejas') ? '1' : '6', t);
      assert(celdas[2].startsWith(nombre), `${t}: «${celdas[2]}»`);
      assert.deepStrictEqual(celdas.slice(3, 8), [zona, ...cifras], t);
      assert.strictEqual(celdas.length, 8, t);
      if (t.startsWith('individual')) assert(!(await pg.locator('table.clasi tbody tr').nth(4).innerText()).includes('C.I.'), 'el desempate no se enseña');
      const ley = await pg.locator('.leyenda').innerText();
      assert(['P.G.', 'P.F./P.C.', 'Dif.'].map((c) => ley.indexOf(c)).every((x, i, v) => x >= 0 && (i === 0 || x > v[i - 1])) && !/Desempate|E\.D\.|C\.I\./.test(ley), 'leyenda: ' + ley);
      await sinDesborde('clasificación ' + t);
    }
    bien('clasificación de parejas e individual: columnas, orden y nombres del Excel, sin Desempate (Puesto, Nº, Pareja/Jugador, Zona, P.G., P.F., P.C., Dif.)');
    // la lista de jugadores del individual concuerda en género
    await pg.goto(`${base}/torneo.html?t=individual-ejemplo-2026-11-14&ver=parejas&${D}`);
    await pg.waitForSelector('.lista-parejas');
    assert.strictEqual((await pg.locator('.lista-parejas caption').textContent()).trim(), 'Jugadores inscritos');
    await pg.goto(`${base}/torneo.html?t=parejas-ejemplo-2026-11-14&ver=parejas&${D}`);
    await pg.waitForSelector('.lista-parejas');
    assert.strictEqual((await pg.locator('.lista-parejas caption').textContent()).trim(), 'Parejas inscritas');
    bien('pestaña de participantes: «Jugadores inscritos» y «Parejas inscritas»');
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=clasificacion&${D}`);
    await pg.waitForSelector('table.clasi tbody tr');
    // calendario de un campeonato de un día: el día del campeonato (fecha) y el lugar; sin fecha, avisa de dónde ponerla
    await pg.goto(`${base}/torneo.html?t=parejas-ejemplo-2026-11-14&ver=folleto&${D}`);
    await pg.waitForSelector('.calendario, .vacio, .aviso');
    assert.strictEqual(await pg.locator('.calendario .dia-unico').innerText(), 'Sábado 14 de noviembre de 2026\nSala de ejemplo');
    await pg.goto(`${base}/torneo.html?t=individual-ejemplo-2026-11-14&ver=folleto&${D}`);
    await pg.waitForSelector('.calendario, .vacio, .aviso');
    assert.strictEqual(await pg.locator('.calendario .dia-unico').innerText().then((t) => t.split('\n')[0]), 'Sábado 14 de noviembre de 2026');
    await pg.goto(`${base}/torneo.html?t=parejas-sin-fecha&ver=folleto&${D}`);
    await pg.waitForSelector('.calendario, .vacio, .aviso');
    const sinFecha = await pg.locator('main .aviso').innerText();
    assert(/no tiene fecha/.test(sinFecha) && /INICIO/.test(sinFecha) && /C37/.test(sinFecha), sinFecha);
    await sinDesborde('calendario sin fecha');
    await pg.goto(`${base}/torneo.html?t=sp-calendario&ver=folleto&${D}`);
    await pg.waitForSelector('.calendario li');
    await pg.goto(`${base}/torneo.html?t=sp-sin-resultados&ver=folleto&${D}`);
    await pg.waitForSelector('.calendario, .vacio');
    assert(!(await pg.locator('.dia-unico').count()), 'el SP no usa el día único');
    bien('calendario: un día (con lugar) en parejas e individual, aviso con la celda C37 si falta la fecha, y el SP sigue con su calendario');
    // un campeonato publicado desde la Hoja de resumen (o el Excel o el PDF de Access) de un organizador: todo lo que se puede sacar de la clasificación final; solo falta Partidas
    const OR = '1-campeonato-de-ejemplo-de-parejas-2027-02-06';
    await pg.goto(`${base}/torneo.html?t=${OR}&${D}`);
    await pg.waitForSelector('.podio-tarjeta');
    assert.deepStrictEqual(await pg.locator('#pestanas a').allInnerTexts(), ['Resumen', 'Clasificación', 'Parejas', 'Calendario']);
    assert.strictEqual(await pg.getAttribute('#pestanas a', 'aria-current'), 'page');
    assert.deepStrictEqual(await pg.locator('.podio-tarjeta').evaluateAll((l) => l.map((x) => [x.dataset.puesto, x.textContent])).then((l) => l.map((x) => x[0])), ['1', '2', '3']);
    assert((await pg.locator('#t-podio').innerText()).includes('Podio final'));
    const podioTxt = await pg.locator('.podio').innerText();
    assert(!/null|NaN|undefined/.test(podioTxt) && /ganadas|ganada/.test(podioTxt), podioTxt);
    await pg.fill('#quien', 'Vicent');
    await pg.waitForSelector('#quien-res .ficha');
    const ficha = await pg.locator('#quien-res .ficha').first().innerText();
    assert(ficha.includes('Puesto final: 1.º del grupo B') && ficha.includes('no hay historial partida a partida') && !/Ver su mesa/.test(ficha) && !/null|NaN/.test(ficha), ficha);
    await pg.click('#quien-res .ficha button:has-text("Soy yo")');
    await pg.waitForSelector('#quien-mia .ficha');
    assert.strictEqual(await pg.locator('#quien-mia .ficha-hist').count(), 1);
    await sinDesborde('campeonato solo con clasificación: resumen');
    await pg.goto(`${base}/torneo.html?t=${OR}&ver=clasificacion&${D}`);
    await pg.waitForSelector('table.clasi tbody tr');
    assert.deepStrictEqual(await pg.locator('table.clasi thead th').allInnerTexts(), ['Puesto', 'Nº', 'Pareja', 'Zona', 'P.G.', 'P.F.', 'P.C.', 'Dif.']);
    assert.strictEqual(await pg.locator('table.clasi tbody tr').count(), 4);
    assert.strictEqual(await pg.locator('.jornadas').count(), 0);
    const cab = await pg.locator('#cab .linea').innerText();
    assert(/sábado|6 de febrero de 2027/i.test(cab) && cab.includes('Sala de ejemplo') && cab.includes('6 parejas') && cab.includes('7 partidas') && !/Partida 7 de 7/.test(cab), cab);
    const filaRet = await pg.locator('table.clasi tbody tr', { hasText: 'Nuria Pons' }).innerText();
    assert(/retirada/i.test(filaRet) && /[-−]700/.test(filaRet), filaRet);
    await pg.click('.grupos button:has-text("Grupo B")');
    await pg.waitForFunction(() => document.querySelectorAll('table.clasi tbody tr').length === 2);
    assert((await pg.locator('table.clasi tbody tr').first().innerText()).includes('Vicent Vila'));
    await pg.goto(`${base}/torneo.html?t=${OR}&ver=parejas&${D}`);
    await pg.waitForSelector('table.lista-parejas tbody tr');
    assert.strictEqual(await pg.locator('table.lista-parejas tbody tr').count(), 6);
    await pg.goto(`${base}/torneo.html?t=${OR}&ver=folleto&${D}`);
    await pg.waitForSelector('.dia-unico');
    const dia = await pg.locator('.dia-unico').innerText();
    assert(/sábado/i.test(dia) && dia.includes('6 de febrero de 2027') && dia.includes('Sala de ejemplo'), dia);
    for (const ver of ['mesas', 'normativa']) {        // sin partidas, y sin normativa: esas direcciones llevan a la clasificación
      await pg.goto(`${base}/torneo.html?t=${OR}&ver=${ver}&${D}`);
      await pg.waitForSelector('table.clasi tbody tr');
      assert.strictEqual(await pg.locator('#pestanas a').count(), 4, ver);
    }
    await pg.goto(`${base}/torneo.html?t=parejas-ejemplo-2026-11-14&${D}`);
    await pg.waitForSelector('#pestanas a');
    assert.strictEqual(await pg.locator('#pestanas a').count(), 6);
    await pg.goto(`${base}/torneo.html?t=${OR}&ver=clasificacion&${D}`);
    await pg.waitForSelector('table.clasi tbody tr');
    await sinDesborde('campeonato solo con clasificación');
    bien('campeonato de un organizador (Hoja de resumen, Excel o PDF de Access): pestañas Resumen, Clasificación, Parejas y Calendario (sin Partidas ni vacías); podio, «¿Quién eres?» con el puesto final y una frase de que no hay historial, clasificación con grupos A y B, parejas y fecha del torneo; los demás siguen con sus 6 pestañas');
    // Ranking FVD: las tres plazas para el Campeonato de España por parejas (SP, Open y ranking), distinguibles sin color, con su frase si son provisionales o quedan vacías
    {
      const ir = async (r) => { await pg.goto(`${base}/ranking.html?${D}&r=${r}`); await pg.waitForSelector('table.rk tbody tr'); };
      const chips = async (k) => pg.locator(`table.rk .plaza-${k}`).count();
      await ir('ranking-ejemplo');
      assert.deepStrictEqual([await chips('sp'), await chips('open'), await chips('ranking')], [4, 2, 6]);
      assert.strictEqual((await pg.locator('table.rk thead th').last().innerText()).toLowerCase(), 'plaza');
      assert.deepStrictEqual(await pg.locator('table.rk .plaza').evaluateAll((l) => [...new Set(l.map((x) => x.textContent))].sort()), ['Plaza Open', 'Plaza SP', 'Plaza ranking']);
      const borde = (k) => pg.locator(`table.rk .plaza-${k}`).first().evaluate((x) => getComputedStyle(x).borderTopStyle);
      assert.deepStrictEqual([await borde('sp'), await borde('open'), await borde('ranking')], ['solid', 'double', 'dashed']);
      const leyenda = await pg.locator('#plazas-leyenda').innerText();
      assert(leyenda.includes('los 4 jugadores de las 2 primeras parejas del Súper Prestigio') && leyenda.includes('los 2 de la pareja ganadora del Open de Valencia') && leyenda.includes('hasta el puesto 20'), leyenda);
      const sueltas = await pg.locator('#plazas-sueltas').innerText();
      assert(sueltas.includes('pasa a la siguiente pareja de ese torneo') && sueltas.includes('hasta la 10.ª') && sueltas.includes('cada uno tiene ½ plaza') && sueltas.includes('nunca va al ranking'), sueltas);
      assert.strictEqual(await pg.locator('table.rk .plaza-por-repartir').count(), 0);
      assert.strictEqual(await pg.locator('#plazas-provisionales, #plazas-vacias').count(), 0);
      await sinDesborde('ranking con las tres plazas');
      const ficha = async (n) => { await pg.click(`table.rk .nombre-rk:text-is("${n}")`); await pg.waitForSelector('#ficha:not([hidden])'); return pg.locator('#ficha').innerText(); };
      assert((await ficha('Ana Roig')).includes('Plaza SP, del Súper Prestigio'));
      assert((await ficha('Marta Puig')).includes('Plaza Open, del Open de Valencia'));
      assert((await ficha('Pep Sala')).includes('Plaza ranking, por su puesto en el ranking'));
      assert((await ficha('Lola Soler')).includes('Sin plaza'));                        // renuncia al ranking
      assert((await ficha('María de los Ángeles Fernández-Villaverde')).includes('Sin plaza'));      // renuncia a la del SP: no pasa al ranking
      bien('ranking: «Plaza SP», «Plaza Open» y «Plaza ranking» con su texto y su borde (lleno, doble, discontinuo), la frase de qué es cada una y de las plazas sueltas, y la ficha de cada jugador dice cuál tiene (o «Sin plaza»)');
      // una plaza suelta del SP que la pareja que la recibe todavía no ha aceptado ni rechazado
      await ir('ranking-repartir');
      assert.deepStrictEqual([await chips('sp') - await chips('por-repartir'), await chips('por-repartir')], [3, 2]);
      assert.strictEqual(await pg.locator('table.rk .plaza-por-repartir').first().evaluate((x) => getComputedStyle(x).borderTopStyle), 'dotted');
      assert.deepStrictEqual(await pg.locator('table.rk .plaza-frase').allInnerTexts(), ['1 plaza para la pareja N.º 6 (por repartir)', '1 plaza para la pareja N.º 6 (por repartir)']);
      assert.strictEqual(await pg.locator('table.rk td.ce .plaza-por-repartir').first().innerText(), 'Plaza SP · por repartir');
      const fr = await ficha('Marta Puig');
      assert(fr.includes('Plaza SP · por repartir') && fr.includes('todavía no han dicho si van') && !fr.includes('Sin plaza'), fr);
      await sinDesborde('ranking con una plaza por repartir');
      // los dos de la pareja que recibe dicen «Va»: ½ plaza cada uno
      await ir('ranking-medias');
      assert.deepStrictEqual(await pg.locator('table.rk .plaza-sp:not(.plaza-por-repartir)').allInnerTexts().then((l) => l.sort()), ['Plaza SP', 'Plaza SP', 'Plaza SP', '½ Plaza SP', '½ Plaza SP']);
      assert((await ficha('Joan Ferrer')).includes('Media plaza del Súper Prestigio: la comparte con su pareja, que también va'));
      await sinDesborde('ranking con medias plazas');
      // nadie quiere la plaza hasta la 10.ª pareja
      await ir('ranking-vacias-sp-open');
      assert.strictEqual(await pg.locator('#plazas-vacias-sp').innerText().then((x) => x.includes('Una plaza del SP queda vacía') && x.includes('hasta la 10.ª')), true);
      assert.strictEqual(await pg.locator('#plazas-vacias-open').innerText().then((x) => x.includes('2 plazas del Open quedan vacías')), true);
      await sinDesborde('ranking con plazas SP y Open vacías');
      bien('ranking con plaza suelta: «Plaza SP · por repartir» con la frase «1 plaza para la pareja N.º 6 (por repartir)», ½ plaza cuando van los dos y aviso de las plazas SP y Open que queda vacías; sin cortar nada a 320 px');
      await ir('ranking-provisional');
      assert.deepStrictEqual([await chips('sp'), await chips('open'), await chips('ranking')], [4, 0, 6]);
      const prov = await pg.locator('#plazas-provisionales').innerText();
      assert(prov.includes('todavía no se ha jugado el Open de Valencia') && prov.includes('no hay plazas Open') && prov.includes('el ranking marca sus 6'), prov);
      assert.strictEqual(await pg.locator('table.rk td.ce .sub:text-is("provisional")').count(), 6);
      assert((await ficha('Marta Puig')).includes('Plaza ranking provisional'));
      await sinDesborde('ranking provisional');
      bien('ranking provisional (el Open sin jugar): sin plazas Open, 6 del ranking marcadas «provisional» y una frase que lo explica');
      await ir('ranking-vacias');
      assert.strictEqual(await chips('ranking'), 2);
      assert.strictEqual(await pg.locator('#plazas-provisionales').count(), 0);
      const vac = await pg.locator('#plazas-vacias').innerText();
      assert(vac.includes('4 plazas del ranking quedan vacías') && vac.includes('hasta el puesto 20'), vac);
      await sinDesborde('ranking con plazas vacías');
      bien('ranking con renuncias y nadie disponible hasta el puesto 20: las plazas que quedan vacías se avisan');
      // caso 9 por jugador (contrato 1.4): Marta abandonó en el 2º torneo y no puntuó; su compañero Joan sí
      await ir('ranking-abandono');
      assert.strictEqual(await pg.locator('table.rk td.abandono').count(), 1);
      const filaMarta = pg.locator('table.rk tbody tr', { hasText: 'Marta Puig' }).locator('td.abandono');
      assert.strictEqual((await filaMarta.innerText()).replace(/\s+/g, ' ').trim(), '0 abandono');       // se dice con texto, no solo con color
      assert.strictEqual(await pg.locator('#nota-abandono').count(), 1);
      const fma = await ficha('Marta Puig');
      assert(fma.includes('Abandonó o fue expulsado: no puntuó en este torneo'), fma);
      const fjo = await ficha('Joan Ferrer');
      assert(fjo.includes('700') && !fjo.includes('Abandonó'), fjo);
      await sinDesborde('ranking con un abandono (caso 9 por jugador)');
      bien('ranking con abandono: el jugador que abandonó sale con «abandono» al lado de su 0 y en su ficha «Abandonó o fue expulsado: no puntuó en este torneo»; su compañero puntúa con normalidad; sin cortar nada a 320 px');
      await ir('ranking-v13');
      assert.strictEqual(await pg.locator('table.rk td.abandono, #nota-abandono').count(), 0);
      bien('ranking publicado con el contrato 1.3 (sin la marca de abandono): se sigue viendo igual');
      await ir('ranking-v12');
      assert.deepStrictEqual([await chips('sp'), await chips('open'), await chips('ranking')], [4, 2, 6]);
      assert.strictEqual(await pg.locator('#plazas-sueltas, .plaza-por-repartir, #plazas-vacias-sp').count(), 0);
      bien('ranking publicado con el contrato 1.2 (plazas como sí o no): se sigue viendo, sin lo de plazas sueltas');
      await ir('ranking-antiguo');
      assert.strictEqual(await pg.locator('table.rk .plaza-ce').count(), 6); assert.strictEqual(await pg.locator('table.rk .plaza').count(), 0);
      assert.strictEqual((await pg.locator('table.rk thead th').last().innerText()).toLowerCase(), 'ce');
      bien('ranking publicado antes (contrato 1.1): se sigue viendo con la ficha CE de siempre');
    }
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=clasificacion&${D}`);
    await pg.waitForSelector('table.clasi tbody tr');
    const pendJ3 = JSON.parse(fs.readFileSync('pruebas/datos/sp-ejemplo/actual.json', 'utf8')).clasificacion.filter((r) => r.grupo === 'A' && r.pendiente).length;
    assert.strictEqual(await pg.locator('table.clasi .etq.pend').count(), pendJ3); // ⏳ = pendiente del JSON
    assert.strictEqual(await pg.locator('.jornadas button').count(), 3); // las completas y la que está en juego
    await sinDesborde('clasificación SP'); bien(`clasificación en vivo de la J3 con ⏳ en las ${pendJ3} parejas sin resultado`);
    await pg.click('.jornadas button:has-text("2")');
    await pg.waitForFunction(() => document.querySelector('table.clasi caption').textContent.includes('jornada 2'));
    const filas = await pg.locator('table.clasi tbody tr').allInnerTexts();
    assert(filas[0].includes('Escrivá-Tomás'), filas[0]);
    assert.strictEqual(await pg.locator('table.clasi .etq.pend').count(), 0);
    bien('la J2 (cerrada) se sigue viendo, sin ⏳');
    await pg.click('.jornadas button:has-text("3")');
    await pg.waitForFunction(() => document.querySelector('table.clasi caption').textContent.includes('jornada 3'));
    if (capt) await pg.screenshot({ path: `${capt}/clasi_${w}.png`, fullPage: true });
    // al desplazar la caja hasta el final, la última columna se ve entera
    await pg.evaluate(() => { document.querySelector('.tabla-caja').scrollLeft = 1e6; });
    const caja = await pg.locator('.tabla-caja').boundingBox(); const ult = await pg.locator('table.clasi th:visible').last().boundingBox();
    assert(ult.x + ult.width <= caja.x + caja.width + 1, 'última columna recortada');
    bien('la tabla de clasificación cabe sin desplazar');
    await pg.click('.jornadas button:has-text("1")');
    await pg.waitForFunction(() => document.querySelector('table.clasi caption').textContent.includes('jornada 1'));
    assert((await pg.locator('table.clasi caption').innerText()).includes('jornada 1'));
    bien('selector de jornada: J1');
    // nombres de entonces: Pons-Dols en J2, Pons-Mas en la J3 publicada
    assert((await pg.locator('table.clasi').innerText()).includes('Pons-Dols'));
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=mesas&${D}`);
    await pg.waitForSelector('li.mesa');
    assert((await pg.locator('ul.mesas').innerText()).includes('Pons-Mas'));
    assert.strictEqual(await pg.locator('.plazo').innerText(), 'Jornada 3 · se juega del 10/11 al 23/11');
    await pg.click('.jornadas button:has-text("1")');
    await pg.waitForFunction(() => document.querySelector('.plazo').textContent.startsWith('Jornada 1'));
    assert.strictEqual(await pg.locator('.plazo').innerText(), 'Jornada 1 · se juega del 13/10 al 26/10');
    await pg.click('.jornadas button:has-text("3")');
    await pg.waitForSelector('.plazo');
    bien('mesas: fechas de juego de la jornada elegida');
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=mesas&${D}`);
    await pg.waitForSelector('li.mesa');
    await pg.click('.jornadas button:has-text("2")');
    await pg.waitForFunction(() => document.querySelector('ul.mesas').innerText.includes('Pons-Dols'));
    bien('las jornadas pasadas conservan el nombre de entonces (Pons-Dols en J2, Pons-Mas en J3)');
    // filtro de mesas
    await pg.click('.jornadas button:has-text("3")');
    await pg.waitForFunction(() => document.querySelector('ul.mesas').innerText.includes('Pons-Mas'));
    await pg.fill('#filtro', 'lidón');
    assert.strictEqual(await pg.locator('li.mesa:visible').count(), 1);
    await pg.fill('#filtro', '5');
    assert.strictEqual(await pg.locator('li.mesa:visible').count(), 1);
    await pg.fill('#filtro', 'zzz'); assert(await pg.locator('#sin-coincidencias').isVisible());
    await pg.fill('#filtro', '');
    await sinDesborde('emparejamientos'); bien('filtro por nombre y por número, y mensaje si nadie coincide');
    if (capt) await pg.screenshot({ path: `${capt}/emp_${w}.png`, fullPage: true });
    // Mesas = emparejamientos + resultados: una tarjeta por mesa, jornada en curso por defecto
    assert.strictEqual(await pg.locator('.jornadas button').count(), 3);
    assert.strictEqual(await pg.locator('.jornadas button[aria-pressed=true]').innerText(), '3');
    assert.strictEqual(await pg.locator('.jornadas button.curso').innerText(), '3');
    assert.strictEqual(await pg.locator('.jornadas button').first().evaluate((x) => getComputedStyle(x).borderRadius), '50%');
    const rs = await pg.locator('.res').allInnerTexts();
    assert(rs.some((t) => t.includes('1-2') && t.includes('640-790 tantos')) && rs.some((t) => t.trim().toUpperCase() === 'RETIRADA'), rs.join('|'));
    assert(!rs.some((t) => t.includes('2-0') && /retirada/i.test(t)), 'la retirada lleva etiqueta, no cifras');
    assert(rs.some((t) => t.includes('⏳')), 'falta ⏳ en la mesa sin resultado');
    const gana = await pg.locator('li.mesa', { hasText: '640-790' }).locator('.lado.gana');
    assert.strictEqual(await gana.count(), 1); // el ganador no depende solo del color: ✓, negrita y barra
    assert((await gana.innerText()).includes('✓'));
    assert.strictEqual(await gana.locator('.nom').evaluate((x) => getComputedStyle(x).fontWeight), '800');
    assert.strictEqual(await pg.locator('li.mesa:has(.res b)').first().locator('.n').count(), 2);
    assert(!/Por jugar/.test(await pg.locator('#contenido h2').allInnerTexts().then((x) => x.join())), 'ya no hay bloque aparte de por jugar');
    await sinDesborde('mesas con resultados'); bien('mesas: tarjetas con partidas y tantos, ⏳ si falta, ganador con ✓ y negrita, jornada en curso marcada');
    if (capt) await pg.screenshot({ path: `${capt}/mesas_${w}.png`, fullPage: true });
    // la J2 ya cerrada enseña sus resultados
    await pg.click('.jornadas button:has-text("2")');
    await pg.waitForFunction(() => document.querySelector('ul.mesas').innerText.includes('Pons-Dols'));
    assert.strictEqual(await pg.locator('li.mesa .res:has-text("⏳")').count(), 0);
    bien('mesas: la J2 cerrada, con sus resultados y sin ⏳');
    for (const viejo of ['resultados', 'emparejamientos']) {
      await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=${viejo}&${D}`);
      await pg.waitForSelector('li.mesa');
      assert.strictEqual(await pg.locator('nav.pestanas a[aria-current=page]').innerText(), 'Partidas');
    }
    bien('los enlaces antiguos ver=resultados y ver=emparejamientos abren Mesas');
    // parejas: nº, nombres, zona; nunca teléfonos
    await pg.click('nav.pestanas a:has-text("Parejas")');
    await pg.waitForSelector('table.lista-parejas');
    const ap = JSON.parse(fs.readFileSync('pruebas/datos/sp-ejemplo/actual.json', 'utf8')).participantes;
    assert.strictEqual(await pg.locator('table.lista-parejas tbody tr').count(), ap.length);
    const f1 = await pg.locator('table.lista-parejas tbody tr').first().innerText();
    assert(f1.includes(`${ap[0].j1_nombre} ${ap[0].j1_apellido1}`) && f1.includes(`${ap[0].j2_nombre} ${ap[0].j2_apellido1}`) && f1.includes(ap[0].zona), f1);
    assert(!/\d{9}|tel[eé]f|licencia/i.test(await pg.locator('main').innerText()));
    await sinDesborde('parejas'); bien(`parejas: ${ap.length} filas con nº, los dos jugadores y zona; sin teléfonos`);
    if (capt) await pg.screenshot({ path: `${capt}/parejas_${w}.png`, fullPage: true });
    // Calendario
    await pg.clock.setFixedTime(new Date('2026-11-15T10:00:00')); // «hoy» fijo: la J3 en curso
    await pg.goto(`${base}/torneo.html?t=sp-calendario&ver=folleto&${D}`); // actual.json de ejemplo con la clave "calendario"
    await pg.waitForSelector('.calendario li');
    assert.strictEqual(await pg.locator('.linea-tiempo').count(), 0);
    assert.strictEqual(await pg.locator('.calendario li').count(), 14);
    assert.strictEqual(await pg.locator('.calendario li.curso').count(), 1);
    assert((await pg.locator('.calendario li.curso').innerText()).replace(/\s+/g, ' ').includes('3 '), 'la jornada 3 debe estar resaltada');
    assert.deepStrictEqual(await pg.locator('.calendario .b').allInnerTexts(), ['B1', 'B2', 'B3']);
    assert((await pg.locator('.calendario li').nth(0).innerText()).includes('13/10 – 26/10/2026'));
    assert((await pg.locator('.calendario li').nth(2).innerText()).includes('10/11 – 23/11/2026'));
    assert.strictEqual(await pg.locator('a[download], iframe, .libro, button:has-text("normativa")').count(), 0, 'Calendario es solo el calendario');
    await sinDesborde('calendario lista'); bien('lista: 14 jornadas con el año, B1-B3, J3 resaltada');
    if (capt) await pg.screenshot({ path: `${capt}/cal_lista_${w}.png`, fullPage: true });
    // la lista no se toca: la copia del 24º con nombres inventados, con el año en la jornada que cruza
    await pg.goto(`${base}/torneo.html?t=sp-grande&ver=folleto&${D}`); await pg.waitForSelector('.calendario li');
    assert.strictEqual(await pg.locator('.calendario li').count(), 14);
    assert((await pg.locator('.calendario li').nth(4).innerText()).includes('15/12/2026 – 4/1/2027'), 'jornada que cruza de año');
    assert((await pg.locator('.calendario li').nth(0).innerText()).includes('13/10 – 26/10/2026'));
    await sinDesborde('24º calendario (lista)'); bien('Calendario (lista) intacto con la copia del 24º: «15/12/2026 – 4/1/2027» en la J5');
    assert.deepStrictEqual(errs, [], 'la consola no debe mostrar violaciones de la CSP ni errores'); errs.length = 0;
    bien('consola limpia en el calendario (sin violaciones de CSP)');
    await pg.clock.setFixedTime(new Date('2026-11-15T10:00:00'));
    // sin "calendario" en el JSON, aviso; el enlace antiguo ver=linea lleva a Calendario
    for (const ver of ['folleto', 'linea']) {
      await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=${ver}&${D}`);
      await pg.waitForSelector('text=no tiene calendario publicado');
      assert.strictEqual(await pg.locator('.calendario, .linea-tiempo').count(), 0);
    }
    bien('sin la clave calendario se avisa; ver=linea lleva a Calendario');
    // Bases del campeonato (ver=normativa): con PDF, el botón; sin él, lo dice. El anuncio del libro está en la portada, tras un botón.
    for (const t of ['sp-ejemplo-anterior', 'sp-ejemplo']) {
      await pg.goto(`${base}/torneo.html?t=${t}&ver=normativa&${D}`);
      await pg.waitForSelector(t === 'sp-ejemplo' ? '.normativa button' : 'text=no tiene normativa publicada');
      assert.strictEqual(await pg.locator('nav.pestanas a[aria-current=page]').innerText(), 'Bases del campeonato');
      assert.strictEqual(await pg.locator('.libro').count(), 0);
      await sinDesborde('normativa ' + t);
      if (capt && t === 'sp-ejemplo-anterior') await pg.screenshot({ path: `${capt}/normativa_${w}.png`, fullPage: true });
    }
    bien('Bases del campeonato: ver=normativa la abre, con el botón del PDF o diciendo que no hay');
    await pg.goto(`${base}/index.html?${D}`);
    await pg.waitForSelector('#lista li');
    assert.strictEqual(await pg.locator('.libro').isHidden(), true);
    await pg.click('button:has-text("Ver libro")');
    assert.strictEqual(await pg.locator('.libro').isVisible(), true);
    {
      const img = pg.locator('.libro img.libro-portada');
      assert.strictEqual(await img.getAttribute('src'), 'assets/libro-portada.jpg');
      assert((await img.getAttribute('alt')).length > 30 && await img.getAttribute('width') && await img.getAttribute('height') && await img.getAttribute('loading') === 'lazy');
      await img.scrollIntoViewIfNeeded(); await pg.waitForFunction(() => document.querySelector('.libro img').complete && document.querySelector('.libro img').naturalWidth > 0);
      const enl = pg.locator('.libro a.libro-enlace');
      assert.strictEqual(await enl.getAttribute('href'), 'https://www.amazon.es/JUGUEMOS-DOMIN%C3%93-FORMACI%C3%93N-PRINCIPIANTES-PAREJAS/dp/B0DLCSRN4S');
      assert.strictEqual(await enl.getAttribute('target'), '_blank');
      assert.deepStrictEqual((await enl.getAttribute('rel')).split(/\s+/).sort(), ['noopener', 'noreferrer']);
      assert((await enl.textContent()).startsWith('Ver en Amazon'));
      const txt = await pg.locator('.libro').textContent();
      for (const f of ['Jesús Eduardo Elián Campos', 'Reglamento del Juego y Competiciones', '¡Que comience la partida!']) assert(txt.includes(f), f);
      assert.strictEqual(await pg.locator('.libro-texto').evaluate((e) => e.scrollWidth <= e.clientWidth), true);
      await sinDesborde('portada con el libro');
    }
    bien('portada: el anuncio del libro sale al pulsar «Ver libro» con alt, tamaño y lazy; enlace a Amazon con target y rel correctos');
    assert(!(await pg.request.head(`${base}/datos/sp-2026-27/folleto.pdf`)).ok(), 'el folleto del 24º ya no se publica');

    // torneo terminado con grupo B, ND, incomparecencia
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo-anterior&ver=clasificacion&${D}`);
    await pg.waitForSelector('table.clasi');
    assert.strictEqual(await pg.locator('.grupos button').count(), 2);
    await pg.click('.grupos button:has-text("Grupo B")');
    await pg.waitForFunction(() => document.querySelector('table.clasi caption').textContent.includes('grupo B'));
    assert.strictEqual(await pg.locator('table.clasi tbody tr').count(), 4);
    await sinDesborde('grupo B'); bien('grupo A y B con su selector');
    if (capt) await pg.screenshot({ path: `${capt}/clasiB_${w}.png`, fullPage: true });
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo-anterior&ver=mesas&j=5&${D}`);
    await pg.waitForSelector('.res');
    assert.strictEqual(await pg.locator('.etiq-estado.nd').first().innerText(), 'ND');
    assert.strictEqual(await pg.locator('li.mesa:has(.etiq-estado.nd) .res b').count(), 0);
    await sinDesborde('ND'); bien('encuentro No disputado: etiqueta ND en lugar del resultado');
    for (const [est, txt] of [['incomparecencia', 'Incomparecencia'], ['descanso', 'Descansa']]) {
      const n = await pg.locator('.etiq-estado.' + est).count();
      if (n) assert.strictEqual((await pg.locator('.etiq-estado.' + est).first().innerText()).toLowerCase(), txt.toLowerCase());
    }
    // retirada y descanso del parejas
    await pg.goto(`${base}/torneo.html?t=parejas-ejemplo-2026-11-14&ver=mesas&${D}`);
    await pg.waitForSelector('li.mesa'); assert((await pg.locator('body').innerText()).toLowerCase().includes('descansa'));
    assert.strictEqual(await pg.locator('.plazo').count(), 0);
    bien('descanso en parejas, sin fechas de juego (su JSON no las trae)');
    // individual: dos y dos
    await pg.goto(`${base}/torneo.html?t=individual-ejemplo-2026-11-14&ver=mesas&${D}`);
    await pg.waitForSelector('li.mesa'); assert.strictEqual(await pg.locator('li.mesa').first().locator('.lado .n').count(), 4);
    assert.strictEqual(await pg.locator('nav.pestanas a').nth(3).innerText(), 'Jugadores');
    await sinDesborde('individual'); bien('individual: 2 jugadores contra 2');
    // la copia del 24º: un botón por jornada publicada (según actual.json), y se abre la jornada en curso
    const act24 = JSON.parse(require('fs').readFileSync('pruebas/datos/sp-grande/actual.json', 'utf8'));
    const nPub = (act24.jornadas || [act24.jornada]).length;
    await pg.goto(`${base}/torneo.html?t=sp-grande&ver=clasificacion&${D}`);
    await pg.waitForSelector('table.clasi');
    assert.strictEqual(await pg.locator('.jornadas button').count(), nPub);
    await pg.click('nav.pestanas a:has-text("Partidas")');
    await pg.waitForSelector('li.mesa');
    assert.strictEqual(await pg.locator('.jornadas button').count(), nPub);
    assert.strictEqual(await pg.locator('.jornadas button[aria-pressed=true]').innerText(), String(act24.jornada.numero));
    assert((await pg.locator('li.mesa').count()) >= 20);
    await sinDesborde('24º mesas'); bien(`copia del 24º: ${nPub} botones, se abre la J${act24.jornada.numero}, mesas con tarjeta, sin desbordar`);
    if (capt) await pg.screenshot({ path: `${capt}/real_${w}.png`, fullPage: true });
    // enlace del buscador resalta la fila
    await pg.goto(`${base}/torneo.html?t=sp-ejemplo&ver=mesas&p=3&${D}`);
    await pg.waitForSelector('li.mesa.resalte'); bien('?p= resalta la mesa del jugador');
    assert.deepStrictEqual(errs, []); errs.length = 0;
    // inexistente (el 404 es lo esperado)
    await pg.goto(`${base}/torneo.html?t=no-existe&${D}`);
    await pg.waitForSelector('text=No se ha encontrado este campeonato'); bien('campeonato inexistente: mensaje llano'); errs.length = 0;
    // sin ?d= : datos reales, cifrados con otra contraseña (o aún sin cifrar): candado y sin banda de prueba
    await pg.goto(`${base}/index.html`);
    await pg.waitForSelector('#candado');
    assert.strictEqual(await pg.locator('.banda-prueba').count(), 0);
    assert.strictEqual(await pg.locator('.tarjeta, .fecha-ficha').count(), 0);
    bien('portada real: candado, sin banda de prueba y sin tarjetas');
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }
  await b.close();
  console.log(`\n${ok} comprobaciones bien`);
})().catch((e) => { console.error('FALLA:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
