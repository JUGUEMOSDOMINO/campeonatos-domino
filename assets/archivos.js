/* Sección «Archivos» de la mesa de control: el árbitro descarga lo que hay en programas-domino/entregables/ sin entrar en GitHub.
   - La lista sale de entregables/DESCARGAS.md (una fila por archivo: ruta, frase y fecha); solo se enseñan los archivos que tienen línea y existen.
   - Se agrupan por categoría (la sección de DESCARGAS.md donde está cada fila), lo más reciente primero.
   - La fecha que se enseña, al segundo y en hora de Madrid, es la del último commit que tocó el archivo en programas-domino (una sola consulta GraphQL, Mesa.fechasEntregables). La columna Fecha de DESCARGAS.md no se enseña: solo ordena si la consulta falla, y entonces se lee «Fecha no disponible».
   - Subir va por «Subir archivo» (paso 4, assets/publicar.js): lo que el árbitro sube se guarda siempre en programas-domino (privado), en entregables/del_arbitro/<categoría>/, con su línea en DESCARGAS.md. Nunca en campeonatos-domino.
   - Todo pasa por Mesa.llamar (assets/mesa.js), que es lo único que manda el token y solo deja leer entregables/ y escribir del_arbitro/<categoría>/ y DESCARGAS.md.
   La parte sin navegador (leer y escribir DESCARGAS.md, validar nombre y descripción) se prueba en Node con pruebas/probar_archivos.cjs. */
