// Prueba de que la web se ve entera en cualquier dispositivo: nada se oculta, nada se corta, la página no se desplaza en horizontal.
// Regla fija del plan (Anexo A, «Web en cualquier dispositivo»). Uso: node pruebas/probar_dispositivos.cjs [url-base] [carpeta-de-capturas]
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { instalar, sembrar, recordarWeb, TOKEN } = require('./api_simulada.cjs');
const { CONTRASENA_PRUEBA, recordarPrueba } = require('./cripto_prueba.cjs');
const base = process.argv[2] || 'http://localhost:8765';
const capt = process.argv[3];
const raiz = path.join(__dirname, '..');
const TAMANOS = [[320, 640], [360, 780], [390, 844], [412, 915], [667, 375], [768, 1024], [1280, 800]];
const D = 'd=datos/_prueba';
const PESTANAS = ['', 'clasificacion', 'mesas', 'parejas', 'folleto', 'normativa'];

// Se ejecuta en la página. Devuelve la lista de fallos (texto).
function revisar() {
  const fallos = [];
  const nombre = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '') + ' «' + (e.textContent || '').trim().slice(0, 40) + '»';
  const iw = document.documentElement.clientWidth;
  // (a) la página no se desplaza en horizontal
  if (document.documentElement.scrollWidth > iw || document.body.scrollWidth > iw) fallos.push(`(a) la página se desplaza en horizontal: ${document.documentElement.scrollWidth} > ${iw}`);
  const todos = [...document.body.querySelectorAll('*')].filter((e) => !['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(e.tagName) && !e.closest('.solo-lector'));
  const scroller = (e) => /auto|scroll/.test(getComputedStyle(e).overflowX);
  for (const e of todos) {
    const s = getComputedStyle(e);
    const conTexto = (e.textContent || '').trim() !== '';
    // (b) datos ocultos
    if (conTexto && (s.display === 'none' || s.visibility === 'hidden') && !e.closest('[hidden]')) fallos.push('(b) oculto con datos: ' + nombre(e).replace(/ «.*»$/, ''));
    if (s.display === 'none') continue;
    // (c) overflow hidden/clip que recorta. Un campo de contraseña no enseña datos (son puntos): lo largo se desplaza dentro, como en cualquier campo.
    if (/hidden|clip/.test(s.overflowX + s.overflowY) && !(e.tagName === 'INPUT' && e.type === 'password') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1))
      fallos.push(`(c) recorta (${e.scrollWidth}x${e.scrollHeight} en ${e.clientWidth}x${e.clientHeight}): ` + nombre(e));
    // (f) el contenido se sale de su caja sin que haya desplazamiento
    if (!scroller(e) && s.display !== 'inline' && s.display !== 'contents' && !/table-(row|column)/.test(s.display) && e.clientWidth && e.scrollWidth > e.clientWidth + 1 && !/hidden|clip/.test(s.overflowX))
      fallos.push(`(f) se sale de su caja (${e.scrollWidth} > ${e.clientWidth}): ` + nombre(e));
  }
  // (e) texto visible fuera de la ventana (si lo tapa una caja desplazable, vale: se llega con el desplazamiento)
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t; (t = w.nextNode());) {
    const e = t.parentElement;
    if (!t.nodeValue.trim() || !e || e.closest('.solo-lector, [hidden], script, style')) continue;
    if (getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') continue;
    const r = document.createRange(); r.selectNodeContents(t);
    for (const q of r.getClientRects()) {
      if (!q.width) continue;
      let dentro = false; for (let a = e; a && a !== document.body; a = a.parentElement) if (scroller(a)) { dentro = true; break; }
      if (!dentro && (q.right > iw + 1 || q.left < -1)) { fallos.push(`(e) texto fuera de la ventana: «${t.nodeValue.trim().slice(0, 40)}» (${Math.round(q.left)}–${Math.round(q.right)} de ${iw})`); break; }
    }
  }
  return fallos;
}

// (d) en la clasificación se llega hasta la última columna (SP: PUNT. C.; parejas e individual: Desempate)
function llegaAPuntC() {
  const caja = document.querySelector('.tabla-caja'); const tabla = caja && caja.querySelector('table.clasi');
  if (!tabla) return ['(d) no hay tabla de clasificación'];
  const f = [];
  const cab = [...tabla.querySelectorAll('thead th')].map((t) => t.textContent.trim());
  const sp = cab.includes('ENC.J');
  const esperadas = sp ? ['ENC.J', 'P. G.', 'P. P.', 'PUNT. C.'] : ['Puesto', 'Nº', 'Zona', 'P.G.', 'P.F.', 'P.C.', 'Dif.', 'Desempate'];
  for (const c of esperadas) if (!cab.includes(c)) f.push('(d) falta la columna ' + c);
  const ultima = sp ? 'PUNT. C.' : 'Desempate';
  caja.scrollLeft = 1e6;
  const tc = [...tabla.querySelectorAll('thead th')].find((t) => t.textContent.trim() === ultima);
  if (!tc) return f;
  const a = tc.getBoundingClientRect(), b = caja.getBoundingClientRect();
  if (getComputedStyle(tc).display === 'none' || a.width === 0) f.push(`(d) ${ultima} oculta`);
  else if (a.right > b.right + 1 || a.left < b.left - 1) f.push(`(d) no se llega a ${ultima}: ${Math.round(a.left)}–${Math.round(a.right)} fuera de ${Math.round(b.left)}–${Math.round(b.right)}`);
  caja.scrollLeft = 0;
  return f;
}

