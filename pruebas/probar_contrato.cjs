// Prueba del contrato: crea un .xlsx con la hoja WEB a partir de los JSON de pruebas/datos (los de datos/_prueba, en claro),
// lo lee con SheetJS como hará publicar.html y comprueba que sale el mismo JSON.
// Uso: node pruebas/probar_contrato.cjs
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const XLSX = require('../assets/xlsx.mini.min.js');
const C = require('../assets/contrato.js');
const P = require('../assets/partidas.js');

const raiz = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tumesa-'));
const ids = ['sp-ejemplo', 'parejas-ejemplo-2026-11-14', 'individual-ejemplo-2026-11-14', 'sp-ejemplo-anterior'];
let fallos = 0, hechos = 0;
const ok = (nombre, fn) => { try { fn(); hechos++; console.log('  ok  ' + nombre); } catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n       ' + String(e.message).split('\n').slice(0, 6).join('\n       ')); } };

function hoja(id) {
  const xl = path.join(tmp, id + '.xlsx');
  execFileSync('python3', [path.join(__dirname, 'hacer_xlsx.py'), path.join(__dirname, 'datos', id, 'actual.json'), xl]);
  const wb = XLSX.read(fs.readFileSync(xl), { type: 'buffer', sheets: 'WEB' });
  return { wb, ws: wb.Sheets.WEB, xl };
}
const sinJornadas = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.jornadas; delete c.publicado; return c; };

console.log('Lectura y construcción (ida y vuelta con los JSON de prueba)');
for (const id of ids) {
  const { wb, ws } = hoja(id);
  ok(`${id}: solo se lee la hoja WEB`, () => assert.deepStrictEqual(Object.keys(wb.Sheets), ['WEB']));
  const r = C.leer(ws);
  const esperado = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', id, 'actual.json'), 'utf8'));
  ok(`${id}: JSON idéntico al de referencia`, () => assert.deepStrictEqual(sinJornadas(C.construir(r, 'x')), sinJornadas(esperado)));
  ok(`${id}: orden de claves y texto idénticos`, () => {
    const a = C.aTexto(C.construir(r, esperado.publicado));
    const { jornadas, ...resto } = esperado; // actual.json trae 'jornadas'; el de jornada_NN.json no
    assert.strictEqual(a, C.aTexto(resto));
  });
  ok(`${id}: sin bloqueos`, () => {
    const v = C.validar(r, C.construir(r, 'x'), { indice: null, actual: null });
    const bl = v.filter((x) => x.gravedad === 'bloquea');
    assert.deepStrictEqual(bl, []);
  });
  ok(`${id}: ni teléfonos ni licencias en el JSON`, () => {
    const s = C.aTexto(C.construir(r, 'x'));
    for (const malo of ['LIC-', '6' + '12' + '345' + '678', '6' + '98 11' + ' 22 33', 'Soriano ']) assert(!s.includes(malo), malo);
  });
}

