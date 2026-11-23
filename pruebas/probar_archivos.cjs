// Prueba de la parte sin navegador de la sección «Archivos» (assets/archivos.js): leer entregables/DESCARGAS.md, añadir o sustituir la línea de un archivo
// subido, validar nombre y descripción; y de las rutas que mesa.js deja tocar en programas-domino. Todo inventado.
// Uso: node pruebas/probar_archivos.cjs
const assert = require('assert');
const Ar = require('../assets/archivos.js');
const M = require('../assets/mesa.js');

let fallos = 0, hechos = 0;
const ok = async (nombre, fn) => { try { await fn(); hechos++; console.log('  ok  ' + nombre); } catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n       ' + String(e.message).split('\n').slice(0, 6).join('\n       ')); } };

const MD = `# Descargas

Texto de la regla, con una barra | dentro de la explicación que no es una fila.

## Ranking FVD

| Archivo | Qué es | Fecha |
|---|---|---|
| \`ranking/leer_torneo.html\` | Página que se abre con doble clic. | 2026-11-22 |

## Programas de campeonato

| Archivo | Qué es | Fecha |
|---|---|---|
| \`sp/24_SP_sin_macros.xlsx\` | El programa del 24º Súper Prestigio. | 2026-11-15 |

## Mantenimiento

| Archivo | Qué es | Fecha |
|---|---|---|
| \`web/capturas/\` | Capturas del manual. | 2026-11-22 |
| \`web/recortar.py\` | Programa que recorta las capturas. | 2026-11-16 |

## Torneos

| Archivo | Qué es | Fecha |
|---|---|---|
| \`del_arbitro/torneos/Lista de jugadores.xlsx\` | Lo que subió el árbitro. | 2026-11-23 |
`;
const lee = (md) => Ar.leerDescargas(md).map((f) => `${f.categoria} | ${f.ruta}`);

(async () => {
  console.log('Categorías');
  await ok('la lista cerrada, en orden, con Mantenimiento la última y sin poder subirse', () => {
    assert.deepStrictEqual(Ar.CATEGORIAS, ['Programas de campeonato', 'Ranking FVD', 'Rankings publicados', 'Torneos', 'Manuales y guías', 'Otros', 'Mantenimiento']);
    assert.deepStrictEqual(Ar.CATEGORIAS_SUBIR, Ar.CATEGORIAS.slice(0, 6));
  });
  await ok('la carpeta de cada categoría: sin tildes, en minúsculas y con guiones', () => {
    assert.deepStrictEqual(Ar.CATEGORIAS.map(Ar.carpetaDe), ['programas-de-campeonato', 'ranking-fvd', 'rankings-publicados', 'torneos', 'manuales-y-guias', 'otros', 'mantenimiento']);
  });

  console.log('DESCARGAS.md');
  await ok('lee una fila por archivo con su categoría (la sección en la que está); ignora cabecera, separador, texto suelto y carpetas', () => {
    assert.deepStrictEqual(Ar.leerDescargas(MD), [
      { ruta: 'ranking/leer_torneo.html', descripcion: 'Página que se abre con doble clic.', fecha: '2026-11-22', categoria: 'Ranking FVD' },
      { ruta: 'sp/24_SP_sin_macros.xlsx', descripcion: 'El programa del 24º Súper Prestigio.', fecha: '2026-11-15', categoria: 'Programas de campeonato' },
      { ruta: 'web/recortar.py', descripcion: 'Programa que recorta las capturas.', fecha: '2026-11-16', categoria: 'Mantenimiento' },
      { ruta: 'del_arbitro/torneos/Lista de jugadores.xlsx', descripcion: 'Lo que subió el árbitro.', fecha: '2026-11-23', categoria: 'Torneos' }]);
  });
  await ok('una fila fuera de toda sección, o bajo un título que no es una categoría, cuenta como «Otros»', () => {
    const md = '# Descargas\n\n| Archivo | Qué es | Fecha |\n|---|---|---|\n| `a.txt` | Suelta. | 2026-11-01 |\n\n## Cosas raras\n\n| `b.txt` | Bajo otro título. | 2026-11-02 |\n';
    assert.deepStrictEqual(lee(md), ['Otros | a.txt', 'Otros | b.txt']);
  });
  await ok('un archivo vacío o sin tabla da una lista vacía', () => { assert.deepStrictEqual(Ar.leerDescargas(''), []); assert.deepStrictEqual(Ar.leerDescargas('# Descargas\n\nnada'), []); });

  await ok('añade la línea al principio de su categoría (lo más reciente arriba), sin tocar el resto', () => {
    const n = Ar.conLinea(MD, 'del_arbitro/torneos/Otro.pdf', 'Un PDF del árbitro.', '2026-11-24', 'Torneos');
    assert.deepStrictEqual(lee(n).filter((x) => x.startsWith('Torneos')), ['Torneos | del_arbitro/torneos/Otro.pdf', 'Torneos | del_arbitro/torneos/Lista de jugadores.xlsx']);
    assert.strictEqual(lee(n).length, 5);
    assert.strictEqual(n.replace(/\| `del_arbitro\/torneos\/Otro\.pdf`.*\n/, ''), MD);
  });
  await ok('si la categoría aún no tiene sección, la crea en su sitio del orden (sin mover las demás)', () => {
    const n = Ar.conLinea(MD, 'del_arbitro/otros/Nota.txt', 'Una nota.', '2026-11-24', 'Otros');
    const t = [...n.matchAll(/^## (.*)$/gm)].map((m) => m[1]);
    assert.deepStrictEqual(t, ['Ranking FVD', 'Programas de campeonato', 'Otros', 'Mantenimiento', 'Torneos']);
    assert.ok(/## Otros\n\n\| Archivo \| Qué es \| Fecha \|\n\|---\|---\|---\|\n\| `del_arbitro\/otros\/Nota\.txt` \| Una nota\. \| 2026-11-24 \|\n/.test(n), n);
  });
  await ok('la sección nueva va antes de la primera categoría posterior que ya exista, o al final si no hay', () => {
    const base = '# Descargas\n\n## Mantenimiento\n\n| Archivo | Qué es | Fecha |\n|---|---|---|\n| `x.py` | Script. | 2026-11-01 |\n';
    const t = (md) => [...md.matchAll(/^## (.*)$/gm)].map((m) => m[1]);
    assert.deepStrictEqual(t(Ar.conLinea(base, 'a/b.xlsx', 'Frase.', '2026-11-24', 'Torneos')), ['Torneos', 'Mantenimiento']);
    assert.deepStrictEqual(t(Ar.conLinea(base, 'a/c.xlsx', 'Frase.', '2026-11-24', 'Programas de campeonato')), ['Programas de campeonato', 'Mantenimiento']);
    assert.deepStrictEqual(t(Ar.conLinea('# Descargas\n\n## Torneos\n\n| Archivo | Qué es | Fecha |\n|---|---|---|\n| `t.xlsx` | T. | 2026-11-01 |\n', 'm.pdf', 'Frase.', '2026-11-24', 'Manuales y guías')), ['Torneos', 'Manuales y guías']);
  });
  await ok('si el archivo ya tenía línea, la sustituye (no se duplica), también si cambia de categoría', () => {
    const n = Ar.conLinea(MD, 'del_arbitro/torneos/Lista de jugadores.xlsx', 'Versión nueva.', '2026-11-25', 'Torneos');
    assert.deepStrictEqual(Ar.leerDescargas(n).filter((x) => x.ruta.endsWith('Lista de jugadores.xlsx')), [{ ruta: 'del_arbitro/torneos/Lista de jugadores.xlsx', descripcion: 'Versión nueva.', fecha: '2026-11-25', categoria: 'Torneos' }]);
    assert.strictEqual(Ar.leerDescargas(n).length, 4);
    const m = Ar.conLinea(MD, 'sp/24_SP_sin_macros.xlsx', 'Ahora es un torneo.', '2026-11-25', 'Torneos');
    assert.deepStrictEqual(lee(m).filter((x) => x.includes('24_SP')), ['Torneos | sp/24_SP_sin_macros.xlsx']);
    assert.strictEqual(Ar.leerDescargas(m).length, 4);
  });
  await ok('sin archivo DESCARGAS.md crea el documento entero, con la sección de la categoría', () => {
    const n = Ar.conLinea(null, 'del_arbitro/otros/A.xlsx', 'Frase.', '2026-11-24', 'Otros');
    assert.deepStrictEqual(Ar.leerDescargas(n), [{ ruta: 'del_arbitro/otros/A.xlsx', descripcion: 'Frase.', fecha: '2026-11-24', categoria: 'Otros' }]);
    assert.ok(n.startsWith('# Descargas') && n.includes('## Otros'));
  });
  await ok('un DESCARGAS.md de tabla única (el de antes) sigue funcionando: sus filas son «Otros» y la nueva va en su sección', () => {
    const viejo = '# Descargas\n\n| Archivo | Qué es | Fecha |\n|---|---|---|\n| `a.xlsx` | Antigua. | 2026-11-15 |\n';
    const n = Ar.conLinea(viejo, 'del_arbitro/torneos/T.xlsx', 'Nueva.', '2026-11-24', 'Torneos');
    assert.deepStrictEqual(lee(n), ['Otros | a.xlsx', 'Torneos | del_arbitro/torneos/T.xlsx']);
  });
  await ok('una categoría que no está en la lista no se escribe: la línea va a «Otros»', () => {
    assert.deepStrictEqual(lee(Ar.conLinea(null, 'x.txt', 'Frase.', '2026-11-24', 'Inventada')), ['Otros | x.txt']);
  });
  await ok('la descripción no puede romper la tabla: sin barras verticales ni saltos de línea', () => {
    const n = Ar.conLinea(MD, 'del_arbitro/otros/B.xlsx', 'Una | otra\ncosa  con   espacios', '2026-11-24', 'Otros');
    assert.strictEqual(Ar.leerDescargas(n).find((x) => x.ruta === 'del_arbitro/otros/B.xlsx').descripcion, 'Una / otra cosa con espacios');
  });

  console.log('Agrupar para el panel');
  await ok('por categoría en su orden, solo las que tienen archivos, y dentro lo más reciente primero (a igual fecha, como en el documento)', () => {
    const filas = [
      { ruta: 'a', descripcion: 'x', fecha: '2026-11-15', categoria: 'Torneos' }, { ruta: 'b', descripcion: 'x', fecha: '2026-11-23', categoria: 'Torneos' },
      { ruta: 'c', descripcion: 'x', fecha: '2026-11-23', categoria: 'Torneos' }, { ruta: 'd', descripcion: 'x', fecha: '2026-11-01', categoria: 'Mantenimiento' },
      { ruta: 'e', descripcion: 'x', fecha: '2026-11-02', categoria: 'Programas de campeonato' }];
    assert.deepStrictEqual(Ar.agrupar(filas).map((g) => [g.categoria, g.filas.map((f) => f.ruta).join('')]), [['Programas de campeonato', 'e'], ['Torneos', 'bca'], ['Mantenimiento', 'd']]);
    assert.deepStrictEqual(Ar.agrupar([]), []);
  });

  console.log('Fecha al segundo en hora de Madrid');
  await ok('fechaHora: invierno (+1) y verano (+2), con el cambio de hora y medianoche', () => {
    assert.strictEqual(Ar.fechaHora('2026-11-23T14:05:09Z'), '23/11/2026 15:05:09');
    assert.strictEqual(Ar.fechaHora('2026-07-15T21:59:59Z'), '15/07/2026 23:59:59');
    assert.strictEqual(Ar.fechaHora('2026-03-29T00:59:59Z'), '29/03/2026 01:59:59');   // último segundo antes del cambio
    assert.strictEqual(Ar.fechaHora('2026-03-29T01:00:00Z'), '29/03/2026 03:00:00');   // se salta la hora 02
    assert.strictEqual(Ar.fechaHora('2026-10-25T00:30:00Z'), '25/10/2026 02:30:00');   // aún verano
    assert.strictEqual(Ar.fechaHora('2026-10-25T01:30:00Z'), '25/10/2026 02:30:00');   // ya invierno: la hora 02 se repite
    assert.strictEqual(Ar.fechaHora('2026-12-31T23:00:00Z'), '01/01/2027 00:00:00');   // medianoche: hh nunca es 24
    assert.strictEqual(Ar.fechaHora('2026-11-23T14:05:09.000+00:00'), '23/11/2026 15:05:09');
  });
  await ok('fechaHora: lo que no es una fecha da texto vacío', () => { for (const x of ['', null, undefined, 'ayer', '2026-13-45T00:00:00Z', '2026-11-23']) assert.strictEqual(Ar.fechaHora(x), '', String(x)); });
  await ok('agrupar: con la fecha del commit ordena por ella al segundo (no por la columna de DESCARGAS.md); sin ella, por esa columna', () => {
    const f = (ruta, fecha, commit) => ({ ruta, descripcion: 'x', fecha, categoria: 'Ranking FVD', commit });
    const g = Ar.agrupar([f('a/R.xlsx', '2026-11-30', '2026-11-23T08:09:05Z'), f('b/R.xlsx', '2026-01-01', '2026-11-23T08:09:07Z'), f('c', '2026-11-25', null), f('d', '2026-11-01', null)]);
    assert.deepStrictEqual(g[0].filas.map((x) => x.ruta), ['c', 'b/R.xlsx', 'a/R.xlsx', 'd']);
  });

  console.log('Copia de leer_pdf.js');
  await ok('assets/leerpdf.js es idéntico a tools/ranking/leer_pdf.js de programas-domino (si está al lado): si uno cambia, hay que copiarlo al otro', () => {
    const fs = require('fs'), path = require('path');
    const otro = path.join(__dirname, '..', '..', 'programas-domino', 'tools', 'ranking', 'leer_pdf.js');
    if (!fs.existsSync(otro)) { console.log('       (no está ../programas-domino: no se compara)'); return; }
    assert.ok(fs.readFileSync(path.join(__dirname, '..', 'assets', 'leerpdf.js')).equals(fs.readFileSync(otro)), 'assets/leerpdf.js y programas-domino/tools/ranking/leer_pdf.js ya no son idénticos');
  });

  console.log('Nombre y descripción');
  await ok('el nombre del archivo: sin rutas, sin puntos delante, sin caracteres raros', () => {
    for (const bien of ['Lista.xlsx', 'Ranking FVD 2026-27 (copia).xlsx', 'Año nuevo ñ.pdf']) assert.strictEqual(Ar.nombreValido(bien), true, bien);
    for (const mal of ['', '.oculto', '..', 'a/b.xlsx', 'a\\b.xlsx', 'a?b', 'a#b', '100%.xlsx', 'a:b', 'x'.repeat(101), 'DESCARGAS.md '.trim() + '/']) assert.strictEqual(Ar.nombreValido(mal), false, mal);
  });
  await ok('la descripción es obligatoria (no vale solo espacios) y tiene un máximo', () => {
    assert.strictEqual(Ar.descripcionValida('  '), false); assert.strictEqual(Ar.descripcionValida('x'.repeat(201)), false); assert.strictEqual(Ar.descripcionValida('Lista de jugadores de 2026'), true);
  });
  await ok('la fecha de la línea es la de hoy en Madrid, aaaa-mm-dd', () => {
    assert.strictEqual(Ar.fechaHoy(new Date('2026-11-23T23:30:00Z')), '2026-11-24');   // en Madrid ya es el día 24
    assert.strictEqual(Ar.fechaHoy(new Date('2026-07-01T10:00:00Z')), '2026-07-01');
  });

  console.log('Qué deja tocar mesa.js en programas-domino');
  const prueba = async (clave, ruta, metodo) => { try { await M.llamar(clave, ruta, { method: metodo || 'GET' }); return 'pasó'; } catch (e) { return e.message; } };
  M.token.usar('ghp_PRUEBA');
  const global_fetch = global.fetch; let llamadas = [];
  global.fetch = async (u, o) => { llamadas.push([String(u), (o && o.method) || 'GET']); return { ok: true, status: 200, json: async () => ({}) }; };
  await ok('leer: entregables y lo que cuelga de él (y el árbol del repositorio); nada fuera de entregables', async () => {
    for (const r of ['/contents/entregables', '/contents/entregables/DESCARGAS.md?ref=main', '/contents/entregables/ranking/leer_torneo.html', '/contents/entregables/del_arbitro/Lista%20de%20jugadores.xlsx', '/git/trees/main?recursive=1', '/git/blobs/' + 'a'.repeat(40), ''])
      assert.strictEqual(await prueba('prog', r), 'pasó', r);
    llamadas = [];
    for (const r of ['/contents/src/normativa_SP_2026-27.pdf', '/contents/ranking/fuentes/access/Cullera.xlsx', '/contents/entregables/../src/x', '/contents/entregables/%2e%2e/src', '/contents/entregables%2Fdel_arbitro/x', '/contents/entregables/a%5Cb', '/git/trees/main', '/git/trees/otra?recursive=1', '/contents/entregables/./x'])
      assert.ok(/no permitida/i.test(await prueba('prog', r)), r);
    assert.deepStrictEqual(llamadas, []);
  });
  await ok('escribir: solo entregables/del_arbitro/<categoría>/<archivo> y entregables/DESCARGAS.md, y solo con PUT', async () => {
    for (const c of Ar.CATEGORIAS_SUBIR) assert.strictEqual(await prueba('prog', `/contents/entregables/del_arbitro/${Ar.carpetaDe(c)}/Lista.xlsx`, 'PUT'), 'pasó', c);
    for (const r of ['/contents/entregables/del_arbitro/torneos/Lista%20de%20jugadores.xlsx', '/contents/entregables/DESCARGAS.md']) assert.strictEqual(await prueba('prog', r, 'PUT'), 'pasó', r);
    for (const r of ['/contents/entregables/ranking/leer_torneo.html', '/contents/entregables/web/Manual.pdf', '/contents/entregables/del_arbitro', '/contents/entregables/del_arbitro/Lista.xlsx', '/contents/entregables/del_arbitro/sub/x.xlsx',
      '/contents/entregables/del_arbitro/mantenimiento/x.py', '/contents/entregables/del_arbitro/Torneos/x.xlsx', '/contents/entregables/del_arbitro/torneos/sub/x.xlsx', '/contents/entregables/del_arbitro/torneos/..', '/contents/entregables/del_arbitro/torneos', '/contents/entregables/del_arbitro/torneos%2Fx.xlsx', '/contents/entregables/DESCARGAS.md/x', '/contents/entregables/del_arbitro/..', '/contents/CLAUDE.md', '/contents/entregables/.gitkeep'])
      assert.ok(/solo se escribe|no permitida/i.test(await prueba('prog', r, 'PUT')), r);
    for (const r of ['/contents/entregables/del_arbitro/torneos/Lista.xlsx', '/contents/entregables/DESCARGAS.md']) assert.ok(/solo se escribe|no permitida/i.test(await prueba('prog', r, 'DELETE')), 'DELETE ' + r);
    assert.ok(/no permitida/i.test(await prueba('prog', '', 'PUT')));
  });
  await ok('fechasEntregables: una sola petición POST a /graphql, rutas como variables, solo rutas de entregables/, y un fallo no lanza', async () => {
    llamadas = []; const cuerpos = [];
    global.fetch = async (u, o) => { llamadas.push([String(u), (o && o.method) || 'GET']); cuerpos.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ data: { repository: { ref: { target: { f0: { nodes: [{ committedDate: '2026-11-23T08:09:05Z' }] }, f1: { nodes: [] } } } } } }) }; };
    const r = await M.fechasEntregables(['ranking/a.xlsx', 'x/b.xlsx', '../src/secreto.xlsx', 'a%2Fb', 'ranking/a.xlsx']);
    assert.deepStrictEqual(llamadas, [['https://api.github.com/graphql', 'POST']]);
    assert.deepStrictEqual(cuerpos[0].variables, { p0: 'entregables/ranking/a.xlsx', p1: 'entregables/x/b.xlsx' });
    assert.ok(!/entregables\//.test(cuerpos[0].query));
    assert.deepStrictEqual([...r], [['ranking/a.xlsx', '2026-11-23T08:09:05Z']]);
    const muchas = Array.from({ length: 120 }, (_, i) => `d/${i}.xlsx`); llamadas = [];
    await M.fechasEntregables(muchas);
    assert.strictEqual(llamadas.length, 3); // 50 + 50 + 20
    global.fetch = async () => ({ ok: false, status: 502, json: async () => ({}) });
    assert.deepStrictEqual([...await M.fechasEntregables(['a/b'])], []);
    global.fetch = async () => { throw new Error('sin red'); };
    assert.deepStrictEqual([...await M.fechasEntregables(['a/b'])], []);
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await assert.rejects(M.fechasEntregables(['a/b']), (e) => e.estado === 401);
    M.token.usar('ghp_PRUEBA');
    global.fetch = async (u, o) => { llamadas.push([String(u), (o && o.method) || 'GET']); return { ok: true, status: 200, json: async () => ({}) }; };
  });
  await ok('GraphQL no se abre a nada más: ni en los demás repositorios ni con GET ni con otra consulta cualquiera', async () => {
    llamadas = [];
    for (const [c, m] of [['web', 'POST'], ['borr', 'POST'], ['prog', 'GET'], ['prog', 'PUT']]) assert.ok(/no permitida/i.test(await prueba(c, '@graphql', m)), c + m);
    assert.deepStrictEqual(llamadas, []);
  });
  await ok('el token solo va a api.github.com y a /repos/JUGUEMOSDOMINO/programas-domino', async () => {
    llamadas = [];
    await prueba('prog', '/contents/entregables/DESCARGAS.md?ref=main');
    assert.deepStrictEqual(llamadas, [['https://api.github.com/repos/JUGUEMOSDOMINO/programas-domino/contents/entregables/DESCARGAS.md?ref=main', 'GET']]);
  });
  await ok('las reglas de campeonatos-domino y borradores no han cambiado', async () => {
    assert.ok(/no permitida/i.test(await prueba('web', '/contents/README.md', 'PUT')));
    assert.ok(/no permitida/i.test(await prueba('web', '/contents/entregables/DESCARGAS.md', 'PUT')));
    assert.strictEqual(await prueba('web', '/contents/datos/indice.json'), 'pasó');
  });
  global.fetch = global_fetch;

  console.log(`\n${hechos} bien, ${fallos} mal`);
  process.exit(fallos ? 1 : 0);
})();
