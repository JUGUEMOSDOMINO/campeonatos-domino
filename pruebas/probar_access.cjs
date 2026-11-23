// Prueba de la exportación a Excel del informe de clasificación de Access (assets/clasifaccess.js) y de su validación (assets/resumen.js).
// Todo con archivos INVENTADOS del mismo formato: una hoja «PX_05_Clasificacion_Exportar», cabecera en la fila 1, la fecha como número de Excel,
// licencias «46/0921» (vacía u otra provincia = no federado) y filas ya ordenadas por clasificación dentro de cada grupo.
// Los valores esperados están escritos a mano. Uso: node pruebas/probar_access.cjs
const assert = require('assert');
const XLSX = require('../assets/xlsx.mini.min.js');
const R = require('../assets/resumen.js');
const A = require('../assets/clasifaccess.js');

let fallos = 0, hechos = 0;
const ok = (nombre, fn) => { try { fn(); hechos++; console.log('  ok  ' + nombre); } catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n       ' + String(e.message).split('\n').slice(0, 8).join('\n       ')); } };

const CAB = ['DET_TORNEO', 'TOR_NOMBRE', 'TOR_LOGO1', 'TOR_LOGO2', 'DET_GRUPO', 'SumaDeDET_GANADAS', 'SumaDeDET_PERDIDAS', 'SumaDeDET_DIFERENCIA', 'SumaDeDET_PUNTOSF',
  'SumaDeDET_PUNTOSC', 'PrimeroDeDET_ALEATORIO', 'DET_PAREJA', 'JUGADORES.JUG_LICENCIA', 'PT_JUGADOR1', 'JUGADORES_1.JUG_LICENCIA', 'PT_JUGADOR2'];
const SERIE = 46307;                                   // 12/10/2026 como número de Excel (1/1/2026 = 46023; el 12/10 es el día 285)
// fila: [grupo, ganadas, perdidas, dif, pf, pc, nº, lic1, nombre1, lic2, nombre2]
const f = (g, gan, per, dif, pf, pc, n, l1, n1, l2, n2) => [SERIE, 'Torneo de Ejemplo - Villa Inventada', 'EJE', null, g, gan, per, dif, pf, pc, 1712289161, n, l1, n1, l2, n2];
const A1 = f('A', 6, 1, 1500, 2100, 600, 5, '46/0921', 'Ana Roig Mas', '46/0922', 'Pau Vidal Soler');
const A2 = f('A', 5, 2, -2100, 1994, 4094, 3, '46/0923', 'Marta Puig', '', 'Toni Serra Vila');
const A3 = f('A', 4, 3, 12, 1200, 1188, 7, '02/xxxx', 'Rosa Mas Gil', '46/0925', 'Vicent Vila Pons');
const B1 = f('B', 3, 0, 480, 900, 420, 12, '46/0926', 'Nuria Pons', '46/0927', 'Albert Mora');
const B2 = f('B', 2, 1, -5, 700, 705, 14, null, 'Elena Roca', '30/xxxx', 'Hugo Sanz Vila');
const RELLENO = f('A', 0, 7, -2100, 0, 2100, 43, '46/xxxx', 'XXX XXX', '46/xxxx', 'ZZZ ZZZ');
const libro = (filas, cab = CAB) => { const ws = XLSX.utils.aoa_to_sheet([cab, ...filas]); return { SheetNames: ['PX_05_Clasificacion_Exportar'], Sheets: { PX_05_Clasificacion_Exportar: ws } }; };
const leer = (filas, cab) => A.leer(libro(filas, cab), XLSX);
const con = (filas, pub) => { const r = leer(filas); return { r, v: R.validar(r, pub || {}) }; };
const cods = (v) => v.map((x) => x.cod + ':' + x.gravedad);
const msgs = (v, cod) => v.filter((x) => x.cod === cod).map((x) => x.msg).join(' | ');
const base = [A1, A2, A3, B1, B2];

console.log('Leer');
ok('se reconoce por el nombre de la hoja', () => {
  assert.strictEqual(A.es(libro(base)), true);
  assert.strictEqual(A.es({ SheetNames: ['Campeonato', 'Grupo A', 'Grupo B', 'Sustituciones'], Sheets: {} }), false);
});
ok('datos: nombre, fecha (de número de Excel a aaaa-mm-dd) y partidas deducidas de ganadas + perdidas del grupo A', () => {
  assert.deepStrictEqual(leer(base).datos, { nombre: 'Torneo de Ejemplo - Villa Inventada', fecha: '2026-10-12', lugar: null, organizador: null, partidas: 7 });
});
ok('una fila por pareja; el puesto es el orden de la fila dentro de su grupo', () => {
  const r = leer(base);
  assert.deepStrictEqual(r.grupos.A.map((x) => [x.puesto, x.num]), [[1, 5], [2, 3], [3, 7]]);
  assert.deepStrictEqual(r.grupos.B.map((x) => [x.puesto, x.num]), [[1, 12], [2, 14]]);
  const a2 = r.grupos.A[1];
  assert.deepStrictEqual([a2.pareja, a2.pg, a2.pp, a2.dif, a2.pf, a2.pc, a2.zona], ['Marta Puig - Toni Serra Vila', 5, 2, -2100, 1994, 4094, null]);
});
ok('busca las columnas por su nombre, no por su posición (otro orden y columnas de más)', () => {
  const orden = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const r = leer(base.map((x) => orden.map((i) => x[i])), orden.map((i) => CAB[i]).concat([]));
  assert.deepStrictEqual(r.estructura, []);
  assert.deepStrictEqual(r.grupos.A.map((x) => x.num), [5, 3, 7]); assert.strictEqual(r.datos.fecha, '2026-10-12');
  const extra = leer(base.map((x) => [...x, 'sobra']), [...CAB, 'OTRA_COLUMNA']);
  assert.deepStrictEqual(extra.estructura, []); assert.strictEqual(extra.grupos.A.length, 3);
});
ok('si falta una columna, lo dice por su nombre y R01 bloquea', () => {
  const sin = CAB.filter((c) => c !== 'SumaDeDET_PUNTOSC');
  const r = leer(base.map((x) => x.filter((_, i) => CAB[i] !== 'SumaDeDET_PUNTOSC')), sin);
  assert.ok(r.estructura.some((e) => e.includes('SumaDeDET_PUNTOSC')));
  const v = R.validar(r, {});
  assert.ok(cods(v).includes('R01:bloquea')); assert.ok(msgs(v, 'R01').includes('SumaDeDET_PUNTOSC'));
});
ok('la pareja de relleno «XXX XXX - ZZZ ZZZ» CUENTA: es una pareja más, la última del grupo A (aunque el archivo la ponga antes o en el B), sin licencias', () => {
  const r = leer([A1, RELLENO, A2, A3, B1, B2]);
  assert.strictEqual(r.rellenos, 1); assert.deepStrictEqual(r.grupos.A.map((x) => x.puesto), [1, 2, 3, 4]);
  const x = r.grupos.A[3];
  assert.deepStrictEqual([x.ficticia, x.pareja, x.lic1, x.lic2, x.num], [true, 'XXX XXX - ZZZ ZZZ', 'NO', 'NO', 43]);
  assert.deepStrictEqual(r.grupos.B.map((y) => y.puesto), [1, 2]); assert.deepStrictEqual(r.lineasMalas, []);
  const enB = leer([A1, A2, A3, B1, f('B', 0, 3, -900, 0, 900, 43, '46/xxxx', 'XXX XXX', '46/xxxx', 'ZZZ ZZZ'), B2]);
  assert.deepStrictEqual([enB.grupos.A.length, enB.grupos.B.length], [4, 2]);       // nunca pasa al B
});
ok('licencias: «46/0921» es la 921; vacía u otra provincia es NO (no federado); la original se conserva para avisar', () => {
  const r = leer(base);
  assert.deepStrictEqual([r.grupos.A[0].lic1, r.grupos.A[0].lic2], [921, 922]);
  assert.deepStrictEqual([r.grupos.A[1].lic1, r.grupos.A[1].lic2], [923, 'NO']);       // la segunda, vacía
  assert.deepStrictEqual([r.grupos.A[2].lic1, r.grupos.A[2].lic2], ['NO', 925]);       // la primera, de otra provincia (02/)
  assert.deepStrictEqual([r.grupos.B[1].lic1, r.grupos.B[1].lic2], ['NO', 'NO']);      // celda sin nada y «30/»
  assert.deepStrictEqual(r.grupos.A[2].licOrig, ['02/xxxx', '46/0925']);
  assert.deepStrictEqual(leer([f('A', 7, 0, 1, 2, 1, 1, '46/ 0921', 'Ana Roig', ' 46/0922 ', 'Pau Vidal')]).grupos.A[0].lic1, 921);
});
ok('nombres: sin espacios de sobra, con las dos personas de la pareja', () => {
  const r = leer([f('A', 7, 0, 1, 2, 1, 1, '46/0921', ' Ana  Roig ', '46/0922', 'Pau Vidal')]);
  assert.strictEqual(r.grupos.A[0].pareja, 'Ana Roig - Pau Vidal'); assert.deepStrictEqual(r.grupos.A[0].nombres, ['Ana Roig', 'Pau Vidal']);
});

console.log('Validar');
ok('archivo correcto: solo avisos informativos (partidas deducidas y B con 3 partidas); nada bloquea', () => {
  const { v } = con(base);
  assert.deepStrictEqual(cods(v), ['P05:avisa', 'P03:avisa']);
  assert.ok(/7/.test(msgs(v, 'P05')) && /grupo B/.test(msgs(v, 'P03')) && /3/.test(msgs(v, 'P03')));
});
ok('P.G. + P.P. distinto de las partidas en el grupo A: R06 bloquea y dice la pareja', () => {
  const { v } = con([A1, f('A', 5, 1, -2100, 1994, 4094, 3, '46/0923', 'Marta Puig', '', 'Toni Serra Vila'), A3, B1]);
  assert.ok(cods(v).includes('R06:bloquea')); assert.ok(/pareja 3/.test(msgs(v, 'R06')));
});
ok('Dif. distinta de P.F. − P.C.: R06 bloquea', () => {
  const { v } = con([A1, f('A', 5, 2, -2000, 1994, 4094, 3, '46/0923', 'Marta Puig', '', 'Toni Serra Vila'), A3]);
  assert.ok(/Dif\./.test(msgs(v, 'R06')));
});
ok('en el grupo B, una pareja con otro número de partidas que las demás: R06 bloquea', () => {
  const { v } = con([A1, B1, f('B', 2, 1, -5, 700, 705, 15, '46/0940', 'Irene Roca', '46/0941', 'Hugo Sanz'), f('B', 2, 2, -5, 700, 705, 14, null, 'Elena Roca', null, 'Hugo Sanz Vila')]);
  assert.ok(cods(v).includes('R06:bloquea')); assert.ok(/pareja 14/.test(msgs(v, 'R06')));
});
ok('un grupo que no viene ordenado por ganadas (el puesto sale del orden de la fila): P06 avisa', () => {
  const { v } = con([A2, A1, A3]);
  assert.ok(cods(v).includes('P06:avisa')); assert.ok(/grupo A/.test(msgs(v, 'P06')));
});
ok('número de pareja repetido: R05 bloquea. Licencia repetida en el torneo: R08 bloquea', () => {
  assert.ok(/Nº 5/.test(msgs(con([A1, f('A', 5, 2, 1, 2, 1, 5, '46/0930', 'Lola Soler', '46/0931', 'Joan Ferrer')]).v, 'R05')));
  assert.ok(cods(con([A1, f('A', 5, 2, 1, 2, 1, 9, '46/0921', 'Lola Soler', '46/0931', 'Joan Ferrer')]).v).includes('R08:bloquea'));
});
ok('una cifra que no es número, una fecha distinta o un grupo que no es A ni B: P01 bloquea y dice la fila (nunca se descarta)', () => {
  const mal1 = [A1, f('A', 'cinco', 2, -2100, 1994, 4094, 3, '46/0923', 'Marta Puig', '', 'Toni Serra Vila')];
  const mal2 = [A1, [SERIE + 1, ...A2.slice(1)]];
  const mal3 = [A1, f('C', 5, 2, 1, 2, 1, 3, '46/0923', 'Marta Puig', '', 'Toni Serra Vila')];
  for (const m of [mal1, mal2, mal3]) { const { v } = con(m); assert.ok(cods(v).includes('P01:bloquea'), cods(v).join()); assert.ok(/fila 3/.test(msgs(v, 'P01')), msgs(v, 'P01')); }
});
ok('licencia mal escrita («46/09») o sin nombre de jugador: bloquea sin descartar', () => {
  assert.ok(cods(con([A1, f('A', 5, 2, 1, 2, 1, 3, '46/09x1', 'Marta Puig', '', 'Toni Serra Vila')]).v).includes('P01:bloquea'));
  assert.ok(cods(con([A1, f('A', 5, 2, 1, 2, 1, 3, '46/0923', '', '', 'Toni Serra Vila')]).v).includes('P01:bloquea'));
});
ok('sin pareja en el grupo A: R03 bloquea', () => assert.ok(cods(con([B1]).v).includes('R03:bloquea')));
ok('no avisa de nombres largos cortados (eso es del PDF) ni pide lugar y organizador', () => {
  const { v } = con(base);
  assert.deepStrictEqual(v.filter((x) => ['P04', 'R02'].includes(x.cod)), []);
});

console.log('JSON de la web');
ok('parejas, terminado, solo Clasificación, sin zona ni licencias; B con puesto propio', () => {
  const j = R.construir(leer(base), null);
  assert.strictEqual(j.torneo.tipo, 'parejas'); assert.strictEqual(j.torneo.estado, 'terminado'); assert.strictEqual(j.torneo.n_jornadas, 7);
  assert.strictEqual(j.torneo.fecha, '2026-10-12'); assert.strictEqual(j.torneo.hay_b, true); assert.strictEqual(j.torneo.n_participantes, 5);
  assert.deepStrictEqual(j.participantes.map((p) => p.zona), [null, null, null, null, null]);
  assert.ok(!/licencia|lic1|lic2|0921|921/i.test(JSON.stringify(j)));
  assert.deepStrictEqual(j.clasificacion.filter((c) => c.grupo === 'B').map((c) => [c.puesto, c.id, c.dt]), [[1, 12, 480], [2, 14, -5]]);
});

console.log('Excel de verdad');
ok('un .xlsx escrito y vuelto a leer (fecha como número, celdas vacías, texto) da lo mismo', () => {
  const wb = libro(base);
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const r = A.leer(XLSX.read(bytes, { type: 'buffer' }), XLSX);
  assert.deepStrictEqual(r.estructura, []); assert.strictEqual(r.datos.fecha, '2026-10-12');
  assert.deepStrictEqual(r.grupos.A.map((x) => x.lic1), [921, 923, 'NO']);
  assert.deepStrictEqual(R.validar(r, {}).map((x) => x.cod), ['P05', 'P03']);
});

console.log(`\n${hechos} bien, ${fallos} mal`);
process.exit(fallos ? 1 : 0);