console.log('Validaciones');
function con(id, cambiar, pub) {
  const { ws } = hoja(id);
  cambiar(ws);
  const r = C.leer(ws);
  return C.validar(r, C.construir(r, 'x'), pub || {});
}
const cod = (v, c) => v.filter((x) => x.cod === c).map((x) => x.gravedad);
const poner = (ws, ref, val, t) => { ws[ref] = { t: t || (typeof val === 'number' ? 'n' : 's'), v: val }; };
const SP = 'sp-ejemplo';
const celda = (clave) => 'B' + (4 + C.CLAVES_META.indexOf(clave));
ok('V02 versión distinta', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'A1', '2.0')), 'V02'), ['bloquea']));
ok('V02 versión como número', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'A1', 1)), 'V02'), ['bloquea']));
ok('V02b versión menor mayor', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'A1', '1.3')), 'V02b'), ['avisa']));
ok('V03 cabecera cambiada', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'Q3', 'idd')), 'V03'), ['bloquea']));
ok('V04 id no válido', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('id'), 'Sp Ejemplo')), 'V04'), ['bloquea']));
ok('V04 id usado por otro tipo', () => assert.deepStrictEqual(cod(con(SP, () => {}, { indice: { torneos: [{ id: 'sp-ejemplo', tipo: 'parejas', nombre: 'X' }] } }), 'V04'), ['bloquea']));
ok('V04b mismo id otro nombre', () => assert.deepStrictEqual(cod(con(SP, () => {}, { indice: { torneos: [{ id: 'sp-ejemplo', tipo: 'sp', nombre: 'OTRO' }] } }), 'V04b'), ['confirma']));
// V20: los nombres de archivo y carpeta de la web no delatan a nadie (el id va en la ruta datos/<id>/ y no se cifra)
ok('V20 id con un apellido de un participante', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('id'), 'final-escriva-2026')), 'V20'), ['bloquea']));
ok('V20 id con nombre y apellido', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('id'), 'pareja-pons-mas')), 'V20'), ['bloquea']));
ok('V20 un id normal no salta', () => assert.deepStrictEqual(cod(con(SP, () => {}), 'V20'), []));
ok('V20 una sílaba suelta no salta (mas en «master»)', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('id'), 'master-2026')), 'V20'), []));
ok('V05 celda con error', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'Z9', '#N/A', 'e')), 'V05'), ['bloquea']));
ok('V05 ¿LICENCIA?', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'G5', '¿LICENCIA?')), 'V05'), ['bloquea']));
ok('V19 texto de más de 300 caracteres', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('lugar'), 'x'.repeat(301))), 'V19'), ['bloquea']));
ok('V06 teléfono en la zona', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'J5', '6' + '12 345' + ' 678')), 'V06'), ['bloquea']));
ok('V06 cifra en un nombre', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'E5', 'Nuria2')), 'V06'), ['bloquea']));
ok('V06 teléfono en el lugar', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('lugar'), 'Llamar al ' + '6' + '12' + '345' + '678')), 'V06'), ['bloquea']));
ok('V06 número con decimales', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'W4', 1450.5)), 'V06'), ['bloquea']));
ok('V06 número de 6 cifras', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'W4', 123456)), 'V06'), ['bloquea']));
ok('V07 pareja que no sale en mesas', () => assert.deepStrictEqual(cod(con(SP, (w) => { delete w['AH4']; }), 'V07'), ['bloquea']));
ok('V07 mesa repetida', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'AD5', 1)), 'V07'), ['bloquea']));
ok('V07 puesto salteado', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'P6', 9)), 'V07'), ['bloquea']));
ok('V07 n_participantes', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('n_participantes'), 7)), 'V07'), ['bloquea']));
ok('V07 grupo B sin hay_b', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'K5', 'B')), 'V07'), ['bloquea']));
ok('V07b mesa individual con 1+1', () => assert.deepStrictEqual(cod(con('individual-ejemplo-2026-11-14', (w) => { delete w['AG4']; }), 'V07b'), ['bloquea']));
ok('V07b individual: mesa con ausencia y un asiento vacío (2+1) vale', () => assert.deepStrictEqual(cod(con('individual-ejemplo-2026-11-14', (w) => { poner(w, 'AJ5', 'ausencia'); delete w['AI5']; }), 'V07b'), []));
ok('V07b individual: jugada con un asiento vacío bloquea', () => assert.deepStrictEqual(cod(con('individual-ejemplo-2026-11-14', (w) => { poner(w, 'AJ4', 'jugada'); delete w['AI4']; }), 'V07b'), ['bloquea']));
ok('V07b parejas: no_cuenta 1+0 (retirada que descansaba) vale', () => assert.deepStrictEqual(cod(con('parejas-ejemplo-2026-11-14', (w) => { poner(w, 'AJ5', 'no_cuenta'); delete w['AH5']; }), 'V07b'), []));
ok('V08 dt no cuadra', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, 'Y4', 999)), 'V08'), ['bloquea']));
ok('V08 mesa jugada sin tantos', () => assert.deepStrictEqual(cod(con(SP, (w) => { delete w['AN5']; }), 'V08'), ['bloquea']));
ok('V08b resultado raro', () => assert.deepStrictEqual(cod(con(SP, (w) => { poner(w, 'AL5', 3); poner(w, 'AM5', 0); }), 'V08b'), ['avisa']));
ok('V09 jornada anterior a la publicada', () => assert.deepStrictEqual(cod(con(SP, () => {}, { actual: { torneo: { id: 'sp-ejemplo' }, jornada: { numero: 5 }, jornadas: [] } }), 'V09'), ['confirma']));
ok('V10 saltos de jornada', () => assert.deepStrictEqual(cod(con(SP, () => {}, { actual: { torneo: { id: 'sp-ejemplo' }, jornada: { numero: 1 }, jornadas: [{ numero: 1, completa: true }] } }), 'V10'), ['avisa']));
ok('V11 jornada anterior sin completar', () => assert.deepStrictEqual(cod(con(SP, () => {}, { actual: { torneo: { id: 'sp-ejemplo' }, jornada: { numero: 2 }, jornadas: [{ numero: 2, completa: false }] } }), 'V11'), ['avisa']));
ok('V12 menos resultados que lo publicado', () => assert.deepStrictEqual(cod(con(SP, () => {}, { existente: { jornada: { mesas_pendientes: 0 } } }), 'V12'), ['confirma']));
ok('V13 errores en la hoja', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('errores'), 2)), 'V13'), ['confirma']));
ok('V14 sin sortear', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('sin_sortear'), 1)), 'V14'), ['confirma']));
ok('V16 normativa sin https', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('normativa_url'), 'http://x.es/n.pdf')), 'V16'), ['bloquea']));
ok('V17 fecha mala en parejas', () => assert.deepStrictEqual(cod(con('parejas-ejemplo-2026-11-14', (w) => poner(w, celda('fecha'), '2026-02-30')), 'V17'), ['bloquea']));
ok('V18 jornada mayor que n_jornadas', () => assert.deepStrictEqual(cod(con(SP, (w) => poner(w, celda('jornada'), 15)), 'V18'), ['bloquea']));

