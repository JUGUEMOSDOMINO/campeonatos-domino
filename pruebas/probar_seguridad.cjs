// Cabeceras <meta> (CSP, referrer, robots, googlebot), robots.txt y que las páginas cargan sin violar la CSP.
// Uso: node pruebas/probar_seguridad.cjs [url-base, por defecto http://localhost:8765]
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { recordarPrueba } = require('./cripto_prueba.cjs');
const base = process.argv[2] || 'http://localhost:8765';
const raiz = path.join(__dirname, '..');
const PAGINAS = ['index.html', 'torneo.html', 'publicar.html'];
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'none'; form-action 'none'";
let ok = 0; const bien = (t) => { ok++; console.log('  ok  ' + t); };

(async () => {
  // --- estático ---
  for (const f of PAGINAS) {
    const h = fs.readFileSync(path.join(raiz, f), 'utf8');
    const meta = (n, v) => assert(new RegExp(`<meta ${n} content="${v}">`).test(h), `${f}: falta <meta ${n} content="${v}">`);
    meta('http-equiv="Content-Security-Policy"', CSP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    meta('name="referrer"', 'no-referrer');
    meta('name="robots"', 'noindex, nofollow');
    meta('name="googlebot"', 'noarchive, nosnippet');
    assert(!/frame-ancestors/.test(h), f + ': frame-ancestors no funciona en <meta>');
    assert(!/<style|\sstyle\s*=/i.test(h), f + ': estilo en línea');
    assert(!/<script(?![^>]*\ssrc=)/i.test(h), f + ': script en línea');
    assert(!/\son[a-z]+\s*=/i.test(h), f + ': atributo on*');
    assert(!/(src|href)="(?!https:\/\/)[a-z][a-z0-9+.-]*:(?!image)/i.test(h.replace(/href="data:image[^"]*"/g, '')), f + ': enlace con esquema raro');
  }
  bien('las 3 páginas: CSP exacta, referrer, robots noindex/nofollow, googlebot noarchive/nosnippet, sin estilos/scripts/on* en línea ni frame-ancestors');
  for (const f of ['assets/web.js', 'assets/publicar.js', 'assets/contrato.js', 'assets/mesa.js', 'assets/cifra.js', 'assets/palabras.js']) {
    const s = fs.readFileSync(path.join(raiz, f), 'utf8');
    assert(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(s), f + ': HTML o código dinámico');
    assert(!/setAttribute\(\s*['"]style|style:\s*['"]/.test(s), f + ': estilo en línea desde JS');
  }
  bien('JS: sin innerHTML, document.write, eval ni estilos en línea');
  // el token y la API de GitHub viven en un solo archivo
  for (const f of fs.readdirSync(path.join(raiz, 'assets')).filter((x) => x.endsWith('.js') && !x.startsWith('xlsx'))) {
    const s = fs.readFileSync(path.join(raiz, 'assets', f), 'utf8');
    if (f !== 'mesa.js') {
      assert(!/Authorization|api\.github\.com|tumesa\.token/.test(s), f + ': toca el token o la API de GitHub fuera de mesa.js');
      if (f !== 'cifra.js') assert(!/localStorage|sessionStorage/.test(s), f + ': guarda algo en el navegador fuera de mesa.js (token) y cifra.js (clave)');
      if (f !== 'web.js') assert(!/\bfetch\(/.test(s), f + ': usa fetch');
    }
  }
  // la clave solo se guarda con su nombre y nunca la contraseña
  const cifra = fs.readFileSync(path.join(raiz, 'assets/cifra.js'), 'utf8');
  assert(/ALMACEN = 'tumesa\.clave'/.test(cifra) && !/setItem\([^)]*contrasena/.test(cifra), 'cifra.js guarda solo la clave derivada');
  assert(/new TextEncoder\(\)\.encode\(contrasena\.normalize\('NFC'\)\), 'PBKDF2'/.test(cifra) && /ITERACIONES = 600000/.test(cifra) && /name: 'AES-GCM', length: 256/.test(cifra));
  bien('cifra.js: PBKDF2 con 600 000 iteraciones y AES-256-GCM, y solo guarda la clave derivada');
  const mesa = fs.readFileSync(path.join(raiz, 'assets/mesa.js'), 'utf8');
  assert.strictEqual((mesa.match(/https:\/\/api\.github\.com/g) || []).length, 1);
  assert.strictEqual((mesa.match(/\bfetch\(/g) || []).length, 1);
  bien('JS: el token y https://api.github.com solo aparecen en mesa.js, que tiene un único fetch');
  assert.strictEqual(fs.readFileSync(path.join(raiz, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
  bien('robots.txt: Disallow: /');

  // --- navegador ---
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  await recordarPrueba(ctx);
  const robots = await ctx.request.get(base + '/robots.txt');
  assert.strictEqual(robots.status(), 200);
  assert(/Disallow: \//.test(await robots.text()));
  bien('robots.txt se sirve');
  const casos = [['index.html', '#candado'], ['torneo.html?t=sp-2026-27', '#candado'], ['index.html?d=datos/_prueba', '#lista li'], ['torneo.html?t=sp-ejemplo&d=datos/_prueba', '#cab h1, #cab h2'],
    ['torneo.html?t=sp-ejemplo&ver=normativa&d=datos/_prueba', '.normativa button'], ['torneo.html?t=sp-ejemplo&ver=normativa&d=datos/_prueba', '.libro img'], ['publicar.html', '#token-estado p'], ['torneo.html?t=sp-2026-27&borrador=1', '#contenido .aviso']];
  for (const [url, esperado] of casos) {
    const pg = await ctx.newPage();
    const malos = []; const externas = [];
    pg.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && malos.push(m.text()));
    pg.on('pageerror', (e) => malos.push(e.message));
    pg.on('request', (r) => { const u = new URL(r.url()); if (!['data:', 'blob:'].includes(u.protocol) && u.origin !== new URL(base).origin) externas.push(r.url()); });
    await pg.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await pg.goto(`${base}/${url}`);
    await pg.waitForSelector(esperado, { timeout: 10000 });
    await pg.waitForTimeout(500);
    const csp = await pg.evaluate(() => window.__csp);
    assert.deepStrictEqual([csp, malos, externas], [[], [], []], url);
    assert.strictEqual(await pg.evaluate(() => document.querySelector('meta[name=robots]').content), 'noindex, nofollow');
    if (esperado === '.normativa button') { // la descarga de la normativa (blob) tampoco choca con la CSP
      const [d] = await Promise.all([pg.waitForEvent('download'), pg.click('.normativa button')]);
      assert(/\.pdf$/.test(d.suggestedFilename())); await pg.waitForTimeout(300);
      assert.deepStrictEqual(await pg.evaluate(() => window.__csp), [], 'descarga de la normativa');
    }
    bien(`${url}: carga sin violaciones de CSP, sin errores en consola y sin pedir nada fuera del sitio`);
    await pg.close();
  }
  // la CSP está activa de verdad: un estilo en línea y un script en línea tienen que bloquearse
  const pg = await ctx.newPage();
  await pg.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective)); });
  await pg.goto(base + '/index.html?d=datos/_prueba'); await pg.waitForSelector('#lista li');
  await pg.evaluate(() => { document.body.setAttribute('style', 'color:red'); const s = document.createElement('script'); s.textContent = 'window.__x = 1'; document.head.append(s); });
  const v = await pg.evaluate(() => [window.__csp.slice(), window.__x]);
  assert(v[0].some((d) => d.startsWith('style-src')) && v[0].some((d) => d.startsWith('script-src')) && v[1] === undefined, JSON.stringify(v));
  bien('la CSP bloquea de verdad un style y un script en línea');
  const h = await pg.evaluate(() => {
    const a = (u) => { const e = window.TuMesa.el('a', { href: u }, '<b>x</b>'); return [e.getAttribute('href'), e.getAttribute('rel'), e.children.length]; };
    return [a('javascript:alert(1)'), a('http://example.org'), a('//example.org'), a('data:text/html,x'), a('https://example.org/x'), a('torneo.html?t=a')];
  });
  assert.deepStrictEqual(h, [[null, null, 0], [null, null, 0], [null, null, 0], [null, null, 0], ['https://example.org/x', 'noopener noreferrer', 0], ['torneo.html?t=a', null, 0]]);
  bien('enlaces: solo https con rel="noopener noreferrer" (o relativos); javascript:, http:, data: y // se descartan; el texto no se interpreta como HTML');
  await b.close();
  console.log(`\n${ok} comprobaciones bien`);
})().catch((e) => { console.error('FALLA:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