(function (raiz) {
  'use strict';

  const FILA = /^\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*$/;
  // Las categorías, en el orden en que salen en DESCARGAS.md y en el panel. «Mantenimiento» va la última y no se puede elegir al subir.
  const CATEGORIAS = ['Programas de campeonato', 'Ranking FVD', 'Rankings publicados', 'Torneos', 'Manuales y guías', 'Otros', 'Mantenimiento'];
  const CATEGORIAS_SUBIR = CATEGORIAS.filter((c) => c !== 'Mantenimiento');
  const carpetaDe = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '-');
  const TABLA = '| Archivo | Qué es | Fecha |\n|---|---|---|';
  const CABECERA = '# Descargas\n\nLista de lo que hay en `entregables/` y para qué sirve cada cosa, por categorías. La mesa de control (`publicar.html`, sección «Archivos») la lee.\n\n'
    + 'Regla: cada archivo nuevo o actualizado en `entregables/` lleva su línea en esta lista, en su categoría, con una frase clara de qué es y la fecha. Los archivos que sube el árbitro van a `entregables/del_arbitro/<categoría>/`.\n';
  const MAX_SUBIDA = 25 * 1024 * 1024, MAX_DESCRIPCION = 200, MAX_NOMBRE = 100;

  const limpiarDescripcion = (t) => String(t == null ? '' : t).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const descripcionValida = (t) => { const d = limpiarDescripcion(t); return d.length >= 1 && d.length <= MAX_DESCRIPCION; };
  const nombreValido = (n) => typeof n === 'string' && n.length >= 1 && n.length <= MAX_NOMBRE && !n.startsWith('.') && !n.endsWith(' ') && !/[/\\?#%:*"<>|\u0000-\u001f]/.test(n);
  const fechaHoy = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date());

  // Filas de la tabla: [{ ruta, descripcion, fecha, categoria }]. La categoría es el título «## …» bajo el que está la fila; fuera de toda categoría, «Otros».
  // Las rutas que acaban en «/» describen una carpeta entera y no se listan.
  function leerDescargas(md) {
    const out = [];
    let categoria = 'Otros';
    for (const l of String(md == null ? '' : md).split('\n')) {
      const h = /^##\s+(.*?)\s*$/.exec(l);
      if (h) { categoria = CATEGORIAS.includes(h[1]) ? h[1] : 'Otros'; continue; }
      const m = FILA.exec(l);
      if (m && !m[1].endsWith('/')) out.push({ ruta: m[1], descripcion: m[2], fecha: m[3], categoria });
    }
    return out;
  }

  // «dd/mm/aaaa hh:mm:ss» en hora de Madrid (con el cambio de horario) de un instante ISO como 2026-11-23T14:05:09Z; '' si no es una fecha válida.
  function fechaHora(iso) {
    const d = new Date(iso);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(String(iso)) || isNaN(d)) return '';
    const p = {};
    for (const x of new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d)) p[x.type] = x.value;
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
  }
  // Con la fecha del commit (`commit`, ISO en UTC) se ordena por ella; sin ella, por la fecha de DESCARGAS.md a las 00:00.
  const clave = (f) => f.commit || f.fecha + 'T00:00:00Z';

  // Por categoría y en su orden, solo las que tienen archivos; dentro, lo más reciente primero (a igual fecha, el orden del documento).
  function agrupar(filas) {
    return CATEGORIAS.map((categoria) => ({ categoria, filas: filas.filter((f) => f.categoria === categoria).sort((a, b) => (clave(a) < clave(b)) - (clave(a) > clave(b))) })).filter((g) => g.filas.length);
  }

  // El texto de DESCARGAS.md con la línea de `ruta` puesta al principio de su categoría (la más reciente arriba). Si ya tenía una línea, en cualquier categoría, se quita antes.
  // Si la categoría no tiene sección, se crea antes de la primera categoría posterior que exista, o al final. Sin DESCARGAS.md, lo crea.
  function conLinea(md, ruta, descripcion, fecha, categoria) {
    const cat = CATEGORIAS.includes(categoria) ? categoria : 'Otros';
    const linea = `| \`${ruta}\` | ${limpiarDescripcion(descripcion)} | ${fecha} |`;
    let ls = (md == null || !/^\|\s*Archivo\s*\|/m.test(md) ? CABECERA : String(md)).replace(/\n+$/, '').split('\n');
    ls = ls.filter((l) => { const m = FILA.exec(l); return !(m && m[1] === ruta); });
    const h = ls.indexOf('## ' + cat);
    if (h >= 0) {
      let i = h + 1;
      while (i < ls.length && !ls[i].startsWith('## ') && !ls[i].startsWith('|')) i++;           // hasta la tabla de la sección
      if (i < ls.length && ls[i].startsWith('|')) i += 2;                                          // salta cabecera y separador
      else { ls.splice(h + 1, 0, '', ...TABLA.split('\n')); i = h + 4; }                           // sección sin tabla
      ls.splice(i, 0, linea);
    } else {
      const sig = CATEGORIAS.slice(CATEGORIAS.indexOf(cat) + 1).map((c) => ls.indexOf('## ' + c)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
      const bloque = ['## ' + cat, '', ...TABLA.split('\n'), linea];
      if (sig === undefined) ls.push('', ...bloque); else ls.splice(sig, 0, ...bloque, '');
    }
    return ls.join('\n') + '\n';
  }

  const API = { CATEGORIAS, CATEGORIAS_SUBIR, carpetaDe, agrupar, fechaHora, leerDescargas, conLinea, nombreValido, descripcionValida, limpiarDescripcion, fechaHoy, MAX_SUBIDA };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  raiz.Archivos = API;

  /* ---------- la sección de publicar.html ---------- */
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.pagina !== 'publicar' || !document.getElementById('paso-archivos')) return;
    const M = raiz.Mesa, $ = (id) => document.getElementById(id);
    const E = { listo: false, archivos: new Map(), abiertas: new Map() };
    const nodo = (tag, txt, clase) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (clase) e.className = clase; return e; };
    const decir = (t) => { $('archivos-estado').textContent = t || ''; };
    const tam = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    const bytesDe = (b64) => { const bin = atob(b64.replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

    async function leerDescargasRepo() {
      try {
        const r = await M.llamar('prog', '/contents/entregables/DESCARGAS.md?ref=main');
        return { sha: r.sha, texto: new TextDecoder().decode(bytesDe(r.content || '')) };
      } catch (e) { if (e.estado === 404) return null; throw e; }
    }

    async function cargar() {
      if (!M.token.obtener()) { decir('Primero pega el token de GitHub en el paso 1.'); return false; }
      decir('Leyendo los archivos…'); $('archivos-ver').disabled = true;
      try {
        const ac = await M.acceso('prog');
        if (!ac.ok) { $('archivos-lista').replaceChildren(); E.listo = false; decir(ac.msg); return false; }
        const arbol = await M.llamar('prog', '/git/trees/main?recursive=1');
        E.archivos = new Map((arbol.tree || []).filter((t) => t.type === 'blob' && t.path.startsWith('entregables/')).map((t) => [t.path.slice('entregables/'.length), { size: t.size || 0, sha: t.sha }]));
        const d = await leerDescargasRepo();
        const filas = leerDescargas(d && d.texto).filter((f) => E.archivos.has(f.ruta));
        const fechas = await M.fechasEntregables(filas.map((f) => f.ruta)); // una consulta para todos; si falla, queda vacía
        for (const f of filas) f.commit = fechas.get(f.ruta) || null;
        const carpetas = d ? [...d.texto.matchAll(/^\|\s*`([^`]+\/)`/gm)].map((m) => m[1]) : [];
        const descritos = new Set(filas.map((f) => f.ruta));
        const sinLinea = [...E.archivos.keys()].filter((r) => !descritos.has(r) && !r.endsWith('.gitkeep') && r !== 'DESCARGAS.md' && !carpetas.some((c) => r.startsWith(c)));
        pintar(filas, sinLinea.length, !!arbol.truncated);
        E.listo = true;
        return true;
      } catch (e) {
        decir(e instanceof M.ErrorGH ? e.message : 'No se han podido leer los archivos. Prueba otra vez dentro de un minuto.');
        return false;
      } finally { $('archivos-ver').disabled = false; }
    }

    function pintar(filas, sinLinea, truncado) {
      const caja = $('archivos-lista');
      for (const d of caja.querySelectorAll('details.categoria')) E.abiertas.set(d.dataset.categoria, d.open); // lo que el árbitro abrió o cerró se respeta al recargar
      caja.replaceChildren();
      for (const g of agrupar(filas)) {
        const d = nodo('details', null, 'categoria'), n = g.filas.length;
        d.dataset.categoria = g.categoria;
        d.open = E.abiertas.has(g.categoria) ? E.abiertas.get(g.categoria) : false; // plegadas al pulsar «Ver los archivos»; lo que el árbitro abre se respeta al recargar
        const titulo = nodo('summary');
        titulo.append(nodo('span', g.categoria, 'cat-nombre'), nodo('span', `${n} ${n === 1 ? 'archivo' : 'archivos'}`, 'cat-n'));
        const ul = nodo('ul', null, 'lista-archivos');
        for (const f of g.filas) {
          const partes = f.ruta.split('/'), nombre = partes.pop();
          const li = nodo('li', null, 'archivo');
          const cuerpo = nodo('div', null, 'archivo-datos');
          cuerpo.append(nodo('b', nombre, 'archivo-nombre'));
          if (partes.length) cuerpo.append(nodo('span', partes.join('/') + '/', 'archivo-ruta'));
          cuerpo.append(nodo('p', f.descripcion, 'archivo-desc'), nodo('span', f.commit ? `Actualizado: ${fechaHora(f.commit)}` : 'Fecha no disponible', 'archivo-fecha'), nodo('span', tam(E.archivos.get(f.ruta).size), 'archivo-meta'));
          const bt = nodo('button', 'Descargar', 'boton sec');
          bt.type = 'button';
          bt.setAttribute('aria-label', `Descargar ${nombre}`);
          bt.addEventListener('click', () => descargar(f.ruta, nombre, bt));
          li.append(cuerpo, bt);
          ul.append(li);
        }
        d.append(titulo, ul);
        caja.append(d);
      }
      const extra = [];
      if (!filas.length) extra.push('Todavía no hay archivos con descripción en entregables/DESCARGAS.md.');
      if (sinLinea) extra.push(`Hay ${sinLinea} ${sinLinea === 1 ? 'archivo' : 'archivos'} sin descripción en DESCARGAS.md: no se enseñan.`);
      if (truncado) extra.push('GitHub ha devuelto la lista cortada: puede que falten archivos.');
      if (extra.length) caja.append(nodo('p', extra.join(' '), 'nota'));
      decir('');
    }

    async function descargar(ruta, nombre, bt) {
      bt.disabled = true; decir(`Descargando ${nombre}…`);
      try {
        const r = await M.llamar('prog', `/git/blobs/${E.archivos.get(ruta).sha}`);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytesDe(r.content || '')], { type: 'application/octet-stream' }));
        a.download = nombre; a.rel = 'noopener';
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 30000);
        decir(`Descargado ${nombre}. Mira en la carpeta de descargas del navegador.`);
      } catch (e) { decir(e instanceof M.ErrorGH ? e.message : `No se ha podido descargar ${nombre}. Prueba otra vez.`); } finally { bt.disabled = false; }
    }

    $('archivos-ver').addEventListener('click', cargar);
    // Lo que se guarda desde «Subir archivo» sale aquí en cuanto se guarda, si la lista ya estaba a la vista.
    API.refrescar = () => (E.listo ? cargar() : null);
  });
})(typeof window !== 'undefined' ? window : globalThis);
