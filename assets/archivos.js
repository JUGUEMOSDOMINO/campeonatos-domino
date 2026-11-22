/* Sección «Archivos» de la mesa de control: el árbitro descarga lo que hay en programas-domino/entregables/ sin entrar en GitHub y sube sus propios archivos.
   - La lista sale de entregables/DESCARGAS.md (una fila por archivo: ruta, frase y fecha); solo se enseñan los archivos que tienen línea y existen.
   - Subir: siempre a programas-domino (privado), en entregables/del_arbitro/, con una descripción obligatoria que se añade a DESCARGAS.md. Nunca a campeonatos-domino.
   - Todo pasa por Mesa.llamar (assets/mesa.js), que es lo único que manda el token y solo deja leer entregables/ y escribir del_arbitro/ y DESCARGAS.md.
   La parte sin navegador (leer y escribir DESCARGAS.md, validar nombre y descripción) se prueba en Node con pruebas/probar_archivos.cjs. */
(function (raiz) {
  'use strict';

  const FILA = /^\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*$/;
  const CABECERA = '# Descargas\n\nLista de lo que hay en `entregables/` y para qué sirve cada cosa. La mesa de control (`publicar.html`, sección «Archivos») la lee.\n\n'
    + 'Regla: cada archivo nuevo o actualizado en `entregables/` lleva su línea en esta tabla, con una frase clara de qué es y la fecha. Los archivos que sube el árbitro van a `entregables/del_arbitro/`.\n\n'
    + '| Archivo | Qué es | Fecha |\n|---|---|---|\n';
  const MAX_SUBIDA = 25 * 1024 * 1024, MAX_DESCRIPCION = 200, MAX_NOMBRE = 100;

  const limpiarDescripcion = (t) => String(t == null ? '' : t).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const descripcionValida = (t) => { const d = limpiarDescripcion(t); return d.length >= 1 && d.length <= MAX_DESCRIPCION; };
  const nombreValido = (n) => typeof n === 'string' && n.length >= 1 && n.length <= MAX_NOMBRE && !n.startsWith('.') && !n.endsWith(' ') && !/[/\\?#%:*"<>|\u0000-\u001f]/.test(n);
  const fechaHoy = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date());

  // Filas de la tabla: [{ ruta, descripcion, fecha }]. Las rutas que acaban en «/» describen una carpeta entera y no se listan.
  function leerDescargas(md) {
    const out = [];
    for (const l of String(md == null ? '' : md).split('\n')) {
      const m = FILA.exec(l);
      if (m && !m[1].endsWith('/')) out.push({ ruta: m[1], descripcion: m[2], fecha: m[3] });
    }
    return out;
  }

  // El texto de DESCARGAS.md con la línea de `ruta` añadida al final de la tabla, o sustituida si ya tenía una. Sin DESCARGAS.md, lo crea.
  function conLinea(md, ruta, descripcion, fecha) {
    const linea = `| \`${ruta}\` | ${limpiarDescripcion(descripcion)} | ${fecha} |`;
    if (md == null || !/^\|\s*Archivo\s*\|/m.test(md)) return CABECERA + linea + '\n';
    const ls = String(md).replace(/\n+$/, '').split('\n');
    const i = ls.findIndex((l) => { const m = FILA.exec(l); return m && m[1] === ruta; });
    if (i >= 0) ls[i] = linea;
    else { let ultima = -1; ls.forEach((l, k) => { if (l.startsWith('|')) ultima = k; }); ls.splice(ultima + 1, 0, linea); }
    return ls.join('\n') + '\n';
  }

  const API = { leerDescargas, conLinea, nombreValido, descripcionValida, limpiarDescripcion, fechaHoy, MAX_SUBIDA };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  raiz.Archivos = API;

  /* ---------- la sección de publicar.html ---------- */
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.pagina !== 'publicar' || !document.getElementById('paso-archivos')) return;
    const M = raiz.Mesa, $ = (id) => document.getElementById(id);
    const E = { listo: false, archivos: new Map(), push: false, linea: null };
    const nodo = (tag, txt, clase) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (clase) e.className = clase; return e; };
    const decir = (t) => { $('archivos-estado').textContent = t || ''; };
    const rutaUrl = (r) => r.split('/').map(encodeURIComponent).join('/');
    const tam = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    const bytesDe = (b64) => { const bin = atob(b64.replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const aBase64 = (u) => { let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); };
    const fecha = (iso) => iso.split('-').reverse().join('/');

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
        if (!ac.ok) { $('archivos-lista').replaceChildren(); E.listo = false; E.push = false; decir(ac.msg); actualizarSubida(); return false; }
        E.push = ac.push;
        const arbol = await M.llamar('prog', '/git/trees/main?recursive=1');
        E.archivos = new Map((arbol.tree || []).filter((t) => t.type === 'blob' && t.path.startsWith('entregables/')).map((t) => [t.path.slice('entregables/'.length), { size: t.size || 0, sha: t.sha }]));
        const d = await leerDescargasRepo();
        const filas = leerDescargas(d && d.texto).filter((f) => E.archivos.has(f.ruta));
        const carpetas = d ? [...d.texto.matchAll(/^\|\s*`([^`]+\/)`/gm)].map((m) => m[1]) : [];
        const descritos = new Set(filas.map((f) => f.ruta));
        const sinLinea = [...E.archivos.keys()].filter((r) => !descritos.has(r) && !r.endsWith('.gitkeep') && r !== 'DESCARGAS.md' && !carpetas.some((c) => r.startsWith(c)));
        filas.sort((a, b) => (b.ruta.startsWith('del_arbitro/') - a.ruta.startsWith('del_arbitro/')) || a.ruta.localeCompare(b.ruta, 'es'));
        pintar(filas, sinLinea.length, !!arbol.truncated);
        E.listo = true; actualizarSubida();
        return true;
      } catch (e) {
        decir(e instanceof M.ErrorGH ? e.message : 'No se han podido leer los archivos. Prueba otra vez dentro de un minuto.');
        return false;
      } finally { $('archivos-ver').disabled = false; }
    }

    function pintar(filas, sinLinea, truncado) {
      const ul = $('archivos-lista');
      ul.replaceChildren();
      for (const f of filas) {
        const partes = f.ruta.split('/'), nombre = partes.pop();
        const li = nodo('li', null, 'archivo');
        const cuerpo = nodo('div', null, 'archivo-datos');
        cuerpo.append(nodo('b', nombre, 'archivo-nombre'));
        if (partes.length) cuerpo.append(nodo('span', partes.join('/') + '/', 'archivo-ruta'));
        cuerpo.append(nodo('p', f.descripcion, 'archivo-desc'), nodo('span', `${fecha(f.fecha)} · ${tam(E.archivos.get(f.ruta).size)}`, 'archivo-meta'));
        const bt = nodo('button', 'Descargar', 'boton sec');
        bt.type = 'button';
        bt.setAttribute('aria-label', `Descargar ${nombre}`);
        bt.addEventListener('click', () => descargar(f.ruta, nombre, bt));
        li.append(cuerpo, bt);
        ul.append(li);
      }
      decir(filas.length ? '' : 'Todavía no hay archivos con descripción en entregables/DESCARGAS.md.');
      const extra = [];
      if (sinLinea) extra.push(`Hay ${sinLinea} ${sinLinea === 1 ? 'archivo' : 'archivos'} sin descripción en DESCARGAS.md: no se enseñan.`);
      if (truncado) extra.push('GitHub ha devuelto la lista cortada: puede que falten archivos.');
      if (extra.length) ul.append(nodo('li', extra.join(' '), 'nota'));
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

    /* ---------- subir ---------- */
    const archivoElegido = () => $('subir-archivo').files[0] || null;
    function actualizarSubida() {
      const f = archivoElegido(), nota = $('subir-nota'), pisar = $('subir-pisar-caja');
      const existe = !!f && E.archivos.has('del_arbitro/' + f.name);
      pisar.hidden = !existe;
      let msg = '';
      if (!E.push && E.listo) msg = 'Este token solo puede leer programas-domino. Para subir archivos hace falta el permiso «Contents: Read and write» en ese repositorio.';
      else if (f && !nombreValido(f.name)) msg = 'El nombre del archivo no vale: sin barras, dos puntos, comillas, «?», «#» ni «%», y sin empezar por un punto. Cámbiale el nombre y vuelve a elegirlo.';
      else if (f && f.size === 0) msg = 'Ese archivo está vacío.';
      else if (f && f.size > MAX_SUBIDA) msg = `Ese archivo pesa ${tam(f.size)} y es demasiado grande (el máximo son ${MAX_SUBIDA / 1048576} MB).`;
      else if (f && !descripcionValida($('subir-desc').value)) msg = 'Escribe qué es el archivo: la descripción es obligatoria.';
      else if (existe && !$('subir-pisar').checked) msg = 'Ya hay un archivo con ese nombre en del_arbitro. Marca la casilla si quieres sustituirlo.';
      nota.textContent = msg;
      const bueno = !!f && !msg && (E.push || !E.listo);
      $('subir-boton').disabled = !(bueno || E.linea);
      $('subir-boton').textContent = E.linea ? 'Añadir la línea a DESCARGAS' : 'Subir a programas-domino';
    }

    async function ponerArchivo(ruta, contenido, sha, mensaje) {
      const cuerpo = { message: mensaje, content: contenido, branch: 'main', author: M.AUTOR, committer: M.AUTOR };
      if (sha) cuerpo.sha = sha;
      return M.llamar('prog', `/contents/${rutaUrl(ruta)}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    }
    async function anotarLinea(l) {
      for (let intento = 0; ; intento++) {
        const d = await leerDescargasRepo();
        try { return await ponerArchivo('entregables/DESCARGAS.md', aBase64(new TextEncoder().encode(conLinea(d && d.texto, l.ruta, l.descripcion, l.fecha))), d && d.sha, `Descargas: línea de ${l.ruta}`); }
        catch (e) { if (!(e.estado === 409 || e.estado === 422) || intento) throw e; }
      }
    }
    async function subir() {
      const boton = $('subir-boton');
      boton.disabled = true;
      try {
        if (!E.linea) {
          const f = archivoElegido();
          if (!f) return;
          if (!E.listo && !(await cargar())) return;
          const nombre = f.name, ruta = 'del_arbitro/' + nombre, previo = E.archivos.get(ruta);
          decir(`Subiendo ${nombre}…`);
          const contenido = aBase64(new Uint8Array(await f.arrayBuffer()));
          await ponerArchivo('entregables/' + ruta, contenido, previo && previo.sha, `Subir ${nombre} (del árbitro)`);
          E.linea = { ruta, descripcion: $('subir-desc').value, fecha: fechaHoy() };
        }
        decir('Añadiendo su línea a DESCARGAS…');
        await anotarLinea(E.linea);
        const ruta = E.linea.ruta; E.linea = null;
        $('subir-archivo').value = ''; $('subir-desc').value = ''; $('subir-pisar').checked = false;
        await cargar();
        decir(`Subido a programas-domino (privado), en entregables/${ruta}. Ya sale en la lista.`);
      } catch (e) {
        decir((E.linea ? 'El archivo se ha subido, pero no se ha podido añadir su línea a DESCARGAS. Pulsa el botón para repetirlo. ' : '') + (e instanceof M.ErrorGH ? e.message : 'No se ha podido terminar. Prueba otra vez dentro de un minuto.'));
      } finally { actualizarSubida(); }
    }

    $('archivos-ver').addEventListener('click', cargar);
    $('subir-boton').addEventListener('click', subir);
    for (const id of ['subir-archivo', 'subir-desc', 'subir-pisar']) $(id).addEventListener('input', actualizarSubida);
    $('subir-archivo').addEventListener('change', actualizarSubida);
    actualizarSubida();
  });
})(typeof window !== 'undefined' ? window : globalThis);
