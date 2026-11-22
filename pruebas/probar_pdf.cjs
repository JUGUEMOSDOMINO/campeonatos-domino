// Prueba de la lectura del PDF «Clasificación Partida N» de Access (assets/clasifpdf.js) y de su validación (assets/resumen.js).
// Todo con datos INVENTADOS. Los PDF los hace pruebas/hacer_pdf.py con la forma del original: cada celda es un texto suelto, los miles
// llevan punto, la diferencia puede ser negativa, un grupo puede seguir en otra página y hay filas de relleno «XXX XXX - ZZZ ZZZ».
// Los valores esperados están escritos a mano. Uso: node pruebas/probar_pdf.cjs
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const R = require('../assets/resumen.js');
const P = require('../assets/clasifpdf.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clasifpdf-'));
let fallos = 0, hechos = 0;
const pruebas = [];
const ok = (nombre, fn) => pruebas.push([nombre, fn]);

// ---------- texto de una fila, como lo deja la lectura por líneas ----------
const miles = (n) => String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const num = (n) => (n < 0 ? '-' : '') + miles(n);
const fila = (pos, n, pareja, g, p, dif, pf, pc) => `${pos} ${n} ${pareja} ${g} ${p} ${num(dif)} ${num(pf)} ${num(pc)}`;
const cab = (partidas = 7) => ['Campeonato de Ejemplo - Villa Inventada', '12/03/2027', `Clasificación Partida: ${partidas} PDF`, 'Posición Pareja Ganadas Perdidas Dif. Puntos P. Favor P. Contra'];
const L = (textos) => textos.map((t, i) => ({ t, pag: 1, n: i + 1 }));

// grupo A de 3 parejas (7 partidas) y grupo B de 2 (3 partidas)
const A1 = fila(1, 5, 'Ana Roig Mas - Pau Vidal Soler', 6, 1, 1500, 2100, 600);
const A2 = fila(2, 3, 'Marta Puig - Toni Serra Vila', 5, 2, -2100, 1994, 4094);
const A3 = fila(3, 7, 'Rosa Mas Gil - Vicent Vila Pons', 4, 3, 12, 1200, 1188);
const B1 = fila(1, 12, 'Nuria Pons - Albert Mora', 3, 0, 480, 900, 420);
const B2 = fila(2, 14, 'Elena Roca - Hugo Sanz Vila', 2, 1, -5, 700, 705);
const base = [...cab(), 'Grupo A', A1, A2, A3, 'Grupo B', B1, B2];
const leer = (textos) => P.interpretar(L(textos));
const con = (textos, pub) => { const r = leer(textos); return { r, v: R.validar(r, pub || {}) }; };
const cods = (v) => v.map((x) => x.cod + ':' + x.gravedad);
const msgs = (v, cod) => v.filter((x) => x.cod === cod).map((x) => x.msg).join(' | ');