console.log('Archivos a escribir');
ok('actual.json lleva "jornadas" tras "jornada" y fusiona con lo publicado', () => {
  const { ws } = hoja(SP);
  const j = C.construir(C.leer(ws), '2026-11-14T18:30:00Z');
  const prev = { torneo: { id: 'sp-ejemplo' }, jornadas: [{ numero: 1, completa: true, publicado: 'a' }, { numero: 3, completa: false, publicado: 'viejo' }] };
  const l = C.jornadasNuevas(j, prev);
  assert.deepStrictEqual(l, [{ numero: 1, completa: true, publicado: 'a' }, { numero: 3, completa: false, publicado: '2026-11-14T18:30:00Z' }]);
  const a = C.conJornadas(j, l);
  const k = Object.keys(a);
  assert.strictEqual(k[k.indexOf('jornada') + 1], 'jornadas');
});
ok('indice.json: añade, reemplaza y ordena por fecha', () => {
  const j = C.construir(C.leer(hoja(SP).ws), '2026-11-14T18:30:00Z');
  const ind = { version: '1.0', publicado: 'a', torneos: [{ id: 'otro', fecha: '2027-01-01' }, { id: 'sp-ejemplo', fecha: '2020-01-01' }, { id: 'viejo', fecha: '2019-01-01' }] };
  const n = C.indiceNuevo(ind, j);
  assert.deepStrictEqual(n.torneos.map((x) => x.id), ['otro', 'sp-ejemplo', 'viejo']);
  assert.strictEqual(n.torneos[1].fecha, '2026-10-13');
  assert.strictEqual(n.torneos[1].ganador, null);
});
ok('indice.json: un torneo que ya estaba conserva su sitio (el orden de portada lo decide la mesa)', () => {
  const j = C.construir(C.leer(hoja(SP).ws), '2026-11-14T18:30:00Z');
  const ind = { version: '1.0', publicado: 'a', torneos: [{ id: 'viejo', fecha: '2019-01-01' }, { id: 'sp-ejemplo', fecha: '2020-01-01' }, { id: 'otro', fecha: '2027-01-01' }] };
  assert.deepStrictEqual(C.indiceNuevo(ind, j).torneos.map((x) => x.id), ['viejo', 'sp-ejemplo', 'otro']);
});
ok('indice.json: un torneo nuevo entra por fecha, el más reciente primero', () => {
  const j = C.construir(C.leer(hoja(SP).ws), '2026-11-14T18:30:00Z');
  const ind = { version: '1.0', publicado: 'a', torneos: [{ id: 'otro', fecha: '2027-01-01' }, { id: 'viejo', fecha: '2019-01-01' }] };
  assert.deepStrictEqual(C.indiceNuevo(ind, j).torneos.map((x) => x.id), ['otro', 'sp-ejemplo', 'viejo']);
});

