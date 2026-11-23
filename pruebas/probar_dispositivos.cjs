// Prueba de que la web se ve entera en cualquier dispositivo: nada se oculta, nada se corta, la página no se desplaza en horizontal.
// Regla fija del plan (Anexo A, «Web en cualquier dispositivo»). Uso: node pruebas/probar_dispositivos.cjs [url-base] [carpeta-de-capturas]
const assert = require('assert');
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
// Lo que se abre a petición no es información oculta. En las páginas de la web, solo [hidden]. En las páginas sueltas del árbitro (jugar, retos, federación y casos del libro)
// también las ventanas del juego (.hidden) y el aviso de «escribe tu razonamiento» de los casos (.aviso-escribir).
function revisar() {
  const fallos = [];
  const A_PETICION = ['portada', 'torneo', 'publicar'].includes(document.body.dataset.pagina) ? '[hidden]' : '[hidden], .hidden, .aviso-escribir';
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
    if (conTexto && (s.display === 'none' || s.visibility === 'hidden') && !e.closest(A_PETICION)) fallos.push('(b) oculto con datos: ' + nombre(e).replace(/ «.*»$/, ''));
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

// (g) en toda tabla .clasi de la web (ranking y campeonatos): cada título de columna va entero en una sola línea, sin perder letras, y las columnas
// fijas (las tres primeras) tapan por completo lo que pasa por debajo al desplazar y quedan pegadas entre sí.
function cabecerasEnteras() {
  const f = [];
  const tablas = [...document.querySelectorAll('.tabla-caja table.clasi')].filter((t) => t.querySelector('thead') && !t.closest('#revision, [hidden]') && t.id !== 'bloque-ranking' && t.closest('main, #contenido, body') && t.offsetParent && document.body.dataset.pagina !== 'publicar');
  tablas.forEach((tabla, k) => {
    const caja = tabla.closest('.tabla-caja'), donde = `tabla ${k + 1}`;
    const ths = [...tabla.querySelectorAll('thead th')];
    for (const th of ths) {
      const t = th.textContent.trim();
      const r = document.createRange(); r.selectNodeContents(th);
      const lineas = new Set([...r.getClientRects()].filter((q) => q.width).map((q) => Math.round(q.top / 4)));
      if (lineas.size > 1) f.push(`(g) ${donde}: el título «${t}» se parte en ${lineas.size} líneas`);
      if (th.scrollWidth > th.clientWidth) f.push(`(g) ${donde}: el título «${t}» se corta (${th.scrollWidth} > ${th.clientWidth})`);
    }
    const fijas = (tr) => [...tr.children].slice(0, 3);
    const filas = [...tabla.rows];
    const cb = caja.getBoundingClientRect();
    const hdr = fijas(tabla.rows[0]).map((c) => c.getBoundingClientRect());
    if (Math.abs(hdr[0].left - cb.left) > 2) f.push(`(g) ${donde}: la primera columna fija no está pegada al borde (${Math.round(hdr[0].left - cb.left)} px)`);
    for (let i = 0; i < 2; i++) if (hdr[i + 1].left > hdr[i].right + 0.5) f.push(`(g) ${donde}: queda un hueco de ${Math.round(hdr[i + 1].left - hdr[i].right)} px entre columnas fijas`);
    const max = caja.scrollWidth - caja.clientWidth;
    for (const x of [0, Math.round(max * 0.4), max]) {
      caja.scrollLeft = x;
      for (const tr of filas) {
        for (const c of fijas(tr)) {
          c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); caja.scrollLeft = x;
          const q = c.getBoundingClientRect();
          if (!q.width || q.bottom < 0 || q.top > innerHeight) continue;
          for (const [px, py] of [[q.left + 1, q.top + 1], [q.right - 1, q.top + 1], [q.left + 1, q.bottom - 1], [q.right - 1, q.bottom - 1], [q.left + q.width / 2, q.top + q.height / 2]]) {
            if (py < 0 || py >= innerHeight) continue;
            const e = document.elementFromPoint(px, py);
            if (e && e !== c && !c.contains(e) && e.closest('td, th') && caja.contains(e)) { f.push(`(g) ${donde}: bajo «${c.textContent.trim().slice(0, 20)}» (desplazado ${x}) asoma «${e.closest('td, th').textContent.trim().slice(0, 20)}»`); break; }
          }
        }
      }
    }
    caja.scrollLeft = 0;
  });
  return [...new Set(f)];
}