(async () => {
  const b = await chromium.launch();
  const fallos = []; let n = 0;
  const xl = fs.mkdtempSync(path.join(os.tmpdir(), 'tumesa-disp-'));
  const excel = path.join(xl, 'largos.xlsx');
  execFileSync('python3', [path.join(__dirname, 'hacer_xlsx.py'), path.join(__dirname, 'datos/nombres-largos/actual.json'), excel]);
  const variasPartidas = path.join(xl, 'partidas.xlsx'); // parejas con las partidas 1 y 2 en las hojas de datos
  execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_partidas.py'), path.join(__dirname, 'datos/parejas-ejemplo-2026-11-14'), '2', variasPartidas]);

  for (const [w, h] of TAMANOS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const pg = await ctx.newPage();
    const mira = async (donde, extra) => {
      n++;
      const f = [...await pg.evaluate(revisar), ...(extra ? await pg.evaluate(extra) : [])];
      for (const x of f) fallos.push(`${w}x${h} · ${donde} · ${x}`);
    };

    // pantalla de contraseña, sin clave en el dispositivo: vacía, con el error y en un campeonato; después se escribe la buena
    await pg.goto(`${base}/index.html?${D}`); await pg.waitForSelector('#form-clave');
    await mira('contraseña · portada');
    await pg.fill('#clave', 'una contraseña que no es la buena y además muy larga'); await pg.click('#form-clave button[type=submit]');
    await pg.waitForSelector('#clave-msg.caja'); await mira('contraseña · errónea');
    await pg.goto(`${base}/torneo.html?t=nombres-largos&${D}`); await pg.waitForSelector('#form-clave');
    await mira('contraseña · campeonato');
    await pg.goto(`${base}/index.html`); await pg.waitForSelector('#candado'); await mira('web real · candado o «preparando»');
    await pg.goto(`${base}/index.html?${D}`); await pg.waitForSelector('#form-clave');
    await pg.fill('#clave', CONTRASENA_PRUEBA); await pg.click('#form-clave button[type=submit]');
    await pg.waitForSelector('.tarjeta');
    await mira('portada');
    await mira('portada · botón «Olvidar contraseña»', () => (document.querySelector('#olvidar-clave') && document.querySelector('#olvidar-clave').offsetParent ? [] : ['falta el botón «Olvidar contraseña en este dispositivo»']));
    await pg.fill('#buscar', 'pons'); await pg.waitForSelector('.persona .puesto:not(:text("…"))'); await pg.waitForTimeout(200);
    await mira('portada · buscador');
    await pg.fill('#buscar', 'zzzz'); await pg.waitForSelector('text=No hay nadie'); await mira('portada · sin resultados');

    for (const [t, q] of [['sp-grande', D + '&'], ['nombres-largos', D + '&'], ['sp-ejemplo', D + '&'], ['parejas-ejemplo-2026-11-14', D + '&'], ['individual-ejemplo-2026-11-14', D + '&'], ['parejas-largos', D + '&']]) {
      for (const ver of PESTANAS) {
        await pg.goto(`${base}/torneo.html?${q}t=${t}${ver ? '&ver=' + ver : ''}`);
        await pg.waitForSelector(!ver ? '.podio' : ver === 'normativa' ? '.normativa button, .vacio' : ver === 'folleto' ? '.calendario, .vacio' : ver === 'parejas' ? '.lista-parejas' : ver === 'mesas' ? '.mesa' : 'table.clasi');
        await mira(`${t} · ${ver || 'resumen'}`, ver === 'clasificacion' ? llegaAPuntC : null);
        if (!ver) { await pg.fill('#quien', 'a'); await mira(`${t} · resumen · una letra`); await pg.fill('#quien', '1'); await pg.waitForSelector('.ficha'); await mira(`${t} · resumen · ficha`); }
        if (capt && t === 'sp-grande' && ver === 'clasificacion' && (w === 360 || w === 390)) {
          fs.mkdirSync(capt, { recursive: true });
          await pg.evaluate(() => document.querySelector('.tabla-marco').scrollIntoView());
          await pg.screenshot({ path: `${capt}/clasificacion_24_${w}_inicio.png` });
          await pg.evaluate(() => { document.querySelector('.tabla-caja').scrollLeft = 1e6; });
          await pg.waitForTimeout(150);
          await pg.screenshot({ path: `${capt}/clasificacion_24_${w}_final.png` });
        }
      }
    }

    // mesa de control: listas de la web y de borradores (con nombres largos), cada panel de acción, el Excel con destino, un fallo a mitad y un borrador
    const api = await instalar(ctx);
    await recordarWeb(ctx);
    api.ponerCifrado('datos/indice.json', JSON.stringify({ version: '1.0', publicado: '2026-01-01T00:00:00Z', torneos: [] }));
    sembrar(api, 'web', 'sp-ejemplo', { normativa: true }); sembrar(api, 'web', 'nombres-largos');
    sembrar(api, 'borr', 'parejas-ejemplo-2026-11-14'); sembrar(api, 'borr', 'individual-ejemplo-2026-11-14');
    await pg.goto(`${base}/publicar.html`);
    await pg.waitForSelector('#lista-web');
    await mira('mesa · sin token');
    await pg.fill('#token', TOKEN); await pg.click('text=Guardar y comprobar'); await pg.waitForSelector('text=Hay un token guardado');
    await pg.waitForSelector('#lista-web[data-listo]'); await pg.waitForSelector('#lista-borr[data-listo]');
    await mira('mesa · listas');
    await pg.click('#clave-estado button:text-is("Cambiar la contraseña")'); await pg.waitForSelector('#nueva-clave');
    await mira('mesa · cambiar la contraseña');
    await pg.fill('#nueva-clave', 'corta'); await mira('mesa · contraseña demasiado corta');
    await pg.click('#panel-clave button:text-is("Cancelar")');
    await pg.locator('#lista-web li.torneo[data-id="nombres-largos"] .acciones button:text-is("Subir normativa (PDF)")').click();
    await pg.waitForSelector('#lista-web li.torneo[data-id="nombres-largos"] .panel input[type=file]'); await mira('mesa · subir normativa');
    await pg.locator('#lista-web li.torneo[data-id="sp-ejemplo"] .acciones button:text-is("Quitar normativa")').click();
    await pg.waitForSelector('#lista-web li.torneo[data-id="sp-ejemplo"] .aviso-accion'); await mira('mesa · quitar normativa');
    const abre = async (lista, id, accion, espera) => { await pg.locator(`#lista-${lista} li.torneo[data-id="${id}"] .acciones button:text-is("${accion}")`).click(); await pg.waitForSelector(`#lista-${lista} li.torneo[data-id="${id}"] ${espera}`); };
    await abre('web', 'nombres-largos', 'Editar', '#ed-nombre'); await mira('mesa · editar');
    await pg.fill('#ed-nombre', 'ab'); await pg.click('#lista-web .panel button:text-is("Guardar cambios")'); await mira('mesa · editar con error');
    await abre('web', 'nombres-largos', 'Ocultar', '.aviso-accion'); await mira('mesa · confirmar ocultar');
    await abre('web', 'nombres-largos', 'Eliminar', '.panel input'); await mira('mesa · eliminar (escribir el id)');
    await abre('borr', 'individual-ejemplo-2026-11-14', 'Publicar', '.aviso-accion'); await mira('mesa · confirmar publicar borrador');
    api.fallar = (m, clave, ruta) => (m === 'PUT' && clave === 'web' && ruta === 'datos/indice.json' ? 500 : null);
    await pg.click('#lista-borr .panel button:text-is("Sí, publicar en la web")');
    await pg.waitForSelector('#reintento-mesa button'); await mira('mesa · registro con fallo y Reintentar');
    api.fallar = null;
    await pg.setInputFiles('#archivo', excel);
    await pg.waitForSelector('#paso-revision:not([hidden]) .resumen');
    await pg.click('#revision summary');
    await mira('publicar · revisión con destino');
    await pg.click('input[name=destino][value=web]'); await pg.waitForFunction(() => document.querySelector('#publicar').textContent === 'Publicar en la web');
    await mira('publicar · destino web');
    await pg.setInputFiles('#archivo', variasPartidas); await pg.waitForSelector('#partidas input[data-k="2"]');
    await pg.check('#partidas input[data-k="1"]'); await pg.waitForSelector('.vals li.confirma, .vals li.avisa');
    await mira('publicar · varias partidas: casillas, avisos y botón');
    // borrador visto por torneo.html: con token, sin token y con token de otro
    await pg.goto(`${base}/torneo.html?t=parejas-ejemplo-2026-11-14&borrador=1&ver=clasificacion`); await pg.waitForSelector('table.clasi');
    await mira('borrador · clasificación');
    await pg.goto(`${base}/torneo.html?t=parejas-ejemplo-2026-11-14&borrador=1&ver=mesas`); await pg.waitForSelector('.mesa');
    await mira('borrador · mesas');
    await pg.evaluate(() => localStorage.removeItem('tumesa.token'));
    await pg.goto(`${base}/torneo.html?t=parejas-ejemplo-2026-11-14&borrador=1`); await pg.waitForSelector('#contenido .aviso');
    await mira('borrador · privado');
    await ctx.close();
  }
  await b.close();
  const unicos = [...new Set(fallos)];
  console.log(`${n} comprobaciones en ${TAMANOS.length} tamaños`);
  if (unicos.length) { console.log(unicos.slice(0, 60).join('\n')); if (unicos.length > 60) console.log(`… y ${unicos.length - 60} más`); console.log(`FALLA: ${unicos.length} fallos`); process.exit(1); }
  console.log('Todo en verde.');
})().catch((e) => { console.error(e); process.exit(1); });
