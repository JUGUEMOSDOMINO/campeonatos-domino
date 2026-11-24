/* Ventana de espera de la mesa de control. Mientras una tarea trabaja (llama a GitHub o cifra):
   - el resto de la página queda inerte (ni ratón, ni teclado, ni dedo) desde el primer momento;
   - si la tarea dura más de ~300 ms, aparece una ventana en el centro con una ficha de dominó animada (solo CSS) y una frase de lo que hace;
   - cada acción tiene su cerrojo (una clave): si se lanza otra vez mientras corre, no se ejecuta;
   - al terminar, bien o con error, la ventana se cierra siempre (try/finally);
   - mientras hay una escritura en curso, el navegador avisa si se intenta cerrar o recargar la pestaña.
   Uso: Espera.tarea(clave, frase, async () => {...}, { escribe: true }) → lo que devuelve la función, o undefined si esa clave ya estaba en marcha.
   Dentro de una tarea se puede llamar a otra con otra clave (comparten ventana). Espera.paso('Paso 2 de 5: …') cambia el segundo renglón. */
(function (raiz) {
  'use strict';
  const RETRASO = 300, LARGA = 30000;
  const claves = new Set();
  const S = { n: 0, escribiendo: 0, previo: null, ventana: null, visible: false, timer: null, larga: null, frase: '', paso: '' };
  const aviso = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };

  const nodo = (clase, tag) => { const e = document.createElement(tag || 'div'); e.className = clase; return e; };
  // La ficha: dos mitades con siete casillas de punto cada una (las de la cuadrícula 3x3 que usa algún número del 1 al 6); la animación enciende cada una a su tiempo.
  function ficha() {
    const f = nodo('ficha-espera'); f.setAttribute('aria-hidden', 'true');
    for (const lado of ['izq', 'der']) {
      const m = nodo('mitad ' + lado);
      for (const c of ['c1', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9']) m.append(nodo('pip ' + c, 'span'));
      f.append(m);
    }
    return f;
  }
  function construir() {
    const v = nodo('espera'); v.hidden = true;
    const caja = nodo('espera-caja'); caja.setAttribute('role', 'alertdialog'); caja.setAttribute('aria-modal', 'true'); caja.setAttribute('aria-busy', 'true'); caja.tabIndex = -1;
    caja.setAttribute('aria-labelledby', 'espera-frase'); caja.setAttribute('aria-describedby', 'espera-paso');
    const frase = nodo('espera-frase', 'p'); frase.id = 'espera-frase'; frase.setAttribute('aria-live', 'polite');
    const paso = nodo('espera-paso', 'p'); paso.id = 'espera-paso'; paso.setAttribute('aria-live', 'polite');
    const larga = nodo('espera-larga', 'p'); larga.setAttribute('aria-live', 'polite');
    caja.append(ficha(), frase, paso, larga); v.append(caja);
    document.body.append(v);
    S.ventana = { v, caja, frase, paso, larga };
  }
  const pintar = () => { if (!S.ventana) return; S.ventana.frase.textContent = S.frase; S.ventana.paso.textContent = S.paso; };
  function inerte(si) { for (const e of document.body.children) if (!e.classList.contains('espera') && e.tagName !== 'SCRIPT') { if (si) e.setAttribute('inert', ''); else e.removeAttribute('inert'); } }
  function mostrar() {
    S.timer = null;
    if (!S.ventana) construir();
    pintar(); S.ventana.v.hidden = false; S.visible = true; S.ventana.caja.focus();
  }
  function abrir(frase) {
    S.previo = document.activeElement; S.frase = frase; S.paso = '';
    inerte(true); document.body.dataset.espera = '1';
    S.timer = setTimeout(mostrar, RETRASO);
    S.larga = setTimeout(() => { S.larga = null; S.frase += ' Sigue trabajando, no cierres la página.'; pintar(); }, LARGA);
  }
  function cerrar() {
    clearTimeout(S.timer); clearTimeout(S.larga); S.timer = S.larga = null;
    if (S.ventana) { S.ventana.v.hidden = true; S.ventana.larga.textContent = ''; }
    S.visible = false; inerte(false); delete document.body.dataset.espera;
    const p = S.previo; S.previo = null;
    if (p && p.isConnected && typeof p.focus === 'function') p.focus();
  }

  async function tarea(clave, frase, fn, op) {
    if (claves.has(clave)) return undefined;
    claves.add(clave);
    if (S.n++ === 0) abrir(frase);
    const escribe = !!(op && op.escribe);
    if (escribe && S.escribiendo++ === 0) raiz.addEventListener('beforeunload', aviso);
    try { return await fn(); }
    finally {
      if (escribe && --S.escribiendo === 0) raiz.removeEventListener('beforeunload', aviso);
      claves.delete(clave);
      if (--S.n === 0) cerrar();
    }
  }
  const paso = (t) => { S.paso = t || ''; pintar(); };
  raiz.Espera = { tarea, paso, get ocupada() { return S.n > 0; } };
})(typeof window !== 'undefined' ? window : globalThis);