// (d') en el ranking se llega desplazando hasta la última columna (CE) y puesto, jugador y licencia siguen fijos y a la vista
function llegaACE() {
  const caja = document.querySelector('.tabla-caja'); const tabla = caja && caja.querySelector('table.rk');
  if (!tabla) return ["(d') no hay tabla del ranking"];
  const f = [];
  const cab = [...tabla.querySelectorAll('thead th')];
  if (cab.slice(0, 3).map((t) => t.textContent.trim()).join('|') !== 'Puesto|Jugador|Licencia') f.push("(d') las tres primeras columnas no son Puesto, Jugador y Licencia");
  caja.scrollLeft = 1e6;
  const b = caja.getBoundingClientRect();
  const ce = cab[cab.length - 1].getBoundingClientRect();
  if (ce.right > b.right + 1 || ce.left < b.left) f.push("(d') la columna CE no se ve al desplazar hasta el final");
  for (const th of cab.slice(0, 3)) { const r = th.getBoundingClientRect(); if (r.left < b.left - 1 || r.right > b.right + 1) f.push(`(d') ${th.textContent.trim()} no queda fija`); }
  caja.scrollLeft = 0;
  return f;
}
// (d) en la clasificación se llega hasta la última columna (SP: PUNT. C.; parejas e individual: Dif., sin Desempate)
function llegaAPuntC() {
  const caja = document.querySelector('.tabla-caja'); const tabla = caja && caja.querySelector('table.clasi');
  if (!tabla) return ['(d) no hay tabla de clasificación'];
  const f = [];
  const cab = [...tabla.querySelectorAll('thead th')].map((t) => t.textContent.trim());
  const sp = cab.includes('ENC.J');
  const sinZona = !!window.__sinZona;                // el PDF de Access no trae zona: la columna vacía no se enseña
  const esperadas = sp ? ['ENC.J', 'P. G.', 'P. P.', 'PUNT. C.'] : sinZona ? ['Puesto', 'Nº', 'P.G.', 'P.F.', 'P.C.', 'Dif.'] : ['Puesto', 'Nº', 'Zona', 'P.G.', 'P.F.', 'P.C.', 'Dif.'];
  if (sinZona && cab.includes('Zona')) f.push('(d) la columna Zona no tiene que salir si ninguna pareja la tiene');
  if (!sp && cab.includes('Desempate')) f.push('(d) la columna Desempate no tiene que salir');
  for (const c of esperadas) if (!cab.includes(c)) f.push('(d) falta la columna ' + c);
  const ultima = sp ? 'PUNT. C.' : 'Dif.';
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
  const resumenOrg = path.join(xl, 'organizador.xlsx'); // Hoja de resumen de un organizador (datos inventados)
  execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_organizador.py'), resumenOrg]);

  for (const [w, h] of TAMANOS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const pg = await ctx.newPage();
    const mira = async (donde, extra) => {
      n++;
      const f = [...await pg.evaluate(revisar), ...await pg.evaluate(cabecerasEnteras), ...(extra ? await pg.evaluate(extra) : [])];
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

    // ranking FVD: la tabla (puesto, jugador y licencia fijos; hasta la columna CE) y la ficha de un jugador con nombre y asociación largos
    await pg.goto(`${base}/ranking.html?${D}&r=ranking-ejemplo`); await pg.waitForSelector('table.rk');
    await mira('ranking', llegaACE);
    await pg.click('.nombre-rk:text("Fernández-Villaverde")'); await pg.waitForSelector('#ficha:not([hidden])');
    await mira('ranking · ficha');
    // las tres plazas (SP, Open y ranking), el ranking provisional y el de las plazas vacías, con la ficha de quien tiene SP u Open
    await pg.click('table.rk .nombre-rk:text-is("Ana Roig")'); await pg.waitForSelector('#ficha:not([hidden])'); await mira('ranking · ficha con plaza SP');
    await pg.goto(`${base}/ranking.html?${D}&r=ranking-provisional`); await pg.waitForSelector('#plazas-provisionales'); await mira('ranking provisional · frase y plazas', llegaACE);
    await pg.goto(`${base}/ranking.html?${D}&r=ranking-vacias`); await pg.waitForSelector('#plazas-vacias'); await mira('ranking con plazas vacías', llegaACE);
    // plaza suelta por repartir (con su frase), ½ plaza y plazas SP y Open vacías: nada cortado desde 320 px
    await pg.goto(`${base}/ranking.html?${D}&r=ranking-repartir`); await pg.waitForSelector('.plaza-por-repartir'); await mira('ranking con plaza por repartir', llegaACE);
    await pg.click('table.rk .nombre-rk:text-is("Marta Puig")'); await pg.waitForSelector('#ficha:not([hidden])'); await mira('ranking · ficha con plaza por repartir');
    await pg.goto(`${base}/ranking.html?${D}&r=ranking-medias`); await pg.waitForSelector('.plaza-sp'); await mira('ranking con ½ plaza', llegaACE);
    await pg.goto(`${base}/ranking.html?${D}&r=ranking-vacias-sp-open`); await pg.waitForSelector('#plazas-vacias-sp'); await mira('ranking con plazas SP y Open vacías', llegaACE);
    await pg.goto(`${base}/ranking.html?${D}&r=ranking-abandono`); await pg.waitForSelector('td.abandono'); await mira('ranking con un abandono (caso 9 por jugador)', llegaACE);
    await pg.click('table.rk .nombre-rk:text-is("Marta Puig")'); await pg.waitForSelector('#ficha:not([hidden])'); await mira('ranking · ficha de quien abandonó');

    // páginas sueltas del árbitro: federación, casos del libro, retos y plataforma de juego
    for (const f of ['federacion-jaume-i', 'ejemplos-libro', 'retos', 'jugar']) {
      await pg.goto(`${base}/${f}.html`); await pg.waitForTimeout(400);
      await mira(f);
    }
    await pg.goto(`${base}/retos.html`); await pg.click('#btn-siguiente'); await pg.click('#btn-siguiente'); await pg.waitForSelector('.carro-continuo .ficha'); await mira('retos · paso 3');
    await pg.goto(`${base}/jugar.html`); await pg.fill('#player-alias', 'Prueba'); await pg.click('#btn-start-game'); await pg.waitForTimeout(800); await mira('jugar · mesa');

    for (const [t, q] of [['sp-grande', D + '&'], ['nombres-largos', D + '&'], ['sp-ejemplo', D + '&'], ['parejas-ejemplo-2026-11-14', D + '&'], ['individual-ejemplo-2026-11-14', D + '&'], ['parejas-largos', D + '&'], ['parejas-sin-fecha', D + '&']]) {
      for (const ver of PESTANAS) {
        await pg.goto(`${base}/torneo.html?${q}t=${t}${ver ? '&ver=' + ver : ''}`);
        await pg.waitForSelector(!ver ? '.podio' : ver === 'normativa' ? '.normativa button, .vacio' : ver === 'folleto' ? '.calendario, .vacio, .aviso' : ver === 'parejas' ? '.lista-parejas' : ver === 'mesas' ? '.mesa' : 'table.clasi');
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

    // campeonato publicado desde la Hoja de resumen de un organizador: solo Clasificación, con sus dos grupos
    await pg.goto(`${base}/torneo.html?${D}&t=1-campeonato-de-ejemplo-de-parejas-2027-02-06&ver=clasificacion`); await pg.waitForSelector('table.clasi');
    await mira('organizador · clasificación grupo A', llegaAPuntC);
    await pg.click('.grupos button:has-text("Grupo B")'); await pg.waitForFunction(() => document.querySelectorAll('table.clasi tbody tr').length === 2);
    await mira('organizador · clasificación grupo B');
    // y lo demás que se saca de la clasificación final: Resumen (podio y ficha), Parejas y Calendario
    const OD = `${base}/torneo.html?${D}&t=1-campeonato-de-ejemplo-de-parejas-2027-02-06`;
    await pg.goto(OD + '&ver=resumen'); await pg.waitForSelector('.podio-tarjeta'); await mira('organizador · resumen con el podio');
    await pg.fill('#quien', 'Vicent'); await pg.waitForSelector('#quien-res .ficha'); await mira('organizador · ficha con el puesto final y sin historial');
    await pg.goto(OD + '&ver=parejas'); await pg.waitForSelector('table.lista-parejas'); await mira('organizador · parejas');
    await pg.goto(OD + '&ver=folleto'); await pg.waitForSelector('.dia-unico'); await mira('organizador · calendario con la fecha del torneo');

    // campeonato publicado desde el PDF de Access: sin zona (la columna no se enseña), con nombres cortados por Access y el grupo B con 3 partidas
    await pg.goto(`${base}/torneo.html?${D}&t=torneo-de-ejemplo-villa-inventada-2027-03-12&ver=clasificacion`); await pg.waitForSelector('table.clasi');
    assert.deepStrictEqual(await pg.locator('table.clasi thead th').allInnerTexts(), ['Puesto', 'Nº', 'Pareja', 'P.G.', 'P.F.', 'P.C.', 'Dif.']);
    await pg.evaluate(() => { window.__sinZona = true; });
    await mira('pdf · clasificación grupo A', llegaAPuntC);
    await pg.click('.grupos button:has-text("Grupo B")'); await pg.waitForFunction(() => document.querySelectorAll('table.clasi tbody tr').length === 3);
    await mira('pdf · clasificación grupo B');
    await pg.evaluate(() => { window.__sinZona = false; });

    // mesa de control: listas de la web y de borradores (con nombres largos), cada panel de acción, el Excel con destino, un fallo a mitad y un borrador
    const api = await instalar(ctx);
    await recordarWeb(ctx);
    api.ponerCifrado('datos/indice.json', JSON.stringify({ version: '1.0', publicado: '2026-01-01T00:00:00Z', torneos: [] }));
    sembrar(api, 'web', 'sp-ejemplo', { normativa: true }); sembrar(api, 'web', 'nombres-largos');
    sembrar(api, 'borr', 'parejas-ejemplo-2026-11-14'); sembrar(api, 'borr', 'individual-ejemplo-2026-11-14');
    const XLSXW = require('../assets/xlsx.mini.min.js');
    const NL = 'Ranking_FVD_2026-27_con_un_nombre_muy_largo_que_no_cabe_en_una_pantalla_de_telefono_copia_final.xlsx';
    api.poner('prog', 'entregables/DESCARGAS.md', ['# Descargas', '', '## Programas de campeonato', '', '| Archivo | Qué es | Fecha |', '|---|---|---|',
      `| \`del_arbitro/programas-de-campeonato/${NL}\` | Una descripción bastante larga para comprobar que en una pantalla de 320 píxeles no se corta ni se esconde nada, ni siquiera con palabras larguísimas como ${'x'.repeat(60)}. | 2026-11-22 |`, '',
      '## Ranking FVD', '', '| Archivo | Qué es | Fecha |', '|---|---|---|', '| `ranking/leer_torneo.html` | Página que se abre con doble clic. | 2026-11-22 |', '',
      '## Mantenimiento', '', '| Archivo | Qué es | Fecha |', '|---|---|---|', '| `web/hacer_capturas_mesa.cjs` | Programa que hace las capturas de la mesa de control para el manual. Solo lo usa quien mantiene la web. | 2026-11-22 |', ''].join('\n'));
    api.poner('prog', `entregables/del_arbitro/programas-de-campeonato/${NL}`, Buffer.from('x')); api.poner('prog', 'entregables/ranking/leer_torneo.html', '<html></html>'); api.poner('prog', 'entregables/web/hacer_capturas_mesa.cjs', 'x');
    await pg.goto(`${base}/publicar.html`);
    await pg.waitForSelector('#lista-web', { state: 'attached' });
    await mira('mesa · sin token');
    await pg.fill('#token', TOKEN); await pg.click('text=Guardar y comprobar'); await pg.waitForSelector('text=Hay un token guardado');
    await pg.waitForSelector('#lista-web[data-listo]', { state: 'attached' }); await pg.waitForSelector('#lista-borr[data-listo]', { state: 'attached' });
    await mira('mesa · listas plegadas');
    {
      const t = await pg.$$eval('#plegable-web > summary, #plegable-borr > summary', (l) => l.map((x) => ({ t: x.textContent.trim(), ok: x.scrollWidth <= x.clientWidth + 1 && x.getBoundingClientRect().height >= 40 && x.getBoundingClientRect().right <= document.documentElement.clientWidth })));
      if (t.length !== 2 || t.some((x) => !/^(En la web|Borradores) \(\d+\)$/.test(x.t) || !x.ok)) throw new Error('mesa · listas plegadas: los títulos no se leen enteros o son pequeños para el dedo: ' + JSON.stringify(t));
    }
    await pg.evaluate(() => document.querySelectorAll('#plegable-web, #plegable-borr').forEach((d) => { d.open = true; }));
    await mira('mesa · listas');
    await pg.click('#archivos-ver'); await pg.waitForSelector('#archivos-lista li.archivo');
    await mira('mesa · archivos');
    {
      const f = await pg.$$eval('#archivos-lista li.archivo .archivo-fecha', (l) => l.map((x) => ({ t: x.textContent, ok: x.getBoundingClientRect().width > 0 && x.scrollWidth <= x.clientWidth + 1 && x.getBoundingClientRect().right <= document.documentElement.clientWidth })));
      if (!f.length || f.some((x) => !/^Actualizado: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(x.t) || !x.ok)) throw new Error('mesa · archivos: la fecha no se lee entera: ' + JSON.stringify(f));
    }
    await pg.click('#archivos-lista summary:has-text("Mantenimiento")'); await mira('mesa · archivos con Mantenimiento abierta');
    await pg.click('#archivos-lista summary:has-text("Ranking FVD")'); await mira('mesa · archivos con una categoría cerrada');
    await pg.setInputFiles('#archivo', { name: NL, mimeType: 'application/octet-stream', buffer: Buffer.from('y') });     // un archivo de ningún tipo conocido, con un nombre larguísimo
    await pg.waitForSelector('#subir-cat');
    await mira('mesa · subir archivo: no reconocido, sin sugerencia');
    await pg.fill('#subir-desc', 'Una frase que explica qué es el archivo que se va a subir a programas-domino'); await pg.selectOption('#subir-cat', 'Programas de campeonato');
    await pg.waitForSelector('#subir-pisar', { state: 'visible' }); await pg.check('#subir-pisar');
    await mira('mesa · subir archivo: categoría, descripción y sustituir');
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
    await pg.setInputFiles('#archivo', resumenOrg); await pg.waitForSelector('#copiar-bloque');
    await mira('publicar · Hoja de resumen: clasificación y botón del bloque');
    // con el Excel del ranking en entregables/: dudas de doble licencia y la frase de confirmar
    api.poner('prog', 'entregables/ranking/Ranking_FVD_2026-27.xlsx', Buffer.from(XLSXW.write({ SheetNames: ['Jugadores', 'Licencias'], Sheets: {
      Jugadores: XLSXW.utils.aoa_to_sheet([[], ['Código', 'Nombre', '1er apellido', '2º apellido', 'Licencia vigente'], ['J1', 'Joan', 'Ferrer', 'Pla con un segundo apellido bastante largo', '7001'], ['J2', 'Joan', 'Ferrer', 'Roca', '7002'], ['J3', 'Vicent', 'Vila', 'Pons', '925']]),
      Licencias: XLSXW.utils.aoa_to_sheet([[], ['Licencia', 'Código de jugador', 'Asociación', 'Año desde', 'Año hasta'], [7001, 'J1', 'Asociación de ejemplo', 2026, null], [7002, 'J2', 'Asociación de ejemplo', 2026, null], [925, 'J3', 'Asociación de ejemplo', 2020, null]]) } }, { type: 'buffer', bookType: 'xlsx' })));
    await pg.setInputFiles('#archivo', resumenOrg); await pg.waitForSelector('.pend');
    await mira('publicar · Hoja de resumen: dudas de licencia con el Excel del ranking');
    await pg.selectOption('.pend select >> nth=0', { index: 1 });
    await mira('publicar · Hoja de resumen: una duda resuelta');
    await pg.click('button:has-text("No federado") >> nth=0'); await pg.waitForSelector('#copiar-bloque');
    await pg.click('#revision summary'); await pg.waitForSelector('#bloque-ranking');
    await mira('publicar · Hoja de resumen: bloque del ranking abierto');
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
