// Ninguna licencia en ningún JSON salvo el del ranking, y ese siempre cifrado.
// Recorre los JSON de prueba en claro (pruebas/datos), los mismos descifrados (datos/_prueba) y los publicados (datos/, tal cual).
// Uso: node pruebas/probar_licencias.cjs
const assert = require('assert');
const fs = require('fs'), path = require('path');
const K = require('./cripto_prueba.cjs');

const raiz = path.join(__dirname, '..');
const LICENCIA = /46\s*\/\s*\d{3,4}|"licencia(_ant)?"\s*:/; // el formato de la FVD o la clave del ranking
let ok = 0; const bien = (t) => { ok++; console.log('  ok  ' + t); };
const archivos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const json = (f) => archivos(f).filter((x) => x.endsWith('.json'));
const tipoDe = (j) => (j && j.torneo ? j.torneo.tipo : null);

// 1. En claro: solo el JSON de tipo ranking puede llevar licencias (y lleva alguna, si no la prueba no prueba nada)
let ranking = 0;
for (const f of json(path.join(__dirname, 'datos'))) {
  const t = fs.readFileSync(f, 'utf8'), j = JSON.parse(t), rel = path.relative(raiz, f);
  if (tipoDe(j) === 'ranking') { assert(LICENCIA.test(t), rel + ': el ranking de prueba no lleva licencias'); ranking++; }
  else assert(!LICENCIA.test(t), rel + ': un JSON que no es del ranking lleva una licencia');
}
assert(ranking > 0, 'no hay ningún ranking de prueba');
bien(`pruebas/datos: licencias solo en el JSON del ranking (${ranking})`);

// 2. Los mismos, cifrados en datos/_prueba: descifrados, igual; y en el archivo tal cual no se ve ninguna
const clave = K.clavePrueba();
assert(clave, 'datos/_prueba/clave.json no abre con la contraseña de prueba');
let vistos = 0;
for (const f of json(K.DIR_PRUEBA).filter((x) => path.basename(x) !== 'clave.json')) {
  const t = fs.readFileSync(f, 'utf8'), rel = path.relative(raiz, f);
  assert(K.esSobre(t), rel + ': no está cifrado');
  assert(!LICENCIA.test(t), rel + ': se ve una licencia sin descifrar');
  const plano = K.descifrar(clave, JSON.parse(t)).toString('utf8');
  assert.strictEqual(LICENCIA.test(plano), tipoDe(JSON.parse(plano)) === 'ranking', rel + ': licencias fuera del ranking (o un ranking sin ellas)');
  vistos++;
}
bien(`datos/_prueba: ${vistos} archivos cifrados; descifrados, licencias solo en el ranking`);

// 3. La web publicada (datos/, sin _prueba): todo cifrado salvo clave.json, y ninguna licencia legible en ningún archivo
const publicados = archivos(path.join(raiz, 'datos')).filter((x) => !x.startsWith(K.DIR_PRUEBA + path.sep) && path.basename(x) !== '.gitkeep');
for (const f of publicados) {
  const t = fs.readFileSync(f, 'utf8'), rel = path.relative(raiz, f);
  assert(!LICENCIA.test(t), rel + ': se ve una licencia');
  if (path.basename(f) !== 'clave.json') assert(K.esSobre(t), rel + ': no está cifrado');
}
bien(`datos/: ${publicados.length} archivos publicados, todos cifrados (salvo clave.json) y sin ninguna licencia legible`);

console.log(`\n${ok} comprobaciones bien`);
