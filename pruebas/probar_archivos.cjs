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

| Archivo | Qué es | Fecha |
|---|---|---|
| \`ranking/leer_torneo.html\` | Página que se abre con doble clic. | 2026-11-22 |
| \`sp/24_SP_sin_macros.xlsx\` | El programa del 24º Súper Prestigio. | 2026-11-15 |
| \`web/capturas/\` | Capturas del manual. | 2026-11-22 |
| \`del_arbitro/Lista de jugadores.xlsx\` | Lo que subió el árbitro. | 2026-11-23 |
`;

(async () => {
  console.log('DESCARGAS.md');
  await ok('lee una fila por archivo: ruta, frase y fecha; ignora cabecera, separador, texto suelto y carpetas', () => {
    assert.deepStrictEqual(Ar.leerDescargas(MD), [
      { ruta: 'ranking/leer_torneo.html', descripcion: 'Página que se abre con doble clic.', fecha: '2026-11-22' },
      { ruta: 'sp/24_SP_sin_macros.xlsx', descripcion: 'El programa del 24º Súper Prestigio.', fecha: '2026-11-15' },
      { ruta: 'del_arbitro/Lista de jugadores.xlsx', descripcion: 'Lo que subió el árbitro.', fecha: '2026-11-23' }]);
  });
  await ok('un archivo vacío o sin tabla da una lista vacía', () => { assert.deepStrictEqual(Ar.leerDescargas(''), []); assert.deepStrictEqual(Ar.leerDescargas('# Descargas\n\nnada'), []); });
  await ok('añade la línea de un archivo nuevo al final de la tabla, sin tocar el resto', () => {
    const n = Ar.conLinea(MD, 'del_arbitro/Otro.pdf', 'Un PDF del árbitro.', '2026-11-24');
    assert.ok(n.startsWith(MD.trimEnd())); assert.ok(n.trimEnd().endsWith('| `del_arbitro/Otro.pdf` | Un PDF del árbitro. | 2026-11-24 |'));
    assert.strictEqual(Ar.leerDescargas(n).length, 4);
  });
  await ok('si el archivo ya tenía línea, la sustituye (no se duplica)', () => {
    const n = Ar.conLinea(MD, 'del_arbitro/Lista de jugadores.xlsx', 'Versión nueva.', '2026-11-25');
    const l = Ar.leerDescargas(n).filter((x) => x.ruta === 'del_arbitro/Lista de jugadores.xlsx');
    assert.deepStrictEqual(l, [{ ruta: 'del_arbitro/Lista de jugadores.xlsx', descripcion: 'Versión nueva.', fecha: '2026-11-25' }]);
    assert.strictEqual(Ar.leerDescargas(n).length, 3);
  });
  await ok('sin archivo DESCARGAS.md crea la tabla entera', () => {
    const n = Ar.conLinea(null, 'del_arbitro/A.xlsx', 'Frase.', '2026-11-24');
    assert.deepStrictEqual(Ar.leerDescargas(n), [{ ruta: 'del_arbitro/A.xlsx', descripcion: 'Frase.', fecha: '2026-11-24' }]);
  });
  await ok('la descripción no puede romper la tabla: sin barras verticales ni saltos de línea', () => {
    const n = Ar.conLinea(MD, 'del_arbitro/B.xlsx', 'Una | otra\ncosa  con   espacios', '2026-11-24');
    assert.strictEqual(Ar.leerDescargas(n).pop().descripcion, 'Una / otra cosa con espacios');
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
  await ok('escribir: solo entregables/del_arbitro/<archivo> y entregables/DESCARGAS.md, y solo con PUT', async () => {
    for (const r of ['/contents/entregables/del_arbitro/Lista.xlsx', '/contents/entregables/del_arbitro/Lista%20de%20jugadores.xlsx', '/contents/entregables/DESCARGAS.md']) assert.strictEqual(await prueba('prog', r, 'PUT'), 'pasó', r);
    for (const r of ['/contents/entregables/ranking/leer_torneo.html', '/contents/entregables/web/Manual.pdf', '/contents/entregables/del_arbitro', '/contents/entregables/del_arbitro/sub/x.xlsx', '/contents/entregables/DESCARGAS.md/x', '/contents/entregables/del_arbitro/..', '/contents/CLAUDE.md', '/contents/entregables/.gitkeep'])
      assert.ok(/solo se escribe|no permitida/i.test(await prueba('prog', r, 'PUT')), r);
    for (const r of ['/contents/entregables/del_arbitro/Lista.xlsx', '/contents/entregables/DESCARGAS.md']) assert.ok(/solo se escribe|no permitida/i.test(await prueba('prog', r, 'DELETE')), 'DELETE ' + r);
    assert.ok(/no permitida/i.test(await prueba('prog', '', 'PUT')));
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