console.log('Índice: quitar, añadir y editar entradas (mesa de control)');
const T = (id, estado, fecha) => ({ id, nombre: 'N ' + id, tipo: 'sp', temporada: '2026-27', fecha: fecha || '2026-01-01', estado, jornada_actual: 1, n_jornadas: 2, n_participantes: 4, ganador: null });
const IND = { version: '1.0', publicado: 'a', torneos: [T('aaa', 'en_juego'), T('bbb', 'terminado'), T('ccc', 'en_juego'), T('ddd', 'en_juego')] };
const idsDe = (i) => i.torneos.map((x) => x.id);
ok('indiceSin quita una entrada y deja el resto como estaba', () => {
  const n = C.indiceSin(IND, 'ccc', 'p');
  assert.deepStrictEqual(idsDe(n), ['aaa', 'bbb', 'ddd']);
  assert.strictEqual(n.publicado, 'p'); assert.strictEqual(n.version, '1.0');
  assert.deepStrictEqual(idsDe(IND), ['aaa', 'bbb', 'ccc', 'ddd']); // no toca el original
  assert.deepStrictEqual(idsDe(C.indiceSin(null, 'x', 'p')), []);
});
ok('indiceCon añade por fecha y, si ya estaba, la reemplaza en su sitio', () => {
  assert.deepStrictEqual(idsDe(C.indiceCon(IND, T('nueva', 'en_juego', '2027-01-01'), 'p')), ['nueva', 'aaa', 'bbb', 'ccc', 'ddd']);
  const n = C.indiceCon(IND, { ...T('ccc', 'terminado'), nombre: 'otro' }, 'p');
  assert.deepStrictEqual(idsDe(n), ['aaa', 'bbb', 'ccc', 'ddd']); assert.strictEqual(n.torneos[2].nombre, 'otro');
  assert.deepStrictEqual(idsDe(C.indiceCon(null, T('x', 'en_juego'), 'p')), ['x']);
});
ok('posicionEnGrupo cuenta solo los de su mismo estado', () => {
  assert.strictEqual(C.posicionEnGrupo(IND, 'ccc'), 2);
  assert.strictEqual(C.posicionEnGrupo(IND, 'bbb'), 1);
  assert.strictEqual(C.posicionEnGrupo(IND, 'zzz'), 0);
});
ok('indiceEditado cambia nombre, temporada y estado y coloca la entrada en su grupo', () => {
  const n = C.indiceEditado(IND, 'ddd', { nombre: 'Nuevo', temporada: null, estado: 'en_juego', orden: 1 }, 'p');
  assert.deepStrictEqual(idsDe(n), ['ddd', 'aaa', 'bbb', 'ccc']);
  assert.strictEqual(n.torneos[0].nombre, 'Nuevo'); assert.strictEqual(n.torneos[0].temporada, null);
  assert.deepStrictEqual(idsDe(C.indiceEditado(IND, 'aaa', { nombre: 'N aaa', temporada: '2026-27', estado: 'en_juego', orden: 3 }, 'p')), ['bbb', 'ccc', 'ddd', 'aaa']);
  assert.deepStrictEqual(idsDe(C.indiceEditado(IND, 'aaa', { nombre: 'N aaa', temporada: '2026-27', estado: 'en_juego', orden: 99 }, 'p')), ['bbb', 'ccc', 'ddd', 'aaa']);
  assert.deepStrictEqual(idsDe(C.indiceEditado(IND, 'ccc', { nombre: 'N ccc', temporada: '2026-27', estado: 'en_juego', orden: 0 }, 'p')), ['ccc', 'aaa', 'bbb', 'ddd']);
});
ok('indiceEditado: al cambiar de estado, entra en el grupo nuevo en el puesto pedido y el ganador solo vale si terminó', () => {
  const g = { id: 1, corto: 'A-B' };
  const t = C.indiceEditado(IND, 'aaa', { nombre: 'N aaa', temporada: '2026-27', estado: 'terminado', orden: 2, ganador: g }, 'p');
  assert.deepStrictEqual(idsDe(t), ['bbb', 'aaa', 'ccc', 'ddd']);
  assert.deepStrictEqual(t.torneos[1].ganador, g); assert.strictEqual(t.torneos[1].estado, 'terminado');
  const e = C.indiceEditado(t, 'aaa', { nombre: 'N aaa', temporada: '2026-27', estado: 'en_juego', orden: 1 }, 'p');
  assert.strictEqual(e.torneos.find((x) => x.id === 'aaa').ganador, null);
  assert.throws(() => C.indiceEditado(IND, 'zzz', { nombre: 'x', temporada: null, estado: 'en_juego', orden: 1 }, 'p'));
});
ok('indice.json: ganador cuando el torneo está terminado', () => {
  const j = C.construir(C.leer(hoja('sp-ejemplo-anterior').ws), 'x');
  const e = C.indiceNuevo(null, j).torneos[0];
  assert.strictEqual(e.estado, 'terminado');
  assert.deepStrictEqual(e.ganador, { id: 3, corto: 'Pons-Giner' });
});

