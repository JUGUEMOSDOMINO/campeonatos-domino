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
// Dentro de «iv» y «ct» de un sobre cifrado solo hay base64 al azar: «46/3063» puede salir por casualidad y no es una licencia. Se busca en el resto del archivo.
const legible = (t) => t.replace(/"(iv|ct)"\s*:\s*"[A-Za-z0-9+/=]*"/g, '');
// Un archivo publicado en datos/: un sobre cifrado (salvo clave.json) y ninguna licencia legible fuera de iv y ct.
function comprobarPublicado(t, rel, esClave) {
  assert(!LICENCIA.test(legible(t)), rel + ': se ve una licencia');
  if (!esClave) assert(K.esSobre(t), rel + ': no está cifrado');
}

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
  assert(!LICENCIA.test(legible(t)), rel + ': se ve una licencia sin descifrar');
  const plano = K.descifrar(clave, JSON.parse(t)).toString('utf8');
  assert.strictEqual(LICENCIA.test(plano), tipoDe(JSON.parse(plano)) === 'ranking', rel + ': licencias fuera del ranking (o un ranking sin ellas)');
  vistos++;
}
bien(`datos/_prueba: ${vistos} archivos cifrados; descifrados, licencias solo en el ranking`);

// 3. La web publicada (datos/, sin _prueba): todo cifrado salvo clave.json, y ninguna licencia legible en ningún archivo
const publicados = archivos(path.join(raiz, 'datos')).filter((x) => !x.startsWith(K.DIR_PRUEBA + path.sep) && path.basename(x) !== '.gitkeep');
for (const f of publicados) {
  const t = fs.readFileSync(f, 'utf8'), rel = path.relative(raiz, f);
  comprobarPublicado(t, rel, path.basename(f) === 'clave.json');
}
bien(`datos/: ${publicados.length} archivos publicados, todos cifrados (salvo clave.json) y sin ninguna licencia legible`);

// 4. Regresión: el texto cifrado de un sobre puede llevar «46/3063» por azar (pasó con datos/ranking-2026-27/actual.json) y eso no es una licencia legible;
//    una licencia en claro, en cualquier otro campo, sí lo es; y un JSON de datos/ sin cifrar sigue fallando.
const unSobre = fs.readFileSync(path.join(K.DIR_PRUEBA, fs.readdirSync(K.DIR_PRUEBA).find((d) => fs.statSync(path.join(K.DIR_PRUEBA, d)).isDirectory()), 'actual.json'), 'utf8');
const sobre = JSON.parse(unSobre);
const conAzar = JSON.stringify({ ...sobre, ct: 'p6hJYHwt46/3063PNsklf4m' + sobre.ct });          // un sobre de verdad con «46/3063» dentro de su ct
assert(LICENCIA.test(conAzar), 'la trampa tiene que existir: sin quitar iv y ct, se vería como licencia');
comprobarPublicado(conAzar, 'sobre con 46/3063 al azar en ct', false);
assert.throws(() => comprobarPublicado(JSON.stringify({ ...sobre, nota: 'jugador 46/3063' }), 'sobre con una licencia en otro campo', false), /se ve una licencia/);
assert.throws(() => comprobarPublicado(JSON.stringify({ ...sobre, licencia: 3063 }), 'sobre con la clave «licencia» en claro', false), /se ve una licencia/);
assert.throws(() => comprobarPublicado('{"torneo":{"id":"x"},"jugador":"46/3063"}', 'JSON en claro con 46/3063', false), /se ve una licencia/);
assert.throws(() => comprobarPublicado('{"torneo":{"id":"x"},"clasificacion":[]}', 'JSON en claro sin licencias', false), /no está cifrado/);
bien('regresión: un 46/3063 al azar dentro de iv o ct no falla; una licencia legible en cualquier otro campo, o un JSON de datos/ sin cifrar, sí');

console.log(`\n${ok} comprobaciones bien`);
