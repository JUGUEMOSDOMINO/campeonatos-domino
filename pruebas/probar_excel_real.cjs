// Prueba con un Excel real de un generador (hoja WEB de verdad, valores guardados): lo lee con SheetJS como hace
// publicar.html y comprueba que sale el mismo JSON que escribe tools/comun/web_export.py (programas-domino; sirve para sp, parejas e individual).
// El Excel NO está ni debe estar en este repositorio: se pasa por ruta.
//
//   python3 -I <programas-domino>/tools/comun/web_export.py libro.xlsx /tmp/web --publicado 2026-01-01T00:00:00Z
//   node pruebas/probar_excel_real.cjs libro.xlsx /tmp/web/<id>/jornada_NN.json [url-base, por defecto http://localhost:8765] [--ficticio]
//   --ficticio: libro de los casos de prueba (nombres con cifras, que V06 bloquea). Solo comprueba la parte de Node y que V06 sea lo único que bloquea.
//   --refs carpeta: los JSON de cada partida (k01.json, k02.json…) hechos con pruebas/refs_por_partida.py, que recalcula el libro con LibreOffice partida a partida (WEB_J_MANUAL)
//   y pasa web_export.py a cada uno. Con ellos se comprueba que cada partida que ofrece publicar.html sale idéntica a lo que daría la hoja WEB con esa partida elegida.
//
// 1) Node: SheetJS lee solo la hoja WEB, A1 es texto "1.0", ninguna celda con error, sin bloqueos de validación, JSON idéntico.
// 2) Navegador (Playwright): se elige el Excel en publicar.html con una API de GitHub simulada, se publica y los archivos
//    escritos son idénticos, byte a byte, a los de web_export.py. Se mide el tiempo desde elegir el archivo hasta la revisión.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const XLSX = require('../assets/xlsx.mini.min.js');
const C = require('../assets/contrato.js');
const P = require('../assets/partidas.js');
const { chromium } = require('playwright');
const { instalar, recordarWeb } = require('./api_simulada.cjs');

const ficticio = process.argv.includes('--ficticio');
const iRefs = process.argv.indexOf('--refs'), refs = iRefs > 0 ? process.argv[iRefs + 1] : null;   // casos de prueba con nombres como Nom1a: V06 bloquea a propósito
const [xlsx, jsonPy, base = 'http://localhost:8765'] = process.argv.slice(2).filter((x, i, a) => !x.startsWith('--') && a[i - 1] !== '--refs');
if (!xlsx || !jsonPy) { console.error('Uso: node pruebas/probar_excel_real.cjs libro.xlsx jornada_NN.json [url-base]'); process.exit(2); }
const quitar = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.publicado; delete c.jornadas; return c; };
const esperado = JSON.parse(fs.readFileSync(jsonPy, 'utf8'));
const textoPy = fs.readFileSync(jsonPy, 'utf8');
let ok = 0;
const bien = (t) => { ok++; console.log('  ok  ' + t); };
const MB = (fs.statSync(xlsx).size / 1048576).toFixed(2);
console.log(`${path.basename(xlsx)} (${MB} MB), jornada ${esperado.jornada.numero}, ${esperado.participantes.length} participantes`);