console.log('\nVarias partidas de un mismo Excel (hojas _WEBC, _R1…_Rn y P.1…P.n)');
{
  const PE = path.join(__dirname, 'datos', 'parejas-ejemplo-2026-11-14');
  // La referencia son los JSON de prueba, hechos a mano. El descanso lleva el lado derecho vacío, como lo da la hoja WEB real.
  const ref = (k) => {
    const j = JSON.parse(fs.readFileSync(path.join(PE, `jornada_0${k}.json`), 'utf8')); delete j.publicado;
    for (const m of j.emparejamientos) if (m.estado === 'descanso') { m.p_dcha = null; m.t_dcha = null; }
    return j;
  };
  const libro = (k0, ...sinDatos) => {
    const xl = path.join(tmp, `partidas-${k0}-${sinDatos.join('')}.xlsx`);
    execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_partidas.py'), PE, String(k0), xl, ...sinDatos.map(String)]);
    const bytes = fs.readFileSync(xl), wb = XLSX.read(bytes, { type: 'array', sheets: 'WEB' });
    const raw = C.leer(wb.Sheets.WEB);
    return { raw, hojas: () => P.leerHojas(XLSX, bytes, wb, C.construir(raw, null).torneo.n_jornadas) };
  };
  const sin = (j) => { const c = JSON.parse(JSON.stringify(j)); delete c.publicado; return c; };
  ok('con la partida 2 en WEB salen la 1 y la 2, y cada JSON es el de referencia', () => {
    const l = libro(2), r = P.listar(l.raw, l.hojas());
    assert.strictEqual(r.aviso, null);
    assert.deepStrictEqual(r.partidas.map((p) => p.k), [1, 2]);
    for (const p of r.partidas) assert.deepStrictEqual(sin(p.json), ref(p.k));
  });
  ok('con la partida 1 en WEB salen las mismas dos', () => {
    const l = libro(1), r = P.listar(l.raw, l.hojas());
    assert.deepStrictEqual(r.partidas.map((p) => p.k), [1, 2]);
    for (const p of r.partidas) assert.deepStrictEqual(sin(p.json), ref(p.k));
  });
  ok('la partida seleccionada sale igual que la de la hoja WEB (mismo objeto, no uno parecido)', () => {
    const l = libro(2), r = P.listar(l.raw, l.hojas());
    assert.deepStrictEqual(sin(r.partidas.find((p) => p.k === 2).json), sin(C.construir(l.raw, null)));
  });
  ok('una partida sin ningún resultado no se ofrece', () => {
    const l = libro(1, 2), r = P.listar(l.raw, l.hojas()); // la 2 está en los JSON, pero sin datos en el Excel
    assert.deepStrictEqual(r.partidas.map((p) => p.k), [1]);
    assert.strictEqual(r.aviso, null);
  });
  ok('un Excel que solo trae la hoja WEB ofrece una partida, sin aviso', () => {
    const { wb, ws } = hoja('parejas-ejemplo-2026-11-14'), raw = C.leer(ws);
    const r = P.listar(raw, null);
    assert.deepStrictEqual(r.partidas.map((p) => p.k), [2]); assert.strictEqual(r.aviso, null);
  });
  ok('si lo que sale de las hojas de datos no es igual a la hoja WEB, solo se ofrece la de WEB y se avisa', () => {
    const l = libro(2), h = l.hojas();
    h._R2.AT2.v += 1; // un tanto de más en una pareja de la partida 2
    const r = P.listar(l.raw, h);
    assert.deepStrictEqual(r.partidas.map((p) => p.k), [2]);
    assert(/no coincide con la hoja WEB/.test(r.aviso), r.aviso);
  });
  ok('una partida con resultados que no se puede sacar (sorteo sin saber si está hecho) no se ofrece y queda en «omitidas»', () => {
    const l = libro(2), h = l.hojas();
    h.semillas = { A: null, B: null }; h._R1.CD28.v = 0; // la partida 1 sin fijar y sin saber la semilla
    const r = P.listar(l.raw, h);
    assert.deepStrictEqual([r.partidas.map((p) => p.k), r.omitidas], [[2], [1]]);
  });
  ok('solo se leen WEB, _WEBC, _R y P: nunca LICENCIAS', () => {
    const l = libro(2), h = l.hojas();
    assert.deepStrictEqual(Object.keys(h).filter((x) => !/^(_WEBC|_R\d+|P\.\d+|semillas)$/.test(x)), []);
  });
  ok('las columnas de _R salen de las fórmulas de _WEBC: si cambian de sitio, sigue dando lo mismo', () => {
    const l = libro(2), h = l.hojas();
    // mueve la columna de «ganadas» de AS a CA en todas las _R y en la fórmula de _WEBC
    for (let k = 1; k <= 7; k++) for (let f = 2; f <= 201; f++) { const c = h['_R' + k]['AS' + f]; if (c) { h['_R' + k]['CA' + f] = c; delete h['_R' + k]['AS' + f]; } }
    h._WEBC.M2.f = h._WEBC.M2.f.replace(/!AS2/g, '!CA2');
    const r = P.listar(l.raw, h);
    assert.deepStrictEqual(r.partidas.map((p) => p.k), [1, 2]);
    for (const p of r.partidas) assert.deepStrictEqual(sin(p.json), ref(p.k));
  });
  ok('jornadasNuevas acepta varias a la vez y conserva las demás', () => {
    const mk = (n, pub) => ({ torneo: { id: 'x' }, jornada: { numero: n, completa: true }, publicado: pub });
    const prev = { torneo: { id: 'x' }, jornadas: [{ numero: 1, completa: true, publicado: 'a' }, { numero: 5, completa: false, publicado: 'a' }] };
    assert.deepStrictEqual(C.jornadasNuevas([mk(3, 'b'), mk(5, 'b')], prev).map((x) => [x.numero, x.publicado]), [[1, 'a'], [3, 'b'], [5, 'b']]);
    assert.deepStrictEqual(C.jornadasNuevas(mk(2, 'b'), null).map((x) => x.numero), [2]);
  });
  ok('V10 no avisa de las partidas que se suben a la vez, y V11 tampoco de la incompleta que se vuelve a subir', () => {
    const { ws } = hoja('parejas-ejemplo-2026-11-14'); const r = C.leer(ws), j = C.construir(r, 'x');
    const act = { torneo: { id: j.torneo.id }, jornada: { numero: 0 }, jornadas: [{ numero: 1, completa: false }] };
    j.jornada.numero = 4;
    const cod = (pub) => C.validar(r, j, pub).map((x) => x.cod).filter((c) => /^V1[01]/.test(c));
    assert.deepStrictEqual(cod({ actual: act }), ['V10', 'V11']);
    assert.deepStrictEqual(cod({ actual: act, tambien: [1, 2, 3] }), []);
    assert.deepStrictEqual(cod({ actual: act, tambien: [2] }), ['V10', 'V11']); // la 1 sigue incompleta y no se vuelve a subir
    assert.deepStrictEqual(cod({ actual: act, tambien: [1, 2] }), ['V10']);
  });
}

