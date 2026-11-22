// Prueba de la Hoja de resumen de los organizadores (assets/resumen.js): lee un .xlsx con la forma de esa hoja (hacer_xlsx_organizador.py,
// datos inventados) con SheetJS, como hará publicar.html, y comprueba la lectura, cada validación, el JSON de parejas con solo
// Clasificación (sin licencias) y el bloque que se pega en el ranking. Los valores esperados están escritos a mano aquí.
// Uso: node pruebas/probar_organizador.cjs
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const XLSX = require('../assets/xlsx.mini.min.js');
const C = require('../assets/contrato.js');
const R = require('../assets/resumen.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'organizador-'));
let fallos = 0, hechos = 0;
const ok = (nombre, fn) => { try { fn(); hechos++; console.log('  ok  ' + nombre); } catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n       ' + String(e.message).split('\n').slice(0, 8).join('\n       ')); } };

function libro(extra = []) {
  const f = path.join(tmp, 'o' + Math.random().toString(36).slice(2) + '.xlsx');
  execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_organizador.py'), f, ...extra]);
  return XLSX.read(fs.readFileSync(f), { type: 'buffer' });
}
const poner = (wb, hoja, ref, v) => { wb.Sheets[hoja][ref] = v === null ? undefined : { t: typeof v === 'number' ? 'n' : 's', v }; if (v === null) delete wb.Sheets[hoja][ref]; };
const con = (cambiar, pub, extra) => { const wb = libro(extra); cambiar(wb); const l = R.leer(wb); return { l, v: R.validar(l, pub || {}) }; };
const cods = (v) => v.map((x) => x.cod + ':' + x.gravedad);
const msgs = (v, cod) => v.filter((x) => x.cod === cod).map((x) => x.msg).join(' | ');

console.log('Reconocer y leer');
const base = libro();
ok('la reconoce por sus hojas y no confunde con un Excel de los programas', () => {
  assert.strictEqual(R.es(base), true);
  assert.strictEqual(R.es({ SheetNames: ['INICIO', 'WEB', 'PAREJAS'], Sheets: {} }), false);
  assert.strictEqual(R.es({ SheetNames: ['Campeonato', 'Grupo A', 'Grupo B', 'Sustituciones', 'WEB'], Sheets: {} }), false);
});
const L = R.leer(base);
ok('datos del campeonato (la fecha sale como texto aaaa-mm-dd)', () => assert.deepStrictEqual(L.datos,
  { nombre: '1º CAMPEONATO DE EJEMPLO DE PAREJAS', fecha: '2027-02-06', lugar: 'Sala de ejemplo', organizador: 'Asociación de ejemplo', partidas: 7 }));
ok('lee 4 parejas del A, 2 del B y 3 sustituciones; la fila de ejemplo no cuenta', () => {
  assert.strictEqual(L.grupos.A.length, 4); assert.strictEqual(L.grupos.B.length, 2); assert.strictEqual(L.sust.length, 3);
  assert.deepStrictEqual(L.estructura, []);
});
ok('sin bloqueos ni avisos', () => assert.deepStrictEqual(R.validar(L, {}), []));
ok('sin grupo B también vale', () => { const l = R.leer(libro(['--sin-b'])); assert.strictEqual(l.grupos.B.length, 0); assert.deepStrictEqual(R.validar(l, {}), []); });

console.log('JSON para la web (parejas, solo Clasificación)');
const J = R.construir(L, '2027-02-06T20:00:00Z');
const esperado = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', '1-campeonato-de-ejemplo-de-parejas-2027-02-06', 'actual.json'), 'utf8'));
ok('es el JSON de referencia', () => { const { jornadas, ...e } = esperado; assert.deepStrictEqual(J, { ...e, publicado: '2027-02-06T20:00:00Z' }); });
ok('el identificador sale del nombre y la fecha', () => assert.strictEqual(J.torneo.id, '1-campeonato-de-ejemplo-de-parejas-2027-02-06'));
ok('parejas, terminado, sin mesas y sin Calendario propio', () => {
  assert.strictEqual(J.torneo.tipo, 'parejas'); assert.strictEqual(J.torneo.estado, 'terminado');
  assert.deepStrictEqual(J.emparejamientos, []); assert.deepStrictEqual(J.sustituciones, []);
  assert.strictEqual(J.jornada.numero, 7); assert.strictEqual(J.jornada.completa, true);
});
ok('nombre compuesto: «Rosa María Mas» es nombre «Rosa María» y apellido «Mas»', () => {
  const p = J.participantes.find((x) => x.id === 3);
  assert.deepStrictEqual([p.j1_nombre, p.j1_apellido1, p.corto], ['Rosa María', 'Mas', 'Mas-Ferrer']);
});
ok('la pareja retirada sale como retirada desde la partida 6', () => { const p = J.participantes.find((x) => x.id === 5); assert.deepStrictEqual([p.ret, p.ret_desde], [true, 6]); });
ok('el grupo B empieza en 1 y la clasificación va A y luego B', () => assert.deepStrictEqual(J.clasificacion.map((f) => f.grupo + f.puesto + ':' + f.id), ['A1:7', 'A2:3', 'A3:12', 'A4:5', 'B1:9', 'B2:14']));
ok('ni una licencia ni un número de teléfono en el JSON', () => {
  const s = C.aTexto(J);
  assert(!/licencia|46\s*\/|9001|9013|F201/.test(s), 'se ve una licencia');
  assert(!/"(jug)":\s*7/.test(s), 'jug no se conoce y no se inventa');
});
ok('el índice de la web lo apunta con su ganador', () => {
  const i = C.indiceNuevo(null, J).torneos[0];
  assert.deepStrictEqual([i.tipo, i.estado, i.n_participantes, i.n_jornadas, i.ganador], ['parejas', 'terminado', 6, 7, { id: 7, corto: 'Soler-Serra' }]);
});

console.log('Bloque para el ranking');
const B = R.bloque(L);
const T = (...x) => x.join('\t');
ok('una fila por pareja (A y luego B) y una más por cada sustituto extra, con las 12 columnas', () => assert.deepStrictEqual(B.tsv.split('\n'), [
  T('A', 1, 9001, 'Lola Soler', '46/ 9002', 'Toni Serra', '', '', '', '', '', ''),
  T('A', 2, 9003, 'Rosa María Mas', 'NO', 'Joan Ferrer', '', '', '', '', '', ''),
  T('A', 3, 9005, 'Marta Puig', 9006, 'Xavi Bosch', '', 9007, 'Elena Sala', 2, 3, 'E'),
  T('A', 4, 9008, 'Nuria Pons', 9009, 'Pep Ribes', 6, '', '', '', '', 10),
  T('B', 1, 'F201', 'Vicent Vila', 9010, 'Carla Camps', '', '', '', '', '', ''),
  T('B', 2, 9011, 'Quique Torres', 9012, 'Alba Llorca', '', 9013, 'Iker Climent', 1, 2, 10),
  T('B', 2, '', '', '', '', '', 9014, 'Sara Gil', 1, 1, 10),
]));
ok('cuenta las parejas y avisa de los jugadores sin licencia de la FVD', () => {
  assert.strictEqual(B.parejas, 6);
  assert(B.avisos.some((a) => /2 jugadores sin licencia/.test(a)), B.avisos.join(' / '));
});

console.log('Validaciones');
const A = 'Grupo A', G = 'Grupo B', S = 'Sustituciones';
ok('R01 no es la hoja de resumen', () => assert.deepStrictEqual(cods(con((w) => poner(w, A, 'C4', 'Otra cosa')).v).filter((c) => c.startsWith('R01')), ['R01:bloquea']));
ok('R02 faltan o no valen los datos del campeonato', () => {
  assert(/nombre/.test(msgs(con((w) => poner(w, 'Campeonato', 'B4', null)).v, 'R02')));
  assert(/fecha/i.test(msgs(con((w) => poner(w, 'Campeonato', 'B5', 'ayer')).v, 'R02')));
  assert(/partidas/i.test(msgs(con((w) => poner(w, 'Campeonato', 'B8', 20)).v, 'R02')));
});
ok('R03 sin ninguna pareja en el grupo A', () => { const w = libro(); for (let r = 6; r <= 9; r++) for (const c of 'ABCDEFGHIJKL') delete w.Sheets[A][c + r]; assert(cods(R.validar(R.leer(w), {})).includes('R03:bloquea')); });
ok('R04 fila incompleta o pareja sin « - »', () => {
  assert(/Grupo A, fila 7/.test(msgs(con((w) => poner(w, A, 'F7', null)).v, 'R04')));
  assert(/Grupo A, fila 8/.test(msgs(con((w) => poner(w, A, 'C8', 'Marta Puig y Xavi Bosch')).v, 'R04')));
});
ok('R05 puesto repetido, hueco, número de pareja repetido o fuera de 1 a 200', () => {
  assert.strictEqual(cods(con((w) => poner(w, A, 'A7', 1)).v).filter((c) => c.startsWith('R05')).length, 1);
  assert(cods(con((w) => poner(w, A, 'A9', 6)).v).includes('R05:bloquea'));
  assert(cods(con((w) => poner(w, G, 'B6', 7)).v).includes('R05:bloquea')); // el 7 ya está en el A
  assert(cods(con((w) => poner(w, A, 'B6', 201)).v).includes('R05:bloquea'));
});
ok('R06 las cuentas no cuadran: Dif., P.G. mayor que las partidas, tantos negativos', () => {
  assert(/Grupo A, fila 6/.test(msgs(con((w) => poner(w, A, 'H6', 801)).v, 'R06')));
  assert(/P\.G\./.test(msgs(con((w) => poner(w, A, 'E7', 8)).v, 'R06')));
  assert(cods(con((w) => poner(w, A, 'F8', -5)).v).includes('R06:bloquea'));
});
ok('R07 licencia con forma rara, R08 licencia repetida, aviso si falta', () => {
  assert(/Grupo A, fila 6/.test(msgs(con((w) => poner(w, A, 'I6', 'XYZ')).v, 'R07')));
  assert(cods(con((w) => poner(w, A, 'I6', 12345)).v).includes('R07:bloquea'));
  assert(/9002/.test(msgs(con((w) => poner(w, A, 'I7', 9002)).v, 'R08')));
  assert(cods(con((w) => poner(w, A, 'I7', '46/ 9001')).v).includes('R08:bloquea')); // 9001 y «46/ 9001» son la misma
  assert(cods(con((w) => poner(w, A, 'J6', null)).v).includes('R07:avisa'));
});
ok('R09 nombres con cifras o con arroba, o algo que parece un teléfono', () => {
  assert(cods(con((w) => poner(w, A, 'C6', 'Lola 3 Soler - Toni Serra')).v).includes('R09:bloquea'));
  assert(cods(con((w) => poner(w, S, 'C6', 'ana@correo')).v).includes('R09:bloquea'));
  assert(cods(con((w) => poner(w, 'Campeonato', 'B6', 'Sala, llamar al 612 345 678')).v).includes('R09:bloquea'));
});
ok('R10 retirada fuera de 1 a las partidas, o caso que no es 10 ni 9', () => {
  assert(/Grupo A, fila 9/.test(msgs(con((w) => poner(w, A, 'K9', 9)).v, 'R10')));
  assert(cods(con((w) => poner(w, A, 'L9', 'X')).v).includes('R10:bloquea'));
  assert(cods(con((w) => poner(w, A, 'L6', 10)).v).includes('R10:bloquea')); // caso sin retirada
});
ok('R11 sustituciones: pareja que no existe, datos incompletos, partidas, a quién y caso', () => {
  assert(/pareja 99/.test(msgs(con((w) => poner(w, S, 'B6', 99)).v, 'R11')));
  assert(cods(con((w) => poner(w, S, 'D6', null)).v).includes('R07:avisa'));
  assert(/fila 6/.test(msgs(con((w) => poner(w, S, 'F6', null)).v, 'R11')));
  assert(cods(con((w) => poner(w, S, 'F6', 7)).v).includes('R11:bloquea'));
  assert(cods(con((w) => poner(w, S, 'E6', 3)).v).includes('R11:bloquea'));
  assert(cods(con((w) => poner(w, S, 'G6', 'Z')).v).includes('R11:bloquea'));
  assert(cods(con((w) => poner(w, S, 'A6', 'B')).v).includes('R11:bloquea')); // la pareja 12 no está en el B
});
ok('R12 el identificador no puede llevar el nombre ni el apellido de nadie', () => assert(/«soler»/.test(msgs(con((w) => poner(w, 'Campeonato', 'B4', 'Trofeo Soler')).v, 'R12'))));
ok('R13 ya hay un campeonato con ese identificador: otro tipo bloquea, el mismo pide confirmar', () => {
  const id = J.torneo.id;
  assert(cods(con(() => {}, { indice: { torneos: [{ id, nombre: 'X', tipo: 'sp' }] } }).v).includes('R13:bloquea'));
  assert(cods(con(() => {}, { indice: { torneos: [{ id, nombre: 'X', tipo: 'parejas' }] } }).v).includes('R13:confirma'));
});
ok('R05 más de 200 parejas entre los dos grupos', () => {
  const w = libro(); const ws = w.Sheets[A];
  for (let r = 10; r <= 205; r++) { ws['A' + r] = { t: 'n', v: r - 5 }; ws['B' + r] = { t: 'n', v: 100 + r }; ws['C' + r] = { t: 's', v: 'Ana Roig - Pau Vidal' }; ws['E' + r] = { t: 'n', v: 0 }; ws['F' + r] = { t: 'n', v: 0 }; ws['G' + r] = { t: 'n', v: 0 }; ws['H' + r] = { t: 'n', v: 0 }; }
  const v = R.validar(R.leer(w), {});
  assert(v.some((x) => x.gravedad === 'bloquea'));
});
ok('una celda con error o un texto larguísimo bloquean', () => {
  assert(cods(con((w) => { w.Sheets[A].D6 = { t: 'e', v: 42, w: '#N/A' }; }).v).includes('R01:bloquea'));
  assert(cods(con((w) => poner(w, A, 'D6', 'x'.repeat(301))).v).includes('R09:bloquea'));
});

console.log(`\n${hechos} pruebas bien, ${fallos} con fallo`);
process.exit(fallos ? 1 : 0);