console.log('Leer las líneas');
ok('cabecera: nombre, fecha en formato aaaa-mm-dd y partidas', () => {
  const r = leer(base);
  assert.deepStrictEqual(r.datos, { nombre: 'Campeonato de Ejemplo - Villa Inventada', fecha: '2027-03-12', lugar: null, organizador: null, partidas: 7 });
});
ok('una fila por pareja, con grupo, puesto, número, nombres y cifras (miles con punto, diferencia negativa)', () => {
  const r = leer(base);
  assert.strictEqual(r.grupos.A.length, 3); assert.strictEqual(r.grupos.B.length, 2);
  const a2 = r.grupos.A[1];
  assert.deepStrictEqual([a2.puesto, a2.num, a2.pareja, a2.pg, a2.pp, a2.dif, a2.pf, a2.pc], [2, 3, 'Marta Puig - Toni Serra Vila', 5, 2, -2100, 1994, 4094]);
  assert.deepStrictEqual([r.grupos.B[1].puesto, r.grupos.B[1].dif], [2, -5]);
  assert.strictEqual(a2.zona, null);
});
ok('un grupo partido entre dos páginas (la segunda repite cabecera y «Grupo A») sigue siendo un solo grupo', () => {
  const t = [...cab(), 'Grupo A', A1, A2, 'Posición Pareja Ganadas Perdidas Dif. Puntos P. Favor P. Contra', 'Grupo A', A3, 'Grupo B', B1, B2];
  const r = leer(t);
  assert.deepStrictEqual(r.grupos.A.map((x) => x.puesto), [1, 2, 3]);
  assert.deepStrictEqual(r.grupos.B.map((x) => x.puesto), [1, 2]);
  assert.deepStrictEqual(r.lineasMalas, []);
});
ok('la fila de relleno «XXX XXX - ZZZ ZZZ» se ignora y se cuenta', () => {
  const r = leer([...base.slice(0, 7), fila(4, 43, 'XXX XXX - ZZZ ZZZ', 0, 7, -2100, 0, 2100), ...base.slice(7)]);
  assert.strictEqual(r.grupos.A.length, 3); assert.strictEqual(r.rellenos, 1); assert.deepStrictEqual(r.lineasMalas, []);
});
ok('una línea que no es fila ni cabecera ni grupo no se descarta en silencio: queda en lineasMalas', () => {
  const r = leer([...base, 'Pareja sin cifras - Otra Cosa', '9 99 Fila Rota - Con Texto 4 3 sin diferencia 10 20']);
  assert.strictEqual(r.lineasMalas.length, 2);
  assert.strictEqual(r.lineasMalas[0].n, base.length + 1);
});
ok('una fila antes de cualquier «Grupo» o en un grupo que no es A ni B queda en lineasMalas', () => {
  assert.strictEqual(leer([...cab(), A1]).lineasMalas.length, 1);
  const r = leer([...base, 'Grupo C', fila(1, 20, 'Pepa Roca - Juan Mir', 7, 0, 1, 2, 1)]);
  assert.strictEqual(r.lineasMalas.length, 1); assert.ok(/grupo C/i.test(r.lineasMalas[0].motivo));
});