(async () => {
  // ---- 1) Node
  const buf = fs.readFileSync(xlsx);
  let t0 = process.hrtime.bigint();
  const wb = XLSX.read(buf, { type: 'array', sheets: 'WEB' });
  const msNode = Number(process.hrtime.bigint() - t0) / 1e6;
  const ws = wb.Sheets.WEB;
  assert.deepStrictEqual(Object.keys(wb.Sheets), ['WEB']);
  bien(`SheetJS lee solo la hoja WEB (${msNode.toFixed(0)} ms en Node)`);
  assert.strictEqual(ws.A1.t, 's'); assert.strictEqual(ws.A1.v, '1.0');
  bien('A1 es el texto "1.0", no un número');
  const r = C.leer(ws);
  assert.deepStrictEqual(r.estructura, []); assert.deepStrictEqual(r.celdasError, []);
  bien('estructura del contrato y ninguna celda con error');
  // vacíos: una fórmula que da "" se guarda como cadena vacía o sin valor y debe leerse como null
  const vacias = Object.keys(ws).filter((k) => /^[A-Z]+\d+$/.test(k) && ws[k].t === 's' && ws[k].v === '').length;
  const nulos = r.participantes.filter((p) => p.ret_desde === null).length;
  assert(nulos > 0);
  bien(`celdas vacías ("" de una fórmula): ${vacias} cadenas vacías en la hoja, leídas como null`);
  const fechas = [r.meta.fecha, r.meta.plazo_desde, r.meta.plazo_hasta].filter((x) => x != null);
  assert(fechas.every((f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)));
  bien(`fechas como texto aaaa-mm-dd: ${fechas.join(', ')}`);
  const j = C.construir(r, 'x');
  assert.deepStrictEqual(quitar(j), quitar(esperado));
  bien('JSON de publicar.html (contrato.js) == JSON de web_export.py, objeto a objeto');
  // las demás partidas, sacadas de _WEBC y _R1…_Rn
  const lista = P.listar(r, P.leerHojas(XLSX, buf, wb, j.torneo.n_jornadas));
  assert.strictEqual(lista.aviso, null, lista.aviso);
  assert.deepStrictEqual(quitar(lista.partidas.find((p) => p.k === j.jornada.numero).json), quitar(esperado));
  bien(`partidas con datos: ${lista.partidas.map((p) => p.k).join(', ')}; la de la hoja WEB (${j.jornada.numero}) sale igual que la de web_export.py`);
  if (refs) {
    const leerRef = (k) => JSON.parse(fs.readFileSync(path.join(refs, 'k' + String(k).padStart(2, '0') + '.json'), 'utf8'));
    for (const p of lista.partidas) assert.deepStrictEqual(quitar(p.json), quitar(leerRef(p.k)), 'partida ' + p.k);
    const conDatos = fs.readdirSync(refs).filter((f) => /^k\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(refs, f), 'utf8')))
      .filter((x) => x.emparejamientos.some((m) => ['jugada', 'incomparecencia', 'retirada', 'nd'].includes(m.estado))).map((x) => x.jornada.numero);
    const ofrecidas = lista.partidas.map((p) => p.k), esperadas = [...new Set([...conDatos, j.jornada.numero])].sort((a, b) => a - b);
    // las que faltan solo pueden ser las que no se pueden sacar sin otras hojas (una sustitución posterior a la de la hoja WEB): derivar dice por qué
    const hojas = P.leerHojas(XLSX, buf, wb, j.torneo.n_jornadas);
    const faltan = esperadas.filter((k) => !ofrecidas.includes(k));
    assert.deepStrictEqual(ofrecidas.filter((k) => !esperadas.includes(k)), []);
    for (const k of faltan) assert(P.derivar(r, hojas, k).motivo, 'la partida ' + k + ' tiene datos y no se ofrece, sin motivo');
    if (faltan.length) console.log(`     no se ofrecen (no se pueden sacar sin otras hojas): ${faltan.join(', ')}`);
    bien(`cada partida ofrecida es igual a la que da la hoja WEB (recalculada con LibreOffice) con esa partida elegida: ${lista.partidas.length} de ${lista.partidas.length}`);
  }
  const v = C.validar(r, j, { indice: null, actual: null });
  const bloqueos = v.filter((x) => x.gravedad === 'bloquea').map((x) => x.cod);
  assert.deepStrictEqual(bloqueos, ficticio ? ['V06'] : []);
  bien(ficticio ? 'validación: solo V06 bloquea (nombres ficticios con cifras)' : 'validación V01–V18: sin bloqueos' + (v.length ? ` (${v.map((x) => x.cod).join(', ')})` : ''));
  if (ficticio) { console.log(`\n${ok} comprobaciones bien`); return; }

  // ---- 2) navegador
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('tumesa.token', 'ghp_TOKEN_DE_PRUEBA'));
  const api = await instalar(ctx);
  await recordarWeb(ctx); // la contraseña de la web ya está en este navegador
  const pg = await ctx.newPage();
  const errores = []; pg.on('pageerror', (e) => errores.push(e.message));
  await pg.goto(base + '/publicar.html');
  t0 = process.hrtime.bigint();
  await pg.setInputFiles('#archivo', xlsx);
  await pg.waitForSelector('.tabla-caja', { timeout: 120000 });
  const msNav = Number(process.hrtime.bigint() - t0) / 1e6;
  await pg.click('input[name=destino][value=web]'); // un torneo nuevo se propone como borrador; aquí se publica en la web
  await pg.waitForFunction(() => document.querySelector('#publicar').textContent.startsWith('Publicar en la web'));
  const ks = await pg.$$eval('#partidas input[data-k]', (l) => l.map((x) => Number(x.dataset.k)));
  assert.deepStrictEqual(ks, lista.partidas.map((p) => p.k));
  bien(`publicar.html ofrece una casilla por partida con datos: ${ks.join(', ')}`);
  for (const k of ks) if (k !== esperado.jornada.numero) await pg.uncheck(`#partidas input[data-k="${k}"]`); // primero, solo la de la hoja WEB
  assert.strictEqual(await pg.isDisabled('#publicar'), false);
  bien(`publicar.html lee y valida el Excel de ${MB} MB en ${(msNav / 1000).toFixed(2)} s (Chromium, esta máquina) y deja publicar`);
  const vals = await pg.$$eval('.vals > li.bloquea, .vals > li.confirma, .vals > li.avisa', (l) => l.map((x) => x.className + ': ' + x.textContent.slice(0, 80)));
  if (vals.length) console.log('     avisos en pantalla: ' + vals.join(' // '));
  await pg.click('#publicar'); await pg.waitForSelector('text=Publicado.', { timeout: 60000 });
  const id = esperado.torneo.id, nn = String(esperado.jornada.numero).padStart(2, '0');
  assert.deepStrictEqual(api.puts.map((p) => p.clave + ' ' + p.ruta), [`web datos/${id}/jornada_${nn}.json`, `web datos/${id}/actual.json`, 'web datos/indice.json']);
  const sinPub = (t) => t.replace(/"publicado": "[^"]*"/g, '"publicado": "X"');
  assert.strictEqual(sinPub(api.bytes('web', `datos/${id}/jornada_${nn}.json`).toString('utf8')), sinPub(textoPy));
  bien('jornada_NN.json escrito por publicar.html: idéntico, byte a byte, al de web_export.py (salvo `publicado`), una vez descifrado');
  assert.deepStrictEqual(api.enClaro, []);
  assert(api.puts.every((p) => api.cifradoCon(p.ruta) === 0));
  bien('los tres archivos subieron cifrados con la clave de la web');
  const act = api.json('web', `datos/${id}/actual.json`);
  assert.deepStrictEqual(quitar(act), quitar(esperado));
  assert.deepStrictEqual(act.jornadas.map((x) => x.numero), [esperado.jornada.numero]);
  bien('actual.json e indice.json coherentes');
  // y ahora todas las partidas a la vez
  if (ks.length > 1) {
    api.puts.length = 0;
    for (const k of ks) if (!(await pg.isChecked(`#partidas input[data-k="${k}"]`))) await pg.check(`#partidas input[data-k="${k}"]`);
    for (const c of await pg.$$('.vals li.confirma input')) await c.check(); // las confirmaciones que pidan (partidas anteriores a la publicada, por ejemplo)
    assert.strictEqual(await pg.isDisabled('#publicar'), false);
    await pg.click('#publicar'); await pg.waitForSelector('text=Publicadas las', { timeout: 60000 });
    assert.deepStrictEqual(api.puts.map((p) => p.ruta), [...ks.map((k) => `datos/${id}/jornada_${String(k).padStart(2, '0')}.json`), `datos/${id}/actual.json`, 'datos/indice.json']);
    for (const k of ks) {
      const nn2 = String(k).padStart(2, '0'), pub = api.json('web', `datos/${id}/jornada_${nn2}.json`);
      assert.strictEqual(pub.jornada.numero, k);
      if (refs) assert.deepStrictEqual(quitar(pub), quitar(JSON.parse(fs.readFileSync(path.join(refs, 'k' + nn2 + '.json'), 'utf8'))), 'partida ' + k);
    }
    const act2 = api.json('web', `datos/${id}/actual.json`);
    assert.deepStrictEqual([act2.jornada.numero, act2.jornadas.map((x) => x.numero)], [Math.max(...ks), ks]);
    assert.deepStrictEqual(api.enClaro, []); assert.deepStrictEqual(api.violaciones, []);
    bien(`subir las ${ks.length} partidas a la vez: un archivo por partida${refs ? ' (cada uno idéntico a la referencia)' : ''}, actual.json con la lista y la última, todo cifrado`);
  }
  assert.deepStrictEqual(errores, []);
  bien('sin errores de JavaScript en la página');
  await b.close();
  console.log(`\n${ok} comprobaciones bien`);
})().catch((e) => { console.error('FALLA:', e.message); process.exit(1); });