console.log('Ranking FVD (contrato 1.2, assets/ranking.js)');
{
  const R = require('../assets/ranking.js');
  const RK = path.join(__dirname, 'datos', 'ranking-ejemplo', 'actual.json');
  const esperado = JSON.parse(fs.readFileSync(RK, 'utf8'));
  const libroRk = (extra = []) => {
    const xl = path.join(tmp, 'ranking' + extra.join('') + '.xlsx');
    execFileSync('python3', [path.join(__dirname, 'hacer_xlsx_ranking.py'), RK, xl, ...extra]);
    return XLSX.read(fs.readFileSync(xl), { type: 'buffer', sheets: 'WEB' });
  };
  const wb = libroRk(), ws = wb.Sheets.WEB;
  const sinPub = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.publicado; return c; };
  ok('ranking: se reconoce por la hoja WEB (1.2, tipo ranking); los campeonatos no', () => {
    assert.strictEqual(R.es(ws), true);
    assert.strictEqual(R.es(hoja('sp-ejemplo').ws), false);
  });
  ok('ranking: solo se lee la hoja WEB', () => assert.deepStrictEqual(Object.keys(wb.Sheets), ['WEB']));
  const r = R.leer(ws);
  ok('ranking: JSON idéntico al de referencia (el de web_export.py)', () => assert.deepStrictEqual(sinPub(r.doc), sinPub(esperado)));
  ok('ranking: orden de claves y texto idénticos', () => assert.strictEqual(R.aTexto({ ...r.doc, publicado: esperado.publicado }), fs.readFileSync(RK, 'utf8')));
  ok('ranking: sin bloqueos', () => assert.deepStrictEqual(R.validar(r, {}), []));
  const falla = (cod, cambia, pub) => { const x = JSON.parse(JSON.stringify(r)); cambia(x.doc, x); assert(R.validar(x, pub || {}).some((v) => v.cod === cod && v.gravedad === 'bloquea'), cod + ' no salta'); };
  ok('VR0: versión, tipo, id, una columna de puntos por torneo y estructura de la hoja', () => {
    falla('VR0', (d) => { d.version = '1.0'; });
    falla('VR0', (d) => { d.torneo.id = 'Ranking 2026'; });
    falla('VR0', (d) => { d.ranking[0].puntos.pop(); });
    falla('VR0', (d, x) => { x.estructura.push('L3'); });
  });
  ok('VR0: el id ya lo usa un campeonato de otro tipo', () => falla('VR0', () => {}, { indice: { torneos: [{ id: 'ranking-ejemplo', tipo: 'sp' }] } }));
  ok('VR0: el id lleva el nombre o el apellido de un jugador (las carpetas no se cifran)', () => falla('VR0', (d) => { d.torneo.id = 'ranking-roig-2026'; }));
  ok('VR1: licencia con otra forma', () => { falla('VR1', (d) => { d.ranking[0].licencia = '9201'; }); falla('VR1', (d) => { d.ranking[1].licencia_ant = '46/ 12345'; }); });
  ok('VR2: nombre, apellido o asociación con cifras, «@» o más de 60', () => {
    falla('VR2', (d) => { d.ranking[0].nombre = 'Ana 2'; }); falla('VR2', (d) => { d.ranking[1].apellido1 = 'x@y'; }); falla('VR2', (d) => { d.ranking[2].asociacion = 'A'.repeat(61); });
  });
  ok('VR3: el total no es la suma de las mejores', () => falla('VR3', (d) => { d.ranking[0].total += 1; }));
  ok('VR4: puestos en orden y empates coherentes', () => {
    falla('VR4', (d) => { d.ranking[0].puesto = 9; }); falla('VR4', (d) => { d.ranking[1].empate = true; }); falla('VR4', (d) => { d.ranking[0].empate = true; });
    const prov = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', 'ranking-provisional', 'actual.json'), 'utf8'));          // este sí tiene dos empatados en el puesto 2
    assert.deepStrictEqual(prov.ranking.filter((f) => f.empate).length, 2);
  });
  ok('VR5: más plazas del ranking de las que tocan, la marca de plaza que no es la suma de las tres y más de 4 plazas SP o 2 plazas Open', () => {
    falla('VR5', (d) => { d.torneo.plazas_ranking = 2; });
    falla('VR5', (d) => { d.ranking[0].plaza_ce = false; });
    falla('VR5', (d) => { for (const f of d.ranking.slice(0, 5)) { f.plaza_sp = true; f.plaza_ce = true; } });
    falla('VR5', (d) => { for (const f of d.ranking.slice(0, 3)) { f.plaza_open = true; f.plaza_ce = true; } });
  });
  ok('ranking: las tres marcas de plaza y lo que dicen del SP y el Open (ejemplo con los dos jugados, con el Open sin jugar y con renuncias)', () => {
    const cuenta = (d, k) => d.ranking.filter((f) => f[k]).length, t = r.doc.torneo;
    assert.deepStrictEqual([cuenta(r.doc, 'plaza_sp'), cuenta(r.doc, 'plaza_open'), cuenta(r.doc, 'plaza_ranking'), t.sp_jugado, t.open_jugado, t.plazas_provisionales, t.plazas_vacias], [4, 2, 6, true, true, false, 0]);
    const pr = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', 'ranking-provisional', 'actual.json'), 'utf8')).torneo;
    assert.deepStrictEqual([pr.sp_jugado, pr.open_jugado, pr.plazas_provisionales], [true, false, true]);
    const va = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', 'ranking-vacias', 'actual.json'), 'utf8')).torneo;
    assert.deepStrictEqual([va.plazas_vacias, va.plazas_ranking], [4, 6]);
  });
  ok('VR6: el Excel tiene errores', () => assert(R.validar(R.leer(libroRk(['--errores', '2']).Sheets.WEB), {}).some((v) => v.cod === 'VR6')));
  ok('ranking: entrada de indice.json con tipo ranking y sin licencias', () => {
    const e = R.entradaIndice(r.doc);
    assert.deepStrictEqual(e, { id: 'ranking-ejemplo', nombre: 'Ranking FVD Jaume I', tipo: 'ranking', temporada: '2026-27', fecha: '2027-01-23', estado: 'en_juego',
      jornada_actual: 5, n_jornadas: 5, n_participantes: 14, ganador: null });
  });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${hechos} pruebas bien, ${fallos} con fallo`);
process.exit(fallos ? 1 : 0);
