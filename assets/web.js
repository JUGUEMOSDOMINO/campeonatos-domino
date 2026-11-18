/* Campeonatos de dominó · web pública. Lee los JSON del contrato (datos/…), cifrados con la contraseña de la web (assets/cifra.js), y pinta todo como texto. */
(function () {
  'use strict';

  /* ---------- utilidades ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  // Un enlace con esquema (https://…) o de otro origen solo vale si es https; y entonces lleva rel="noopener noreferrer".
  const CON_ESQUEMA = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
  const enlaceSeguro = (v) => !CON_ESQUEMA.test(String(v)) || /^https:\/\/[^\s/]/i.test(String(v));
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'href' && !enlaceSeguro(v)) continue;
      else e.setAttribute(k, v === true ? '' : v);
    }
    if (e.tagName === 'A' && CON_ESQUEMA.test(e.getAttribute('href') || '')) e.setAttribute('rel', 'noopener noreferrer');
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      e.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return e;
  }
  const poner = (cont, ...kids) => cont.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const pad = (n) => String(n).padStart(2, '0');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function partesFecha(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? { a: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function fechaLarga(iso) {
    const f = partesFecha(iso);
    return f ? `${f.d} de ${MESES[f.m - 1]} de ${f.a}` : '';
  }
  const corta = (iso) => { const f = partesFecha(iso); return f ? `${pad(f.d)}/${pad(f.m)}` : ''; };
  function instante(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const signo = (n) => (n == null ? '' : n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');

  const TIPOS = {
    sp: { nombre: 'Super-Prestigio', jornada: 'Jornada', unidad: 'pareja', unidades: 'parejas', gan: 'Encuentros ganados' },
    parejas: { nombre: 'Parejas', jornada: 'Partida', unidad: 'pareja', unidades: 'parejas', gan: 'Partidas ganadas' },
    individual: { nombre: 'Individual', jornada: 'Partida', unidad: 'jugador', unidades: 'jugadores', gan: 'Partidas ganadas' },
  };
  const tipoDe = (t) => TIPOS[t] || TIPOS.parejas;

  /* ---------- datos ---------- */
  const qs = new URLSearchParams(location.search);
  let BASE = 'datos';
  const d = qs.get('d');
  // torneo.html?t=<id>&borrador=1 lee de campeonatos-borradores por la API de GitHub, con el token de este navegador (assets/mesa.js).
  const BORRADOR = qs.get('borrador') === '1' && document.body.dataset.pagina === 'torneo';
  if (d && !BORRADOR && /^datos(\/[a-z0-9_-]+)+$/.test(d)) BASE = d;
  const ES_PRUEBA = BASE !== 'datos';

  function url(pagina, params) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') p.set(k, v);
    if (ES_PRUEBA) p.set('d', BASE);
    if (BORRADOR && pagina === 'torneo.html') p.set('borrador', '1');
    const s = p.toString();
    return pagina + (s ? '?' + s : '');
  }
  // Todo lo publicado es un sobre cifrado: sin la clave no se lee nada, y un archivo en claro no se acepta.
  let CLAVE = null;
  async function leerSobre(ruta, fresco) {
    const r = await fetch(ruta, fresco ? { cache: 'no-cache' } : undefined);
    if (!r.ok) throw new Error(ruta + ' ' + r.status);
    return Cifra.descifrar(CLAVE, await r.json());
  }
  async function leer(ruta, fresco) {
    if (BORRADOR) {
      const f = await window.Mesa.leer('borr', ruta.split('?')[0]);
      if (!f) throw new Error(ruta + ' 404');
      return f.json;
    }
    return JSON.parse(new TextDecoder().decode(await leerSobre(ruta, fresco)));
  }
  const rutaJornada = (id, n, v) => `${BASE}/${id}/jornada_${pad(n)}.json` + (v ? '?v=' + encodeURIComponent(v) : '');

  function bandaPrueba() {
    if (!ES_PRUEBA) return;
    document.body.prepend(el('div', { class: 'banda-prueba' }, 'Datos de prueba: ningún campeonato de esta página existe de verdad.'));
  }

  /* ---------- contraseña ---------- */
  // Mientras no hay clave, «main» enseña solo el candado; al abrir, vuelve lo que había.
  let tapado = null;
  function candado(...kids) {
    const main = $('main');
    if (!tapado) tapado = [...main.childNodes];
    const bus = $('.buscador'); if (bus) bus.hidden = true;
    poner(main, el('section', { id: 'candado', class: 'candado', 'aria-labelledby': 't-candado' }, kids));
  }
  function destapar() {
    if (tapado) $('main').replaceChildren(...tapado);
    tapado = null;
    const bus = $('.buscador'); if (bus) bus.hidden = false;
    const pie = $('.pie-in');
    if (pie && !$('#olvidar-clave')) {
      pie.append(el('p', null, el('button', { type: 'button', id: 'olvidar-clave', class: 'boton sec', onclick: () => { Cifra.olvidarClave(BASE); location.reload(); } }, 'Olvidar contraseña en este dispositivo')));
    }
  }
  function pantallaClave(cj, cambio, listo) {
    const campo = el('input', { id: 'clave', type: 'password', autocomplete: 'current-password', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
    const recordar = el('input', { id: 'recordar', type: 'checkbox', checked: true });
    const msg = el('p', { id: 'clave-msg', class: 'nota', 'aria-live': 'polite' });
    const boton = el('button', { type: 'submit', class: 'boton' }, 'Entrar');
    const form = el('form', { id: 'form-clave' },
      el('label', { for: 'clave' }, 'Contraseña'), campo,
      el('label', { class: 'opcion' }, recordar, el('span', null, 'Recordar en este dispositivo')),
      el('p', { class: 'nota sin-margen' }, 'Si este móvil u ordenador lo usa más gente, desmarca la casilla y la web te la volverá a pedir al cerrar la pestaña.'),
      el('div', { class: 'acciones' }, boton), msg);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      boton.disabled = true; msg.className = 'nota'; msg.textContent = 'Comprobando…';
      let k = null;
      try { k = await Cifra.abrir(campo.value.trim(), cj); } catch (e) { k = null; }
      if (!k) {
        msg.className = 'nota caja'; msg.textContent = 'Esa contraseña no es la correcta. Revísala y vuelve a probar.';
        boton.disabled = false; campo.select(); return;
      }
      await Cifra.guardarClave(BASE, k, recordar.checked);
      CLAVE = k; destapar(); listo(true);
    });
    candado(el('h2', { id: 't-candado' }, 'Esta web tiene contraseña'),
      el('p', null, cambio ? 'La contraseña de la web ha cambiado. Escribe la nueva.' : 'Los resultados solo los ven los jugadores. Escribe la contraseña que te ha dado la mesa de control.'),
      form);
    campo.focus();
  }
  /* Resuelve true cuando hay clave (guardada o recién escrita). Sin datos/clave.json, la web aún no está cifrada: no enseña nada. */
  async function desbloquear() {
    let cj = null;
    try {
      const r = await fetch(`${BASE}/clave.json?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-cache' }); // ?t= salta la caché de Pages tras un cambio de contraseña
      if (r.ok) cj = await r.json(); else if (r.status !== 404) throw new Error(String(r.status));
    } catch (e) {
      candado(el('p', { class: 'aviso alerta' }, 'No se ha podido abrir la web. Comprueba la conexión y prueba otra vez dentro de un minuto.'));
      return false;
    }
    if (!cj) { candado(el('h2', { id: 't-candado' }, 'Estamos preparando la web'), el('p', null, 'Vuelve a entrar dentro de un rato.')); return false; }
    const guardada = await Cifra.cargarClave(BASE);
    if (guardada && await Cifra.comprobar(guardada, cj)) { CLAVE = guardada; destapar(); return true; }
    if (guardada) Cifra.olvidarClave(BASE);
    return new Promise((listo) => pantallaClave(cj, !!guardada, listo));
  }

  /* ---------- nombres ---------- */
  const nombreLargo = (p) => (p.j2_nombre ? `${p.j1_nombre} ${p.j1_apellido1} y ${p.j2_nombre} ${p.j2_apellido1}` : `${p.j1_nombre} ${p.j1_apellido1}`);

  /* =====================================================================
     PORTADA
     ===================================================================== */
  const ESTADOS = { en_juego: 'En juego', proximo: 'Próximo', terminado: 'Terminado' };

  function tarjeta(t) {
    const tp = tipoDe(t.tipo);
    const partes = [`${tp.jornada} ${t.jornada_actual} de ${t.n_jornadas}`, `${t.n_participantes} ${tp.unidades}`];
    if (t.estado === 'terminado' && t.ganador) partes.push(`ganó ${t.ganador.corto}`);
    return el('li', null, el('a', { class: 'tarjeta', href: url('torneo.html', { t: t.id }) },
      el('div', null,
        el('h3', null, t.nombre),
        el('div', { class: 'linea' },
          el('span', { class: 'etiqueta ' + (t.estado === 'en_juego' ? 'vivo' : t.estado === 'terminado' ? 'fin' : '') }, ESTADOS[t.estado] || t.estado),
          tp.nombre + (t.temporada ? ' ' + t.temporada : '') + ' · ' + partes.join(' · ')))));
  }

  async function portada() {
    const lista = $('#lista');
    let indice;
    try {
      indice = await leer(`${BASE}/indice.json`, true);
    } catch (e) {
      lista.replaceChildren(el('p', { class: 'aviso alerta' }, 'No se ha podido cargar la lista de campeonatos. Prueba otra vez dentro de un minuto.'));
      return;
    }
    const ts = indice.torneos || [];
    if (!ts.length) {
      lista.replaceChildren(el('p', { class: 'vacio' }, 'Todavía no hay campeonatos publicados.'));
    } else {
      const grupos = [['en_juego', 'En juego'], ['proximo', 'Próximos'], ['terminado', 'Terminados']];
      lista.replaceChildren(...grupos.flatMap(([est, tit]) => {
        const g = ts.filter((t) => t.estado === est);
        return g.length ? [el('h2', { class: 'seccion' }, tit), el('ul', { class: 'tarjetas' }, g.map(tarjeta))] : [];
      }));
    }
    iniciarBuscador(ts);
    const libro = anuncioLibro();
    libro.hidden = true;

    const btnLibro = el('button', {
      type: 'button',
      class: 'boton',
      onclick: () => {
        libro.hidden = !libro.hidden;
        btnLibro.textContent = libro.hidden ? '+ Ver libro JUGUEMOS DOMINÖ' : '- Ocultar libro';
  }
}, '+ Ver libro JUGUEMOS DOMINÓ');
    lista.after(btnLibro, libro);
 }
  /* ---------- buscador de jugador ---------- */
  function iniciarBuscador(torneos) {
    const entrada = $('#buscar');
    const salida = $('#resultados');
    let cargado = null; // promesa con los actual.json
    const cargar = () => cargado || (cargado = Promise.all(torneos.map((t) =>
      leer(`${BASE}/${t.id}/actual.json`, true).catch(() => null))).then((x) => x.filter(Boolean)));

    // quién jugó dónde: una entrada por persona y torneo
    function personasDe(a) {
      const out = [];
      const subs = a.sustituciones || [];
      for (const p of a.participantes) {
        for (const lado of [['j1_nombre', 'j1_apellido1'], ['j2_nombre', 'j2_apellido1']]) {
          if (!p[lado[0]]) continue;
          const sub = subs.find((s) => s.id === p.id && s.entra_nombre === p[lado[0]] && s.entra_apellido1 === p[lado[1]]);
          out.push({ nombre: p[lado[0]], ap: p[lado[1]], p, nota: sub ? { tipo: 'entra', s: sub } : null });
        }
      }
      for (const s of subs) {
        const p = a.participantes.find((x) => x.id === s.id);
        if (p) out.push({ nombre: s.sale_nombre, ap: s.sale_apellido1, p, nota: { tipo: 'sale', s } });
      }
      return out;
    }

    async function puestoDe(a, id) {
      const js = a.jornadas || [];
      const ult = js.filter((j) => j.completa).map((j) => j.numero).sort((x, y) => y - x)[0];
      if (!ult) return null;
      let jd = a;
      if (!(a.jornada.numero === ult && a.jornada.completa)) {
        try { const meta = js.find((j) => j.numero === ult); jd = await leer(rutaJornada(a.torneo.id, ult, meta && meta.publicado)); } catch (e) { return null; }
      }
      const fila = jd.clasificacion.find((r) => r.id === id);
      return fila ? { puesto: fila.puesto, grupo: fila.grupo, hay_b: jd.clasificacion.some((r) => r.grupo === 'B'), jornada: ult, n: jd.clasificacion.filter((r) => r.grupo === fila.grupo).length } : null;
    }

    async function buscar() {
      const q = norm(entrada.value).split(/\s+/).filter(Boolean);
      if (entrada.value.trim().length < 2) { salida.replaceChildren(); return; }
      salida.replaceChildren(el('p', { class: 'aviso' }, 'Buscando…'));
      const todos = await cargar();
      if (norm(entrada.value).split(/\s+/).filter(Boolean).join(' ') !== q.join(' ')) return; // el usuario ya escribió otra cosa
      const grupos = new Map();
      for (const a of todos) {
        for (const per of personasDe(a)) {
          const clave = norm(per.nombre + ' ' + per.ap);
          if (!q.every((w) => clave.includes(w))) continue;
          if (!grupos.has(clave)) grupos.set(clave, { nombre: `${per.nombre} ${per.ap}`, items: [] });
          grupos.get(clave).items.push({ a, per });
        }
      }
      if (!grupos.size) {
        salida.replaceChildren(el('p', { class: 'aviso' }, 'No hay nadie con ese nombre en los campeonatos publicados.'));
        return;
      }
      const tarjetas = [...grupos.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')).map((g) => {
        const ul = el('ul');
        g.items.sort((x, y) => (y.a.torneo.fecha || '').localeCompare(x.a.torneo.fecha || ''));
        for (const { a, per } of g.items) {
          const t = a.torneo, tp = tipoDe(t.tipo);
          const compa = a.participantes.length && per.p.j2_nombre
            ? [[per.p.j1_nombre, per.p.j1_apellido1], [per.p.j2_nombre, per.p.j2_apellido1]].filter((x) => !(x[0] === per.nombre && x[1] === per.ap)).map((x) => x.join(' ')).join('') : '';
          const detalle = el('span', null);
          const linea = [`${tp.unidad[0].toUpperCase() + tp.unidad.slice(1)} ${per.p.id}`];
          if (per.p.corto && t.tipo !== 'individual') linea.push(per.p.corto);
          if (compa && !per.nota) linea.push(`con ${compa}`);
          detalle.append(linea.join(' · '));
          if (per.nota) {
            const s = per.nota.s;
            detalle.append(el('span', null, per.nota.tipo === 'sale'
              ? `Jugó hasta la ${tp.jornada.toLowerCase()} ${s.desde - 1}; le sustituyó ${s.entra_nombre} ${s.entra_apellido1}.`
              : `Entró en la ${tp.jornada.toLowerCase()} ${s.desde} en lugar de ${s.sale_nombre} ${s.sale_apellido1}.`));
          }
          const pu = el('span', { class: 'puesto' }, '…');
          detalle.append(pu);
          puestoDe(a, per.p.id).then((r) => {
            const campeon = r && r.puesto === 1 && r.grupo === 'A' && t.estado === 'terminado';
            pu.textContent = !r ? 'Aún sin clasificación' : (campeon ? 'Campeones · ' : '') + `${r.puesto}.º${r.hay_b ? ' del grupo ' + r.grupo : ''} de ${r.n} tras la ${tp.jornada.toLowerCase()} ${r.jornada}`;
          });
          ul.append(el('li', null, el('a', { href: url('torneo.html', { t: t.id, ver: 'clasificacion', p: per.p.id }) },
            el('b', null, t.nombre + (t.temporada ? ' · ' + t.temporada : '')), detalle)));
        }
        return el('div', { class: 'persona' }, el('h3', null, g.nombre), ul);
      });
      salida.replaceChildren(...tarjetas);
    }
    let espera;
    entrada.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(buscar, 180); });
    entrada.addEventListener('focus', cargar, { once: true });
  }

  /* =====================================================================
     PÁGINA DE TORNEO
     ===================================================================== */
  const PESTANAS = [['resumen', 'Resumen'], ['clasificacion', 'Clasificación'], ['mesas', 'Partidas'], ['parejas', 'Parejas'], ['folleto', 'Calendario'], ['normativa', 'Bases del campeonato']];
  const ANTIGUAS = { emparejamientos: 'mesas', resultados: 'mesas', linea: 'folleto' }; // enlaces de antes del cambio de pestañas
  const E = { id: null, actual: null, cache: new Map(), ver: 'resumen', j: null, g: 'A', p: null, q: '', quien: '' };

  function leerUrl() {
    const x = new URLSearchParams(location.search);
    E.id = x.get('t');
    const v = ANTIGUAS[x.get('ver')] || x.get('ver');
    E.ver = PESTANAS.some((t) => t[0] === v) ? v : 'resumen';
    E.j = +x.get('j') || null;
    E.g = x.get('g') === 'B' ? 'B' : 'A';
    E.p = +x.get('p') || null;
  }
  function irA(cambios, empujar) {
    Object.assign(E, cambios);
    const nueva = url('torneo.html', { t: E.id, ver: E.ver === 'resumen' ? '' : E.ver, j: E.j, g: E.g === 'B' ? 'B' : '', p: E.p });
    if (empujar) history.pushState(null, '', nueva); else history.replaceState(null, '', nueva);
    pintar();
  }

  const jornadasDe = (a) => (a.jornadas && a.jornadas.length ? a.jornadas : [{ numero: a.jornada.numero, completa: a.jornada.completa, publicado: a.publicado }]).slice().sort((x, y) => x.numero - y.numero);
  const ultimaCompleta = (a) => { const c = jornadasDe(a).filter((j) => j.completa); return c.length ? c[c.length - 1].numero : null; };
  // En vivo (como el Excel): en cuanto la jornada publicada tiene un resultado, su clasificación es la que se ve,
  // con ⏳ en quien aún no ha jugado (`pendiente`, cifras de antes). Sin resultados, se ve la última cerrada.
  const conResultado = (jd) => !jd.jornada.completa && jd.emparejamientos.some((m) => ['jugada', 'incomparecencia', 'nd'].includes(m.estado));

  async function datosJornada(n) {
    const a = E.actual;
    if (n === a.jornada.numero) return a;
    if (E.cache.has(n)) return E.cache.get(n);
    const meta = jornadasDe(a).find((j) => j.numero === n);
    const jd = await leer(rutaJornada(E.id, n, meta && meta.publicado));
    E.cache.set(n, jd);
    return jd;
  }

  function cabecera() {
    const a = E.actual, t = a.torneo, tp = tipoDe(t.tipo);
    document.title = t.nombre;
    const datos = [t.tipo === 'sp' ? null : fechaLarga(t.fecha), t.temporada && 'Temporada ' + t.temporada, t.lugar, `${t.n_participantes} ${tp.unidades}`, `${tp.jornada} ${a.jornada.numero} de ${t.n_jornadas}`].filter(Boolean);
    $('#cab').replaceChildren(
      el('div', null, el('span', { class: 'etiqueta ' + (t.estado === 'en_juego' ? 'vivo' : t.estado === 'terminado' ? 'fin' : '') }, ESTADOS[t.estado] || t.estado), el('span', { class: 'etiqueta' }, tp.nombre)),
      el('h1', null, t.nombre),
      el('p', { class: 'linea' }, datos.join(' · ')),
      el('p', { class: 'sello' }, `Datos publicados el ${instante(a.publicado)}.` + (t.estado === 'en_juego' ? ' Esta página se actualiza sola.' : '')));
  }

  function pestanas() {
    const ind = E.actual.torneo.tipo === 'individual';
    $('#pestanas').replaceChildren(...PESTANAS.map(([k, txt]) => el('a', {
      href: url('torneo.html', { t: E.id, ver: k === 'resumen' ? '' : k, p: E.p }), 'aria-current': E.ver === k ? 'page' : null,
      onclick: (ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return; ev.preventDefault(); irA({ ver: k, j: null }, true); },
    }, k === 'parejas' && ind ? 'Jugadores' : txt)));
  }

  // "Jornada N · se juega del dd/mm al dd/mm"; nada si el JSON no trae el plazo
  function plazo(jd, tp) {
    const j = jd.jornada, d = corta(j.plazo_desde), h = corta(j.plazo_hasta);
    return d && h ? el('p', { class: 'plazo' }, `${tp.jornada} ${j.numero} · se juega del ${d} al ${h}`) : null;
  }

  function selectorJornada(lista, actualN, tp, alElegir) {
    return el('div', { class: 'jornadas', role: 'group', 'aria-label': tp.jornada }, el('span', { class: 'rot' }, tp.jornada),
      lista.map((j) => el('button', {
        type: 'button', 'aria-pressed': String(j.numero === actualN), class: j.completa ? '' : 'curso',
        title: j.completa ? null : 'En juego', onclick: () => alElegir(j.numero),
      }, j.numero)));
  }

  /* ----- resumen: podio y «¿Quién eres?» ----- */
  const ORD = (n) => n + '.º';
  const nombresDe = (p) => [[p.j1_nombre, p.j1_apellido1], [p.j2_nombre, p.j2_apellido1]].filter((x) => x[0]).map((x) => x.join(' '));
  // La misma jornada que enseña Clasificación: la que está en juego con algún resultado, o la última cerrada.
  const jornadaClasif = (a) => (conResultado(a) ? a.jornada.numero : ultimaCompleta(a));
  const cifraCorta = (r, sp, tp) => `${r.gan} de ${r.jug} ${sp ? 'encuentros' : 'partidas'} · ${signo(r.dt)} puntos`;

  function tarjetaPodio(r, byId, tp, sp) {
    const p = byId.get(r.id) || { corto: '#' + r.id };
    return el('li', { class: 'podio-tarjeta', 'data-puesto': r.puesto, 'data-id': r.id },
      el('span', { class: 'podio-n', 'aria-label': `Puesto ${r.puesto}` }, r.puesto),
      el('span', { class: 'podio-par' }, `${cap(tp.unidad)} ${r.id}`, p.ret ? el('span', { class: 'etq alerta' }, 'Retirada') : null),
      el('span', { class: 'podio-nombres' }, p.j1_nombre ? nombresDe(p).map((x) => el('span', null, x)) : el('span', null, p.corto)),
      el('span', { class: 'podio-cifra' }, cifraCorta(r, sp, tp)));
  }
  const cap = (t) => t[0].toUpperCase() + t.slice(1);

  // Qué le toca a este participante en la jornada publicada, dicho en una frase.
  function lineaMesa(a, id, byId) {
    const sp = a.torneo.tipo === 'sp', tp = tipoDe(a.torneo.tipo);
    const m = a.emparejamientos.find((x) => x.izq.includes(id) || x.dcha.includes(id));
    if (!m) return null;
    const j = `${tp.jornada} ${a.jornada.numero}`;
    if (m.estado === 'descanso') return `${j}: descansa.`;
    if (m.estado === 'ausencia') return `${j}, mesa ${m.mesa}: falta alguien en la mesa.`;
    const izq = m.izq.includes(id), rivales = (izq ? m.dcha : m.izq).map((i) => (byId.get(i) || {}).corto || i).join(' y ');
    const base = `${j}, mesa ${m.mesa}${rivales ? ' contra ' + rivales : ''}`;
    if (m.estado === 'pendiente') return `${base}. Por jugar.`;
    if (m.estado === 'jugada' && m.p_izq != null) {
      const [pf, pc, tf, tc] = izq ? [m.p_izq, m.p_dcha, m.t_izq, m.t_dcha] : [m.p_dcha, m.p_izq, m.t_dcha, m.t_izq];
      const gana = sp ? pf > pc : tf > tc;
      return `${base}: ${gana ? 'ganada' : 'perdida'} ${sp ? `${pf}-${pc} (${tf}-${tc} en tantos)` : `${tf}-${tc}`}.`;
    }
    return `${base}: ${(ETIQUETAS[m.estado] || m.estado).toLowerCase()}.`;
  }

  // Una fila por jornada publicada: rival, resultado y puntos, con los nombres de esa jornada.
  function filaHistorial(jd, id, tp, sp, conNombres) {
    const m = jd.emparejamientos.find((x) => x.izq.includes(id) || x.dcha.includes(id));
    const byId = new Map(jd.participantes.map((x) => [x.id, x]));
    const cab = el('span', { class: 'hist-j' }, `${tp.jornada} ${jd.jornada.numero}`);
    const yo = byId.get(id);
    const quien = conNombres && yo ? el('small', { class: 'hist-quien' }, 'Jugaban: ' + nombresDe(yo).join(' y ')) : null;
    if (!m) return el('li', { class: 'hist' }, cab, el('span', { class: 'hist-res' }, 'Sin mesa en esta ' + tp.jornada.toLowerCase()), quien);
    const izq = m.izq.includes(id);
    const rivales = (izq ? m.dcha : m.izq).map((i) => (byId.get(i) || {}).corto || i).join(' y ');
    const [pf, pc, tf, tc] = izq ? [m.p_izq, m.p_dcha, m.t_izq, m.t_dcha] : [m.p_dcha, m.p_izq, m.t_dcha, m.t_izq];
    const marcador = tf != null ? `${tf}-${tc}` : '';
    let res, pts = marcador;
    if (m.estado === 'pendiente') { res = 'Por jugar'; pts = ''; }
    else if (m.estado === 'jugada' && pf != null) res = `${(sp ? pf > pc : tf > tc) ? 'Ganada' : 'Perdida'}${sp ? ` ${pf}-${pc}` : ''}`;
    else res = (ETIQUETAS[m.estado] || m.estado) + (tf != null && tf !== tc && m.estado !== 'descanso' ? (tf > tc ? ' · ganada' : ' · perdida') : '');
    return el('li', { class: 'hist' }, cab,
      el('span', { class: 'hist-rival' }, m.mesa ? `Mesa ${m.mesa}` : null, m.mesa && rivales ? ' · ' : null, rivales ? 'contra ' + rivales : null),
      el('span', { class: 'hist-res', title: TITULOS[m.estado] || null }, res),
      pts ? el('span', { class: 'hist-pts' }, pts, el('span', { class: 'solo-lector' }, ' tantos')) : null, quien);
  }
  async function cargarHistorial(a, id, cont) {
    const tp = tipoDe(a.torneo.tipo), sp = a.torneo.tipo === 'sp';
    const conNombres = (a.sustituciones || []).some((s) => s.id === id);
    const filas = [];
    for (const j of jornadasDe(a).filter((x) => x.numero <= a.jornada.numero)) {
      let jd = null;
      try { jd = await datosJornada(j.numero); } catch (e) { /* se avisa en su fila */ }
      filas.push(jd ? filaHistorial(jd, id, tp, sp, conNombres) : el('li', { class: 'hist' }, el('span', { class: 'hist-j' }, `${tp.jornada} ${j.numero}`), el('span', { class: 'hist-res' }, 'No se ha podido cargar')));
    }
    cont.replaceChildren(...(filas.length ? [el('h3', { class: 'hist-tit' }, `${tp.jornada} a ${tp.jornada.toLowerCase()}`), el('ol', { class: 'historial' }, filas)] : []));
  }

  function fichaPersona(a, p, fila, jn, byIdActual, mia, alElegir, alOlvidar) {
    const tp = tipoDe(a.torneo.tipo), sp = a.torneo.tipo === 'sp';
    const subs = (a.sustituciones || []).filter((s) => s.id === p.id);
    const puesto = fila
      ? `${ORD(fila.puesto)}${a.clasificacion.some((r) => r.grupo === 'B') ? ' del grupo ' + fila.grupo : ''} tras la ${tp.jornada.toLowerCase()} ${jn}. ${cifraCorta(fila, sp, tp)}.`
      : 'Todavía no tiene clasificación.';
    const mesa = lineaMesa(a, p.id, byIdActual);
    const enlace = (ver, txt) => el('a', { href: url('torneo.html', { t: E.id, ver, p: p.id }) }, txt);
    const hist = el('div', { class: 'ficha-hist' }, el('p', { class: 'nota sin-margen' }, 'Cargando el historial…'));
    cargarHistorial(a, p.id, hist);
    return el('li', { class: 'ficha' + (mia ? ' mia' : ''), 'data-id': p.id },
      el('div', { class: 'ficha-cab' },
        el('span', { class: 'ficha-num' }, el('i', null, cap(tp.unidad)), el('b', null, p.id)),
        el('span', { class: 'ficha-quien' }, nombresDe(p).map((x) => el('span', { class: 'nom' }, x)),
          p.ret ? el('span', { class: 'etq alerta' }, 'Retirada') : null)),
      el('p', null, puesto),
      mesa ? el('p', null, mesa) : null,
      hist,
      subs.map((s) => el('p', { class: 'nota sin-margen' }, `Cambio en la ${tp.jornada.toLowerCase()} ${s.desde}: entra ${s.entra_nombre} ${s.entra_apellido1} por ${s.sale_nombre} ${s.sale_apellido1}.`)),
      el('p', { class: 'ficha-enlaces' }, enlace('clasificacion', 'Ver en la clasificación'), enlace('mesas', 'Ver su mesa'),
        mia ? el('button', { type: 'button', class: 'boton sec', onclick: alOlvidar }, 'No soy yo')
          : el('button', { type: 'button', class: 'boton sec', onclick: () => alElegir(p.id) }, 'Soy yo')));
  }

  const MAX_FICHAS = 6;
  function buscadorQuien(a, jd, n) {
    const tp = tipoDe(a.torneo.tipo);
    const byId = new Map(a.participantes.map((p) => [p.id, p]));
    const filas = new Map((jd ? jd.clasificacion : []).map((r) => [r.id, r]));
    const campo = el('input', { type: 'search', id: 'quien', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'Tu nombre o tu número', value: E.quien });
    const salida = el('ul', { id: 'quien-res', class: 'fichas', 'aria-live': 'polite' });
    const mio = el('ul', { id: 'quien-mia', class: 'fichas' });
    const guardado = () => { const id = window.Cifra.quienGuardado(E.id); return a.participantes.find((x) => x.id === id) || null; };
    function pintarMia() {
      const p = guardado();
      mio.replaceChildren(...(p ? [fichaPersona(a, p, filas.get(p.id), n, byId, true, null, () => { window.Cifra.olvidarQuien(E.id); pintarMia(); buscar(); })] : []));
    }
    const elegir = (id) => { window.Cifra.guardarQuien(E.id, id); campo.value = ''; E.quien = ''; pintarMia(); buscar(); mio.scrollIntoView({ block: 'nearest' }); };
    const aviso = el('p', { class: 'nota', 'aria-live': 'polite' });
    // Un número es el de la pareja o jugador, exacto. Lo demás se busca como trozo del nombre, sin tildes ni mayúsculas.
    const claves = a.participantes.map((p) => ({ p, t: norm(nombresDe(p).join(' ')) }));
    function buscar() {
      E.quien = campo.value;
      const q = norm(campo.value).split(/\s+/).filter(Boolean);
      aviso.textContent = '';
      if (!q.length) { salida.replaceChildren(); return; }
      const num = q.length === 1 && /^\d+$/.test(q[0]);
      if (!num && q.join('').length < 2) { salida.replaceChildren(); aviso.textContent = 'Escribe al menos dos letras.'; return; }
      const hay = claves.filter(({ p, t }) => (num ? p.id === +q[0] : q.every((w) => t.includes(w)))).map((x) => x.p).sort((x, y) => x.id - y.id);
      if (!hay.length) { salida.replaceChildren(); aviso.textContent = num ? `No encuentro ${tp.unidad === 'jugador' ? 'al jugador' : 'a la pareja'} ${q[0]}.` : 'No encuentro a nadie con ese nombre. Prueba con menos letras o con tu número.'; return; }
      const yo = guardado();
      salida.replaceChildren(...hay.slice(0, MAX_FICHAS).filter((p) => !yo || p.id !== yo.id).map((p) => fichaPersona(a, p, filas.get(p.id), n, byId, false, elegir)));
      if (yo && hay.length === 1 && hay[0].id === yo.id) aviso.textContent = 'Esa es tu ficha, la de arriba.';
      if (hay.length > MAX_FICHAS) aviso.textContent = `Hay ${hay.length} coincidencias y se enseñan ${MAX_FICHAS}. Escribe más letras para afinar.`;
    }
    campo.addEventListener('input', buscar);
    const bloque = el('section', { class: 'quien', 'aria-labelledby': 't-quien' },
      el('label', { for: 'quien', id: 't-quien' }, '¿Quién eres?'),
      el('p', { class: 'nota sin-margen' }, 'Escribe tu nombre o tu número y mira cómo vas.'),
      mio, campo, aviso, salida);
    pintarMia();
    return { bloque, buscar };
  }

  async function pintarResumen(cont) {
    const a = E.actual, tp = tipoDe(a.torneo.tipo), sp = a.torneo.tipo === 'sp';
    const n = jornadaClasif(a);
    let jd = null;
    if (n) {
      try { jd = await datosJornada(n); } catch (e) { cont.replaceChildren(el('p', { class: 'aviso alerta' }, 'No se ha podido cargar el resumen. Prueba otra vez dentro de un minuto.')); return; }
      if (E.ver !== 'resumen') return;
    }
    const top = jd ? jd.clasificacion.filter((r) => r.grupo === 'A').slice(0, 3) : [];
    const byId = new Map((jd ? jd.participantes : []).map((p) => [p.id, p]));
    const podio = top.length
      ? el('section', { class: 'podio-seccion', 'aria-labelledby': 't-podio' },
        el('h2', { class: 'sub', id: 't-podio' }, a.torneo.estado === 'terminado' ? 'Podio final' : `Podio tras la ${tp.jornada.toLowerCase()} ${n}${jd.jornada.completa ? '' : ' (en juego)'}`),
        el('ol', { class: 'podio' }, top.map((r) => tarjetaPodio(r, byId, tp, sp))))
      : el('p', { class: 'vacio' }, `El podio aparecerá cuando haya resultados de la ${tp.jornada.toLowerCase()} 1.`);
    const { bloque, buscar } = buscadorQuien(a, jd, n);
    poner(cont, podio, bloque);
    if (E.quien) buscar();
  }

  /* ----- clasificación ----- */
  // Caja desplazable en horizontal; la clase «mas» enciende la sombra del borde derecho mientras quede tabla por ver.
  function marco(tabla) {
    const caja = el('div', { class: 'tabla-caja' }, tabla), m = el('div', { class: 'tabla-marco' }, caja);
    const ver = () => m.classList.toggle('mas', caja.scrollLeft + caja.clientWidth < caja.scrollWidth - 1);
    caja.addEventListener('scroll', ver, { passive: true });
    new ResizeObserver(ver).observe(caja);
    return m;
  }
  async function pintarClasificacion(cont) {
    const a = E.actual, tp = tipoDe(a.torneo.tipo);
    const ult = ultimaCompleta(a);
    const vivo = conResultado(a) ? a.jornada.numero : null;
    if (!ult && !vivo) {
      cont.replaceChildren(el('p', { class: 'vacio' }, `La clasificación aparecerá cuando se cierre la ${tp.jornada.toLowerCase()} 1.` + (a.jornada.numero === 1 ? ' Mientras tanto, mira los emparejamientos y los resultados que van llegando.' : '')));
      return;
    }
    const completas = jornadasDe(a).filter((j) => j.completa || j.numero === vivo);
    const n = completas.some((j) => j.numero === E.j) ? E.j : (vivo || ult);
    let jd;
    try { jd = await datosJornada(n); } catch (e) { cont.replaceChildren(el('p', { class: 'aviso alerta' }, 'No se ha podido cargar esa clasificación. Prueba otra vez dentro de un minuto.')); return; }
    if (E.ver !== 'clasificacion') return;
    const byId = new Map(jd.participantes.map((p) => [p.id, p]));
    const sp = a.torneo.tipo === 'sp';
    const conB = jd.clasificacion.some((r) => r.grupo === 'B');
    const g = conB ? E.g : 'A';
    const filas = jd.clasificacion.filter((r) => r.grupo === g);
    const subs = (jd.sustituciones || []);

    // Como en el Excel: CLAS., PAREJA (nº), NOMBRE y después las cifras en este orden. Las tres primeras quedan fijas al desplazar.
    const cols = sp
      ? [['jug', 'ENC.J', 'Encuentros jugados'], ['gan', 'ENC.G', tp.gan], ['dp', 'DIF. P.', 'Diferencia de partidas'], ['dt', 'DIF. PUNT.', 'Diferencia de puntos'], ['pg', 'P. G.', 'Partidas ganadas'], ['pp', 'P. P.', 'Partidas perdidas'], ['tf', 'PUNT. F.', 'Puntos a favor'], ['tc', 'PUNT. C.', 'Puntos en contra']]
      : [['gan', 'P. G.', tp.gan], ['dt', 'DIF. PUNT.', 'Diferencia de puntos'], ['tf', 'PUNT. F.', 'Puntos a favor'], ['jug', 'P. J.', 'Partidas jugadas'], ['tc', 'PUNT. C.', 'Puntos en contra']];

    const cuerpo = filas.map((r) => {
      const p = byId.get(r.id) || { corto: '#' + r.id };
      const sub = subs.find((s) => s.id === r.id);
      const sub2 = [p.zona, p.j1_nombre && nombreLargo(p)].filter(Boolean).join(' · ');
      return el('tr', { class: (p.ret ? 'ret ' : '') + (E.p === r.id ? 'resalte' : ''), id: 'fila-' + r.id },
        el('td', null, el('span', { class: 'puesto' + (r.puesto <= 3 ? ' p' + r.puesto : '') }, r.puesto)),
        el('td', { class: 'num-par' }, r.id),
        el('td', { class: 'pareja' },
          el('span', { class: 'nom' }, p.corto, p.ret ? el('span', { class: 'etq alerta' }, 'Retirada') : null,
            r.pendiente && !jd.jornada.completa ? el('span', { class: 'etq pend', title: `Todavía no ha jugado la ${tp.jornada.toLowerCase()} ${n}` }, '⏳') : null),
          sub2 ? el('span', { class: 'sub' }, sub2) : null,
          sub ? el('span', { class: 'sub' }, `Cambio en la ${tp.jornada.toLowerCase()} ${sub.desde}: entra ${sub.entra_nombre} ${sub.entra_apellido1} por ${sub.sale_nombre} ${sub.sale_apellido1}`) : null),
        cols.map(([k]) => el('td', { class: k === 'gan' ? 'gan' : null }, k === 'dp' || k === 'dt' ? signo(r[k]) : r[k])));
    });
    const tabla = el('table', { class: 'clasi' },
      el('caption', { class: 'solo-lector' }, `Clasificación del grupo ${g} tras la ${tp.jornada.toLowerCase()} ${n}`),
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, el('abbr', { title: 'Clasificación' }, 'CLAS.')), el('th', { scope: 'col' }, el('abbr', { title: 'Número de ' + tp.unidad }, tp.unidad.toUpperCase())), el('th', { scope: 'col', class: 'izq' }, 'NOMBRE'),
        cols.map(([, t, ab]) => el('th', { scope: 'col' }, el('abbr', { title: ab }, t))))),
      el('tbody', null, cuerpo));
    const leyenda = cols.map(([, t, ab]) => `${t}: ${ab.toLowerCase()}`).join(' · ');

    poner(cont,
      selectorJornada(completas, n, tp, (x) => irA({ j: x }, false)),
      conB ? el('div', { class: 'grupos', role: 'group', 'aria-label': 'Grupo' }, ['A', 'B'].map((x) => el('button', { type: 'button', 'aria-pressed': String(g === x), onclick: () => irA({ g: x }, false) }, 'Grupo ' + x))) : null,
      plazo(jd, tp),
      n === vivo ? el('p', { class: 'nota caja' }, `${tp.jornada} ${n} en juego: la clasificación se actualiza con cada resultado. ⏳ = todavía no ha jugado esta ${tp.jornada.toLowerCase()} (lleva sus cifras de antes).`) : null,
      n !== vivo && n === ult && !a.jornada.completa && !vivo ? el('p', { class: 'nota caja' }, `Esta clasificación es la de la ${tp.jornada.toLowerCase()} ${ult}, la última cerrada. En cuanto llegue el primer resultado de la ${tp.jornada.toLowerCase()} ${a.jornada.numero}, la clasificación se verá en vivo.`) : null,
      filas.length ? marco(tabla) : el('p', { class: 'vacio' }, 'Este grupo todavía no tiene clasificación.'),
      el('p', { class: 'leyenda' }, leyenda));
    const f = E.p && $('#fila-' + E.p);
    if (f && !E.yaDesplazado) { E.yaDesplazado = true; f.scrollIntoView({ block: 'center' }); }
  }

  /* ----- mesas: una tarjeta por mesa, con resultado ----- */
  const ETIQUETAS = { incomparecencia: 'Incomparecencia', nd: 'ND', descanso: 'Descansa', retirada: 'Retirada', ausencia: 'Falta alguien', no_cuenta: 'No cuenta' };
  const TITULOS = { nd: 'No disputado', incomparecencia: 'Una pareja no se presentó', retirada: 'La pareja rival se ha retirado', descanso: 'Sin rival esta jornada', ausencia: 'Falta algún jugador en la mesa', no_cuenta: 'Esta mesa no cuenta' };

  function ladoEl(ids, byId, gana) {
    return el('div', { class: 'lado' + (gana ? ' gana' : '') }, ids.map((id) => {
      const p = byId.get(id);
      return el('div', { class: 'pa' }, el('span', { class: 'n' }, id),
        el('span', { class: 'quien' }, el('span', { class: 'nom' }, p ? p.corto : '?'),
          p && p.ret ? el('span', { class: 'etq alerta' }, 'Retirada') : null,
          p && p.j2_nombre ? el('small', null, nombreLargo(p)) : null),
        gana ? el('span', { class: 'gana-marca', title: 'Ganadora' }, '✓', el('span', { class: 'solo-lector' }, ' ganadora')) : null);
    }));
  }
  function qBusqueda(m, byId) {
    const ids = [...m.izq, ...m.dcha];
    return norm(ids.map((i) => { const p = byId.get(i); return i + ' ' + (p ? nombreLargo(p) + ' ' + p.corto : ''); }).join(' ') + ' mesa ' + (m.mesa || ''));
  }
  // Resultado: partidas (2-1) y tantos (600-472) en el SP; solo tantos en los demás. Un estado raro lleva su etiqueta en lugar de cifras.
  function resultado(m, sp) {
    if (m.estado === 'pendiente') return el('div', { class: 'res' }, el('span', { class: 'por', title: 'Por jugar' }, '⏳'), el('small', null, 'por jugar'));
    if (m.estado === 'jugada' && m.p_izq != null) {
      return el('div', { class: 'res' }, el('b', null, sp ? `${m.p_izq}-${m.p_dcha}` : `${m.t_izq}-${m.t_dcha}`), sp ? el('small', null, `${m.t_izq}-${m.t_dcha} tantos`) : null);
    }
    return el('div', { class: 'res' }, el('span', { class: 'etiq-estado ' + m.estado, title: TITULOS[m.estado] || null }, ETIQUETAS[m.estado] || m.estado));
  }
  function tarjetaMesa(m, byId, a) {
    const sp = a.torneo.tipo === 'sp';
    const jugada = m.estado === 'jugada' && m.p_izq != null;
    const gIzq = jugada && (sp ? m.p_izq > m.p_dcha : m.t_izq > m.t_dcha), gDcha = jugada && (sp ? m.p_dcha > m.p_izq : m.t_dcha > m.t_izq);
    const mia = E.p && [...m.izq, ...m.dcha].includes(E.p);
    const desc = m.estado === 'descanso';
    const aus = m.estado === 'ausencia' && m.ausentes.length ? el('small', { class: 'sub' }, 'Falta: ' + m.ausentes.map((i) => (byId.get(i) || {}).corto || i).join(', ')) : null;
    return el('li', { class: 'mesa' + (mia ? ' resalte' : '') + (desc ? ' descanso' : ''), 'data-q': qBusqueda(m, byId), id: mia ? 'mesa-mia' : null },
      el('div', { class: 'cab-mesa' },
        desc ? el('span', { class: 'num-mesa sin' }, 'Descanso') : el('span', { class: 'num-mesa' }, el('i', null, 'Mesa'), el('b', null, m.mesa)),
        resultado(m, sp)),
      el('div', { class: 'lados' }, ladoEl(m.izq, byId, gIzq), desc ? null : ladoEl(m.dcha, byId, gDcha), aus));
  }
  function aplicarFiltro() {
    const q = norm(E.q), cont = $('#contenido');
    const filas = [...cont.querySelectorAll('li.mesa')];
    let visibles = 0;
    for (const li of filas) {
      const ok = !q || (/^\d+$/.test(q) ? li.dataset.q.split(' ').includes(q) : li.dataset.q.includes(q));
      li.hidden = !ok;
      if (ok) visibles++;
    }
    const sin = $('#sin-coincidencias');
    if (sin) sin.hidden = visibles > 0 || !filas.length;
  }
  function filtro() {
    const campo = el('input', { type: 'search', id: 'filtro', autocomplete: 'off', placeholder: 'Busca tu nombre, tu apellido o tu número', value: E.q, 'aria-label': 'Buscar en esta jornada' });
    campo.addEventListener('input', () => { E.q = campo.value; aplicarFiltro(); });
    return el('div', { class: 'filtro' }, campo);
  }

  async function pintarMesas(cont) {
    const a = E.actual, tp = tipoDe(a.torneo.tipo);
    const lista = jornadasDe(a);
    const n = lista.some((j) => j.numero === E.j) ? E.j : a.jornada.numero;
    let jd;
    try { jd = await datosJornada(n); } catch (e) { cont.replaceChildren(el('p', { class: 'aviso alerta' }, 'No se ha podido cargar esa ' + tp.jornada.toLowerCase() + '. Prueba otra vez dentro de un minuto.')); return; }
    if (E.ver !== 'mesas') return;
    const byId = new Map(jd.participantes.map((p) => [p.id, p]));
    const ms = jd.emparejamientos;
    const grupos = [...new Set(ms.map((m) => m.grupo))];
    const pend = ms.filter((m) => m.estado === 'pendiente').length;
    const hechas = ms.filter((m) => m.estado !== 'pendiente' && m.estado !== 'descanso').length;
    const avisos = [];
    if (jd.jornada.sorteo && jd.jornada.sin_sortear) avisos.push('El sorteo todavía no se ha hecho: este orden es provisional.');
    else if (jd.jornada.emparejamiento === 'provisional' && !jd.jornada.completa) avisos.push('Estos emparejamientos todavía no están fijados y pueden cambiar.');
    if (!jd.jornada.completa && pend) avisos.push(`${hechas ? (hechas === 1 ? 'Hay 1 mesa con resultado' : `Hay ${hechas} mesas con resultado`) : 'Todavía no hay resultados'} y faltan ${pend}. ⏳ = por jugar.`);
    const secciones = ms.length ? grupos.flatMap((g) => [
      grupos.length > 1 ? el('h2', { class: 'grupo-tit' }, 'Grupo ' + g) : null,
      el('ul', { class: 'mesas' }, ms.filter((m) => m.grupo === g).map((m) => tarjetaMesa(m, byId, a)))]) : [el('p', { class: 'vacio' }, 'Todavía no hay emparejamientos publicados.')];
    poner(cont, selectorJornada(lista, n, tp, (x) => irA({ j: x }, false)), plazo(jd, tp), filtro(),
      avisos.map((t) => el('p', { class: 'nota caja' }, t)), secciones,
      el('p', { id: 'sin-coincidencias', class: 'vacio', hidden: true }, 'Nadie coincide con esa búsqueda en esta ' + tp.jornada.toLowerCase() + '.'));
    aplicarFiltro();
    const m = !E.yaDesplazado && $('#mesa-mia'); if (m) { E.yaDesplazado = true; m.scrollIntoView({ block: 'center' }); }
  }

  /* ----- parejas ----- */
  function pintarParejas(cont) {
    const a = E.actual, tp = tipoDe(a.torneo.tipo);
    const ps = a.participantes.slice().sort((x, y) => x.id - y.id);
    if (!ps.length) { cont.replaceChildren(el('p', { class: 'vacio' }, `Todavía no hay ${tp.unidades} publicadas.`)); return; }
    const hayB = ps.some((p) => p.grupo === 'B');
    cont.replaceChildren(el('div', { class: 'tabla-caja' }, el('table', { class: 'lista-parejas' },
      el('caption', { class: 'solo-lector' }, `${tp.unidades[0].toUpperCase() + tp.unidades.slice(1)} inscritas`),
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Nº'), el('th', { scope: 'col' }, tp.unidades === 'jugadores' ? 'Jugador' : 'Jugadores'), el('th', { scope: 'col' }, 'Zona'))),
      el('tbody', null, ps.map((p) => el('tr', { class: p.ret ? 'ret' : null },
        el('td', { class: 'n' }, p.id),
        el('td', null, [[p.j1_nombre, p.j1_apellido1], [p.j2_nombre, p.j2_apellido1]].filter((x) => x[0]).map((x) => el('span', { class: 'nom' }, x.join(' '))),
          p.ret ? el('span', { class: 'etq alerta' }, 'Retirada') : null, hayB ? el('span', { class: 'etq' }, 'Grupo ' + p.grupo) : null),
        el('td', { class: 'zona' }, p.zona)))))));
  }

  /* ----- calendario ----- */
  const diaN = (iso) => { const f = partesFecha(iso); return Date.UTC(f.a, f.m - 1, f.d) / 864e5; };
  const dm = (iso) => { const f = partesFecha(iso); return `${f.d}/${f.m}`; };
  const dma = (iso) => `${dm(iso)}/${partesFecha(iso).a}`;
  // "13/10 – 26/10/2026"; si cruza de año, "15/12/2026 – 4/1/2027"
  const rango = (c) => (partesFecha(c.desde).a === partesFecha(c.hasta).a ? `${dm(c.desde)} – ${dma(c.hasta)}` : `${dma(c.desde)} – ${dma(c.hasta)}`);
  // "del 10 al 23 de noviembre de 2026" (para lectores de pantalla)
  function filasCalendario(a) {
    return (Array.isArray(a.calendario) ? a.calendario : [])
      .filter((c) => c && Number.isInteger(c.jornada) && partesFecha(c.desde) && partesFecha(c.hasta) && diaN(c.hasta) >= diaN(c.desde))
      .sort((x, y) => diaN(x.desde) - diaN(y.desde));
  }
  const cursoDe = (a) => (a.torneo.estado === 'terminado' ? null : a.jornada.numero);

  function calLista(a, filas) {
    const tp = tipoDe(a.torneo.tipo), curso = cursoDe(a);
    return el('section', { class: 'calendario' }, el('h2', null, 'Calendario'),
      el('ol', null, filas.map((c) => el('li', { class: c.jornada === curso ? 'curso' : null, 'aria-current': c.jornada === curso ? 'step' : null },
        el('span', { class: 'num' }, el('small', null, tp.jornada), c.jornada, c.jornada_b != null ? el('b', { class: 'b' }, 'B' + c.jornada_b) : null),
        el('span', { class: 'fechas' }, rango(c))))));
  }

  // La normativa (datos/<id>/normativa.pdf.cifrado) se descifra aquí y se descarga como archivo: sin iframe ni visor.
  async function descargarNormativa(boton, aviso) {
    boton.disabled = true; aviso.textContent = 'Preparando el PDF…';
    try {
      const bytes = await leerSobre(`${BASE}/${E.id}/normativa.pdf.cifrado`, true);
      const dir = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); // el() no acepta direcciones blob:
      a.href = dir; a.download = `normativa-${E.id}.pdf`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(dir), 60000);
      aviso.textContent = '';
    } catch (e) { aviso.textContent = 'No se ha podido descargar la normativa. Prueba otra vez dentro de un minuto.'; }
    boton.disabled = false;
  }
  function pintarFolleto(cont) {
    const filas = filasCalendario(E.actual);
    poner(cont, !filas.length ? el('p', { class: 'vacio' }, 'Este campeonato no tiene calendario publicado.') : calLista(E.actual, filas));
  }

  /* ----- normativa y anuncio del libro ----- */
  const LIBRO = 'https://www.amazon.es/JUGUEMOS-DOMIN%C3%93-FORMACI%C3%93N-PRINCIPIANTES-PAREJAS/dp/B0DLCSRN4S';
  function anuncioLibro() {
    return el('section', { class: 'libro', 'aria-labelledby': 't-libro' },
      el('img', { class: 'libro-portada', src: 'assets/libro-portada.jpg', width: 520, height: 756, loading: 'lazy', alt: 'Portada del libro Juguemos dominó, de Jesús Eduardo Elián Campos: título en letras blancas sobre un bloque negro, grandes franjas negras a los lados y dos fichas de dominó abajo a la izquierda.' }),
      el('div', { class: 'libro-texto' },
        el('p', { class: 'libro-sello' }, 'Libro del creador de esta web'),
        el('h2', { id: 't-libro' }, 'Juguemos dominó'),
        el('p', { class: 'libro-sub' }, 'Formación para principiantes del dominó por parejas en España'),
        el('p', { class: 'libro-autor' }, 'Jesús Eduardo Elián Campos'),
        el('p', null, 'Muchos jugadores habituales no conocen las normas oficiales de este deporte. Publicada originalmente en septiembre de 2024, esta obra permite que los principiantes se formen desde el primer día con una base de conocimientos sólidos.'),
        el('ul', null, [
          'Las normas del dominó por parejas del Reglamento del Juego y Competiciones de la Federación Española de Dominó',
          'Historia, actualidad y curiosidades',
          'Sistemas, principios y estrategias para jugar con fundamentos y lógica',
          'Aspectos psicológicos y sugerencias para mejorar',
          'Una evaluación final con situaciones frecuentes de partida',
        ].map((t) => el('li', null, t))),
        el('p', { class: 'libro-quien' }, ''),
        el('blockquote', null, '«Juguemos dominó. ¡Que comience la partida!»'),
        el('a', { class: 'libro-enlace', href: LIBRO, target: '_blank', rel: 'noopener noreferrer' }, 'Ver en Amazon', el('span', { class: 'solo-lector' }, ' (se abre en una pestaña nueva)'))));
  }

  async function pintarNormativa(cont) {
    // ¿hay normativa? Se pregunta una vez y solo al abrir Normativa (un 404 aquí es lo normal: el campeonato no tiene)
    E.normativa = E.normativa || (BORRADOR ? Promise.resolve(false) : fetch(`${BASE}/${E.id}/normativa.pdf.cifrado`, { method: 'HEAD', cache: 'no-cache' }).then((r) => r.ok, () => false));
    const hay = await E.normativa;
    if (E.ver !== 'normativa') return;
    const aviso = el('p', { class: 'nota sin-margen', 'aria-live': 'polite' });
    const boton = hay ? el('button', { type: 'button', class: 'boton', onclick: () => descargarNormativa(boton, aviso) }, 'Descargar normativa (PDF)') : null;
    poner(cont, hay ? el('div', { class: 'acciones normativa' }, boton, aviso) : el('p', { class: 'vacio' }, 'Este campeonato no tiene normativa publicada.'));
  }

  /* ----- orquestación ----- */
  let pintando = 0;
  async function pintar() {
    const marca = ++pintando;
    cabecera(); pestanas();
    const cont = $('#contenido');
    if (marca !== pintando) return;
    if (E.ver === 'resumen') await pintarResumen(cont);
    else if (E.ver === 'clasificacion') await pintarClasificacion(cont);
    else if (E.ver === 'mesas') await pintarMesas(cont);
    else if (E.ver === 'parejas') pintarParejas(cont);
    else if (E.ver === 'normativa') await pintarNormativa(cont);
    else pintarFolleto(cont);
  }

  async function sondear() {
    try {
      const nuevo = await leer(`${BASE}/${E.id}/actual.json?t=${Math.floor(Date.now() / 60000)}`, true);
      if (nuevo.publicado !== E.actual.publicado) {
        const y = window.scrollY;
        E.actual = nuevo; E.cache.clear();
        await pintar();
        window.scrollTo(0, y);
      }
    } catch (e) { /* sin red: se reintenta en el siguiente minuto */ }
  }

  // Sin token, o si algo falla, un borrador dice solo que es privado: ni el nombre ni el motivo.
  const borradorPrivado = () => $('#contenido').replaceChildren(el('p', { class: 'aviso alerta' }, 'Este campeonato es un borrador privado. Solo se ve con el token de la mesa de control guardado en este navegador, y con acceso a campeonatos-borradores. '), el('a', { href: 'publicar.html' }, 'Ir a la mesa de control'));

  async function torneo() {
    leerUrl();
    if (!E.id || !/^[a-z0-9][a-z0-9-]{2,59}$/.test(E.id)) { $('#contenido').replaceChildren(el('p', { class: 'aviso alerta' }, 'Falta el campeonato. Vuelve a la portada y elige uno.')); return; }
    if (BORRADOR) {
      document.body.prepend(el('div', { class: 'banda-prueba' }, 'Borrador privado: solo lo ves tú, con el token de este navegador. La web pública no lo enseña.'));
      if (!window.Mesa || !window.Mesa.token.obtener()) { borradorPrivado(); return; }
    }
    try { E.actual = await leer(`${BASE}/${E.id}/actual.json`, true); }
    catch (e) { if (BORRADOR) borradorPrivado(); else $('#contenido').replaceChildren(el('p', { class: 'aviso alerta' }, 'No se ha encontrado este campeonato. Puede que todavía no esté publicado.')); return; }
    await pintar();
    window.addEventListener('popstate', () => { leerUrl(); pintar(); });
    if (E.actual.torneo.estado === 'en_juego' && !BORRADOR) {
      setInterval(() => { if (!document.hidden) sondear(); }, 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) sondear(); });
    }
  }

  window.TuMesa = { el, poner, instante, TIPOS, ESTADOS };

  document.addEventListener('DOMContentLoaded', async () => {
    bandaPrueba();
    const pagina = document.body.dataset.pagina;
    if ((pagina === 'portada' || pagina === 'torneo') && !BORRADOR && !(await desbloquear())) return;
    if (pagina === 'portada') portada();
    else if (pagina === 'torneo') torneo();
    document.querySelectorAll('a[data-conservar]').forEach((x) => { if (ES_PRUEBA) x.href = url(x.getAttribute('href')); });
  });
})();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