console.log('Validar');
ok('PDF correcto: sin bloqueos; solo el aviso de que el grupo B jugó 3 partidas', () => {
  const { v } = con(base);
  assert.deepStrictEqual(cods(v), ['P03:avisa']);
  assert.ok(/grupo B/.test(msgs(v, 'P03')) && /3/.test(msgs(v, 'P03')));
});
ok('no pide licencias ni lugar ni organizador (el PDF no los trae)', () => {
  const { v } = con(base);
  assert.deepStrictEqual(v.filter((x) => ['R07', 'R02'].includes(x.cod)), []);
});
ok('puestos que saltan (se ha quitado una fila): R05 bloquea y dice el grupo', () => {
  const { v } = con([...cab(), 'Grupo A', A1, A3]);
  assert.ok(cods(v).includes('R05:bloquea')); assert.ok(/grupo A/.test(msgs(v, 'R05')));
});
ok('P.G. + P.P. distinto de las partidas en el grupo A: R06 bloquea y dice qué pareja', () => {
  const { v } = con([...cab(), 'Grupo A', A1, fila(2, 3, 'Marta Puig - Toni Serra Vila', 5, 1, -2100, 1994, 4094)]);
  assert.ok(cods(v).includes('R06:bloquea')); assert.ok(/pareja 3/.test(msgs(v, 'R06')));
});
ok('Dif. distinta de P.F. − P.C.: R06 bloquea', () => {
  const { v } = con([...cab(), 'Grupo A', A1, fila(2, 3, 'Marta Puig - Toni Serra Vila', 5, 2, -2000, 1994, 4094)]);
  assert.ok(/Dif\./.test(msgs(v, 'R06')));
});
ok('en el grupo B, una pareja con otro número de partidas que las demás: R06 bloquea', () => {
  const { v } = con([...base.slice(0, 8), fila(2, 14, 'Elena Roca - Hugo Sanz Vila', 2, 2, -5, 700, 705)]);
  assert.ok(cods(v).includes('R06:bloquea')); assert.ok(/pareja 14/.test(msgs(v, 'R06')));
});
ok('más partidas en el grupo B que las del campeonato: R06 bloquea', () => {
  const { v } = con([...base.slice(0, 8), fila(1, 12, 'Nuria Pons - Albert Mora', 5, 3, 480, 900, 420), fila(2, 14, 'Elena Roca - Hugo Sanz Vila', 4, 4, -5, 700, 705)]);
  assert.ok(cods(v).includes('R06:bloquea'));
});
ok('sin «Clasificación Partida: N» o sin fecha: R02 bloquea', () => {
  assert.ok(cods(con(base.filter((t) => !/Partida/.test(t))).v).includes('R02:bloquea'));
  assert.ok(cods(con(base.filter((t) => t !== '12/03/2027')).v).includes('R02:bloquea'));
});
ok('líneas sin leer: P01 bloquea', () => {
  const { v } = con([...base, 'Fila Rota 1 2 3']);
  assert.ok(cods(v).includes('P01:bloquea'));
});
ok('un grupo A vacío: R03 bloquea', () => assert.ok(cods(con([...cab(), 'Grupo B', B1]).v).includes('R03:bloquea')));
ok('número de pareja repetido entre grupos: R05 bloquea', () => {
  const { v } = con([...base.slice(0, 7), fila(1, 5, 'Nuria Pons - Albert Mora', 3, 0, 480, 900, 420)]);
  assert.ok(/Nº 5/.test(msgs(v, 'R05')));
});
ok('un nombre con cifras o con arroba: R09 bloquea', () => {
  const { v } = con([...cab(), 'Grupo A', fila(1, 5, 'Ana Roig - Pau 666123456', 6, 1, 1500, 2100, 600)]);
  assert.ok(cods(v).includes('R09:bloquea'));
});
ok('«Venta del Moro» y un jugador que lleva «del» no dan R12 (es una partícula, no un nombre)', () => {
  const r = leer([...cab().map((t, i) => (i === 0 ? '5º Campeonato Popular - Venta del Moro' : t)), 'Grupo A', fila(1, 5, 'Berta del Prado Luna - Pau Vidal', 6, 1, 1500, 2100, 600)]);
  assert.ok(!cods(R.validar(r, {})).includes('R12:bloquea'));
});
ok('el nombre del campeonato con el apellido de un jugador sí da R12', () => {
  const r = leer([...cab().map((t, i) => (i === 0 ? 'Memorial Roig' : t)), 'Grupo A', A1]);
  assert.ok(cods(R.validar(r, {})).includes('R12:bloquea'));
});
ok('una pareja con nombre largo (50 letras o más) avisa de que Access pudo cortarlo (P04), sin bloquear', () => {
  const { v } = con([...cab(), 'Grupo A', fila(1, 5, 'Jose Antonio Cañizares Ibañez - Francisco Montalbán Ripoll', 6, 1, 1500, 2100, 600)]);
  assert.deepStrictEqual(cods(v), ['P04:avisa']); assert.ok(/Nº 5/.test(msgs(v, 'P04')));
});
ok('el relleno cuenta como aviso informativo (P02), no bloquea', () => {
  const { v } = con([...base.slice(0, 7), fila(4, 43, 'XXX XXX - ZZZ ZZZ', 0, 7, -2100, 0, 2100), ...base.slice(7)]);
  assert.ok(cods(v).includes('P02:avisa')); assert.ok(!v.some((x) => x.gravedad === 'bloquea'));
});

console.log('JSON de la web');
ok('parejas, terminado, solo Clasificación, sin Zona, sin licencias; B con puesto propio', () => {
  const r = leer(base), j = R.construir(r, null);
  assert.strictEqual(j.torneo.tipo, 'parejas'); assert.strictEqual(j.torneo.estado, 'terminado');
  assert.strictEqual(j.torneo.n_jornadas, 7); assert.strictEqual(j.jornada.numero, 7);
  assert.strictEqual(j.torneo.fecha, '2027-03-12'); assert.strictEqual(j.torneo.hay_b, true); assert.strictEqual(j.torneo.n_participantes, 5);
  assert.deepStrictEqual(j.participantes.map((p) => p.zona), [null, null, null, null, null]);
  assert.ok(!JSON.stringify(j).match(/licencia|lic1|lic2/i));
  const c = j.clasificacion.find((x) => x.grupo === 'A' && x.id === 3);
  assert.deepStrictEqual([c.puesto, c.gan, c.tf, c.tc, c.dt], [2, 5, 1994, 4094, -2100]);
  assert.deepStrictEqual(j.clasificacion.filter((x) => x.grupo === 'B').map((x) => x.puesto), [1, 2]);
});

console.log('PDF de verdad (generado con hacer_pdf.py y leído con pdf.js)');
const espec = (extra = {}) => ({
  titulo: 'Campeonato de Ejemplo - Villa Inventada', fecha: '12/03/2027', partidas: 7, filas_por_pagina: 4,
  grupos: {
    A: [[1, 5, 'Ana Roig Mas - Pau Vidal Soler', 6, 1, 1500, 2100, 600], [2, 3, 'Marta Puig - Toni Serra Vila', 5, 2, -2100, 1994, 4094],
      [3, 9, 'XXX XXX - ZZZ ZZZ', 0, 7, -2100, 0, 2100], [4, 7, 'Rosa Mas Gil - Vicent Vila Pons', 4, 3, 12, 1200, 1188],
      [5, 2, 'Lola Soler Ruiz - Joan Ferrer Bosch', 3, 4, -5, 900, 905]],
    B: [[1, 12, 'Nuria Pons - Albert Mora', 3, 0, 480, 900, 420], [2, 14, 'Elena Roca - Hugo Sanz Vila', 2, 1, -5, 700, 705]],
  }, ...extra,
});
const pdfjs = async () => {
  const m = await import('../assets/vendor/pdf.min.mjs');
  m.GlobalWorkerOptions.workerSrc = require('url').pathToFileURL(path.join(__dirname, '../assets/vendor/pdf.worker.min.mjs')).href;
  return m;
};
function pdf(e) {
  const j = path.join(tmp, 'e' + Math.random().toString(36).slice(2) + '.json'), f = j.replace('.json', '.pdf');
  fs.writeFileSync(j, JSON.stringify(e));
  execFileSync('python3', ['-I', path.join(__dirname, 'hacer_pdf.py'), j, f]);
  return new Uint8Array(fs.readFileSync(f));
}
ok('lee un PDF de dos páginas: grupo A partido, relleno, diferencia negativa con miles; sin líneas malas', async () => {
  const r = await P.leerPdf(pdf(espec()), await pdfjs());
  assert.deepStrictEqual(r.datos, { nombre: 'Campeonato de Ejemplo - Villa Inventada', fecha: '2027-03-12', lugar: null, organizador: null, partidas: 7 });
  assert.deepStrictEqual(r.lineasMalas, []);
  assert.strictEqual(r.rellenos, 1);
  assert.deepStrictEqual(r.grupos.A.map((x) => [x.puesto, x.num, x.pg, x.pp, x.dif, x.pf, x.pc]),
    [[1, 5, 6, 1, 1500, 2100, 600], [2, 3, 5, 2, -2100, 1994, 4094], [4, 7, 4, 3, 12, 1200, 1188], [5, 2, 3, 4, -5, 900, 905]]);
  assert.strictEqual(r.grupos.A[1].pareja, 'Marta Puig - Toni Serra Vila');
  assert.deepStrictEqual(r.grupos.B.map((x) => x.num), [12, 14]);
});
ok('el relleno en medio de la clasificación deja un salto de puestos y R05 lo dice (no se tapa)', async () => {
  const r = await P.leerPdf(pdf(espec()), await pdfjs());
  assert.ok(cods(R.validar(r, {})).includes('R05:bloquea'));
});
ok('con acentos y eñes (Moñino, Muñoz) los nombres salen enteros', async () => {
  const e = espec(); e.grupos = { A: [[1, 5, 'Ildefonso Moñino Valls - Anselmo Muñoz Vera', 7, 0, 100, 700, 600]] };
  const r = await P.leerPdf(pdf(e), await pdfjs());
  assert.strictEqual(r.grupos.A[0].pareja, 'Ildefonso Moñino Valls - Anselmo Muñoz Vera');
});
ok('un archivo que no es PDF da un error claro, no una excepción sin explicar', async () => {
  await assert.rejects(async () => P.leerPdf(new Uint8Array([1, 2, 3, 4]), await pdfjs()), /PDF/);
});

(async () => {
  for (const [nombre, fn] of pruebas) {
    try { await fn(); hechos++; console.log('  ok  ' + nombre); } catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n       ' + String(e.message).split('\n').slice(0, 8).join('\n       ')); }
  }
  console.log(`\n${hechos} bien, ${fallos} mal`);
  process.exit(fallos ? 1 : 0);
})();
