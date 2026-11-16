# campeonatos-domino

Web de resultados de los campeonatos de dominó que lleva la mesa de control (Jesús Eduardo Elián C.). Sitio estático para GitHub Pages, sin servidor. Los borradores, antes de publicarse, viven en el repositorio privado `ELIAN1603/campeonatos-borradores`, que tiene la misma estructura `datos/`.

Este repositorio es público. **Nunca entra un Excel, un teléfono ni una licencia.** El `.gitignore` deja fuera `*.xlsx`, `*.xlsm` y `*.xls`.

Todo lo publicado en `datos/` va cifrado con la contraseña de la web: sin ella no se lee nada, ni en la web ni en el repositorio. Cómo funciona, qué protege y qué no, y cómo cambiarla está en `SECURITY.md`.

## Qué hay

| Ruta | Para qué |
|---|---|
| `index.html` | Portada: campeonatos en juego y terminados, y buscador de jugador. Sin la clave en el dispositivo, pide la contraseña |
| `torneo.html?t=<id>` | Un campeonato: Resumen (la que se abre por defecto), Clasificación, Partidas, Parejas, Calendario y Normativa («Descargar normativa (PDF)» si la hay, y el anuncio del libro). Sin la clave, pide la contraseña |
| `torneo.html?t=<id>&borrador=1` | Un borrador de `campeonatos-borradores`. Solo se ve con el token guardado en ese navegador; sin él, dice que es privado |
| `publicar.html` | La mesa de control: pone y cambia la contraseña de la web, lista los campeonatos de la web y los borradores, sube un Excel (lee la hoja WEB, valida y escribe los JSON), publica, oculta, edita, elimina y sube o quita la normativa en PDF |
| `SECURITY.md` | Qué datos se publican, cómo se cifran, qué protege la contraseña y qué hacer con el token |
| `robots.txt` | `Disallow: /` |
| `assets/` | Estilo, código de la web, contrato de datos, `mesa.js` (el único código que usa el token y la API de GitHub), `cifra.js` (el cifrado y la clave en el dispositivo), `palabras.js` (la lista de palabras para proponer contraseñas) y SheetJS (copia local, sin CDN) |
| `datos/clave.json` | Público: versión, sal, iteraciones y verificador de la contraseña. Nunca la contraseña ni la clave. Lo escribe `publicar.html` |
| `datos/indice.json` | Cifrado. Lista de campeonatos que ve la portada, en el orden en que se enseñan dentro de cada estado. Lo escribe `publicar.html` |
| `datos/<id>/` | Cifrados: `jornada_NN.json` (una foto por jornada), `actual.json` y, si la hay, `normativa.pdf.cifrado` |
| `datos/_prueba/` | Datos inventados para probar, cifrados con la contraseña de prueba `datos de prueba de la mesa` (pública a propósito). No salen en `indice.json` de la web real |
| `pruebas/datos/` | Los mismos datos inventados, en claro. `sp-calendario` es un SP con calendario y grupo B firme desde la jornada 12; `nombres-largos` lleva nombres, zonas y título muy largos; `sp-grande` es una copia del 24º con todos los nombres inventados; `sp-ejemplo` tiene una normativa de ejemplo. Tras cambiarlos, `node pruebas/cifrar_prueba.cjs` rehace `datos/_prueba` |
| `pruebas/` | Pruebas automáticas |

El formato de los JSON y de la hoja WEB está en `docs/W2_contrato_datos.md` del repositorio `programas-domino`.

## Cómo decide la web qué enseña

- La clasificación va en vivo, como en el Excel: en cuanto la jornada en curso tiene un resultado, se ve esa jornada, reordenada, con ⏳ en quien aún no ha jugado (`pendiente` del JSON; lleva sus cifras de antes). Mientras no haya ningún resultado, se ve la última jornada cerrada.
- Resumen enseña el podio con las tres primeras de la clasificación que se ve en Clasificación (en el Super-Prestigio con grupo B, solo las del grupo A) y el bloque «¿Quién eres?»: se busca por nombre (parcial, sin tildes) o por número exacto y sale la ficha con el puesto, las cifras y la mesa de la jornada publicada. A menos de 560 px el 1º ocupa todo el ancho y el 2º y el 3º van debajo. Los enlaces `ver=` anteriores siguen valiendo; sin `ver=` se abre Resumen.
- Clasificación y Mesas llevan una fila de botones redondos, uno por jornada publicada, con la jornada en curso marcada. Mesas se abre en la jornada en curso y enseña una tarjeta por mesa: número, las dos parejas de esa jornada y el resultado (partidas y tantos; ⏳ si falta; una etiqueta en ND, incomparecencia, descanso y retirada). Los enlaces antiguos `ver=resultados` y `ver=emparejamientos` llevan a Mesas.
- Bajo los botones de jornada, sale «Jornada N · se juega del dd/mm al dd/mm» con `plazo_desde` y `plazo_hasta`; si están vacíos no sale nada.
- Calendario (`ver=folleto`) lee la clave opcional `calendario` de `actual.json` (sin ella avisa de que no hay calendario) y enseña una tarjeta por jornada con sus fechas y el año (`13/10 – 26/10/2026`; si cruza de año, `15/12/2026 – 4/1/2027`). Los enlaces antiguos `ver=linea` llevan aquí. Calendario es solo el calendario.
- Ningún dato se oculta ni se corta, desde 320 px de ancho y en vertical y horizontal. Clasificación enseña todas las columnas: si no caben, la tabla se desplaza dentro de su caja con el puesto y la pareja fijos y una sombra a la derecha mientras quede más por ver. Los nombres largos se parten en varias líneas y la página nunca se desplaza en horizontal.
- La web no enseña criterios de clasificación; la leyenda de columnas sí.
- Cada jornada conserva los nombres que tenía cuando se publicó, así que una sustitución no reescribe las anteriores.
- Mientras un campeonato está en juego, la página pide `actual.json` cada 60 segundos y se detiene si la pestaña está oculta.
- Todo texto de los JSON se pinta como texto, nunca como HTML.
- Antes de nada, la página lee `datos/clave.json` y comprueba la clave guardada en el dispositivo. Si no hay, o ya no vale, enseña la pantalla de contraseña («Recordar en este dispositivo» marcada por defecto). Con la clave, descifra cada JSON al leerlo y la web funciona igual que antes. Un JSON en claro no se lee. Sin `datos/clave.json`, la portada dice que la web se está preparando.
- El pie lleva «Olvidar contraseña en este dispositivo».
- Normativa (`ver=normativa`, también para los enlaces antiguos) enseña, si existe `datos/<id>/normativa.pdf.cifrado`, «Descargar normativa (PDF)»: se descifra en el navegador y se descarga el PDF original. Debajo, siempre, el anuncio del libro «Juguemos dominó» con su portada (`assets/libro-portada.jpg`, del propio sitio) y un enlace a Amazon con `target="_blank"` y `rel="noopener noreferrer"`; la CSP no cambia porque no se carga nada de fuera.

## La mesa de control

`publicar.html` (la misma dirección de siempre) trabaja con el token guardado en el navegador. Si el token no tiene acceso a `campeonatos-borradores`, la lista de borradores dice que falta «Repository access» y el resto sigue funcionando.

La mesa necesita también la clave de la web, guardada igual que en la web (la misma entrada de `localStorage`, así que un navegador abierto en la mesa abre también la web). Todo lo que escribe en `campeonatos-domino` sale cifrado; en borradores escribe en claro. En el paso 2:

- «Establecer la contraseña» (si la web aún no tiene) o «Cambiar la contraseña»: propone una frase de cinco palabras de `assets/palabras.js`, sacadas con `crypto.getRandomValues`, y acepta otra de 14 caracteres o más. Vuelve a cifrar todo lo publicado: datos, después `indice.json` y al final `clave.json`. Si se corta, «Reintentar»; si se cierra la página, «Terminar el cambio» al volver.
- «Cifrar lo publicado»: cifra los JSON que estén en claro en la web.
- «Olvidar contraseña en este dispositivo».

Cada campeonato de la web tiene además «Subir normativa (PDF)» y, si la tiene, «Quitar normativa».

1. Lista de campeonatos en dos grupos, «En la web» (de `datos/indice.json` de este repositorio) y «Borradores» (de `datos/indice.json` de `campeonatos-borradores`). Cada uno enseña nombre, tipo, jornada publicada, fecha de la última publicación y sus acciones.
2. Subir un Excel: se lee la hoja WEB con las validaciones V01 a V19 y la vista previa de siempre, y se elige el destino, Borrador o Web. Por defecto es Web si el torneo ya está en la web y Borrador si es nuevo.
3. Ver un borrador: `torneo.html?t=<id>&borrador=1`. Lee de `campeonatos-borradores` con la API de GitHub y el token de ese navegador. Sin token, o si algo falla, solo dice que es privado.
4. Publicar un borrador copia sus archivos a este repositorio y lo añade a `indice.json`; el borrador se queda donde estaba. Ocultar lo copia a borradores, borra sus archivos de este repositorio y lo quita de `indice.json`. Lo que ya se publicó queda en el historial público de git. Eliminar borra un borrador o un campeonato de la web, tras escribir su id.
5. Editar nombre, temporada, estado (en juego, próximo, terminado) y puesto en la portada, en `indice.json` y `actual.json`. La siguiente publicación desde el Excel sobrescribe nombre, temporada y estado con lo que diga la hoja INICIO; el puesto en la portada se conserva.
6. Las escrituras de varios archivos van en orden seguro: primero los datos y al final el índice (al ocultar, el índice de la web se actualiza antes de borrar sus archivos), para que la portada pública nunca apunte a archivos que no existen. Si algo falla a medias, la página dice qué quedó hecho y ofrece «Reintentar».

Qué puede escribir y cómo se protege el token está en `SECURITY.md`. Cómo se usa, paso a paso, está en la sección 14 de `entregables/sp/Guia_SP_sin_macros.md` de `programas-domino`.

## Ver los datos de prueba

Abre cualquier página con `?d=datos/_prueba` y escribe la contraseña de prueba, `datos de prueba de la mesa`:

```
index.html?d=datos/_prueba
torneo.html?t=sp-ejemplo&d=datos/_prueba
```

## Pruebas

Hace falta Node 18 o más, Python 3 con `openpyxl` y Playwright. Desde la raíz:

```bash
python3 -m http.server 8765 &
node pruebas/cifrar_prueba.cjs --comprobar
node pruebas/probar_cifrado.cjs
node pruebas/probar_contrato.cjs
node pruebas/probar_contrasena.cjs
node pruebas/probar_publicar.cjs
node pruebas/probar_web.cjs
node pruebas/probar_resumen.cjs
node pruebas/probar_seguridad.cjs
node pruebas/probar_dispositivos.cjs
```

- `cifrar_prueba.cjs --comprobar` falla si `datos/_prueba` no es `pruebas/datos` cifrado.
- `probar_cifrado.cjs` prueba `assets/cifra.js` en Node: ida y vuelta de textos y de un PDF, sal e IV aleatorios, contraseña errónea, un sobre cambiado en un bit, el formato de `clave.json`, la frase de cinco palabras y que es compatible con el cifrado de las pruebas (`pruebas/cripto_prueba.cjs`, con `crypto` de Node).
- `probar_contrasena.cjs` prueba la pantalla de contraseña (errónea, recordar o no, «Olvidar», clave que ya no vale), la descarga de la normativa (pestaña Normativa), y que con la web servida tal cual y sin clave ninguna página enseña un nombre y ningún archivo de `datos/_prueba` tiene texto legible (nombres, «Calap», teléfonos, «ES76»). Con los datos reales, si existe `datos/clave.json` exige que todo `datos/` vaya cifrado; si no existe, avisa de qué archivos quedan en claro.

- `probar_contrato.cjs` prueba también las operaciones del índice (quitar, añadir, editar y orden). Crea un `.xlsx` pequeño con la hoja WEB (con `hacer_xlsx.py`), lo lee con SheetJS y comprueba que sale el mismo JSON que los ejemplos, y que cada validación V01 a V19 salta cuando toca. El `.xlsx` queda en la carpeta temporal y se borra.
- `probar_publicar.cjs` abre `publicar.html` y `torneo.html?borrador=1` en Chromium con una API de GitHub simulada para los dos repositorios (`pruebas/api_simulada.cjs`) y prueba la lista, subir a borrador y a la web, ver un borrador con y sin token, publicar, ocultar, editar, eliminar, un fallo a mitad con «Reintentar», un token sin acceso a borradores, las rutas y los repositorios prohibidos y el 401. La API simulada comprueba tras cada escritura que la web pública no apunta a archivos que faltan, y apunta cualquier PUT a la web que no vaya cifrado: al final no puede haber ninguno. Prueba también la contraseña: estrenarla con los datos reales de hoy en claro y comprobar la web resultante servida tal cual sin clave, cambiarla con un fallo a medias («Reintentar» y también cerrando la página), «Cifrar lo publicado», pedirla y olvidarla, y subir y quitar la normativa (también de más de 1 MB).
- `probar_web.cjs` recorre la web de prueba (con la clave ya guardada) a 390 px y a 1280 px: buscador, pestañas, columnas de la clasificación, jornadas, grupos, filtro, fechas de juego, calendario, Normativa con el anuncio del libro (portada y enlace a Amazon con `rel`), estados raros y que nada desborde. Con una carpeta como segundo argumento guarda capturas.
- `probar_dispositivos.cjs` abre la pantalla de contraseña (vacía, con error, en un campeonato y la de la web real), portada, torneo (las seis pestañas, con el buscador de Resumen, con `sp-grande`, `nombres-largos` y `sp-ejemplo`), un borrador y la mesa de control (listas, cambiar la contraseña, subir y quitar normativa, cada panel de confirmar, editar y eliminar, un fallo con «Reintentar» y un Excel de prueba) en 320×640, 360×780, 390×844, 412×915, 667×375, 768×1024 y 1280×800. Falla si la página se desplaza en horizontal, si un dato queda con `display:none` o `visibility:hidden` fuera de un `[hidden]`, si algo con `overflow` hidden o clip recorta contenido, si un texto se sale de su caja o de la ventana, o si en Clasificación no se llega con el desplazamiento hasta PUNT. C. Con una carpeta como segundo argumento guarda capturas de la clasificación del 24º a 360 y 390 px.
- `probar_seguridad.cjs` comprueba la CSP y las demás etiquetas `<meta>` de las tres páginas (también `googlebot`), `robots.txt`, que las páginas y la descarga de la normativa no violan la CSP y que los enlaces externos solo valen con https. `probar_seguridad.cjs` comprueba además que el token y la dirección de la API solo aparecen en `assets/mesa.js`. `probar_publicar.cjs` comprueba autor y committer de cada escritura, mensajes de commit sin datos personales, el rechazo de rutas fuera de `datos/` y de otros repositorios, y el borrado del token ante un 401.
- `probar_excel_real.cjs` necesita un Excel real; ver la sección siguiente.

## Prueba con Excel reales (los tres tipos)

`pruebas/probar_excel_real.cjs` lee un Excel de verdad (SP, parejas o individual), con SheetJS y con `publicar.html` en Chromium, y comprueba que el JSON es el mismo que escribe `tools/comun/web_export.py` de `programas-domino`. El Excel se pasa por ruta y no entra nunca en este repositorio.

```bash
python3 -I <programas-domino>/tools/comun/web_export.py libro.xlsx /tmp/web --publicado 2026-01-01T00:00:00Z
node pruebas/probar_excel_real.cjs libro.xlsx /tmp/web/<id>/jornada_NN.json
```

Resultado con los entregables de W2b (14/11/2026), sin cambiar `publicar.html` ni la web. El 15/11/2026 (P3b) salió igual, 11 comprobaciones bien, con `DEMO_XXVI_Benimaclet_sin_macros_version_web.xlsx` (parejas, 74 parejas con grupo B) y con `DEMO_Individual_sin_macros_version_web.xlsx` (individual, 112 jugadores). Con los casos de prueba de parejas (S2–S5, S7) y de individual (I2) pasa la parte de Node con `--ficticio`. El 15/11/2026 (W11, con el cifrado) dio 12 comprobaciones bien con el 24º, el DEMO del 23º, el DEMO de Benimaclet y el DEMO del individual: el `jornada_NN.json` sube cifrado y, descifrado, es idéntico al de `web_export.py`.

1. Valores guardados, vacíos, `A1` y fechas: SheetJS lee las fórmulas con su valor guardado. Las 4.500 celdas que dan `""` salen como `null`, `A1` es el texto `"1.0"` y las fechas son texto `aaaa-mm-dd`.
2. Mismo JSON: `contrato.js` y `web_export.py` dan el mismo objeto en el 24º (jornada 3 en curso) y en el 23º (14 jornadas, grupo B). `publicar.html` escribe `jornada_NN.json` idéntico, byte a byte, salvo `publicado`. También coinciden en los casos S0–S7 de `programas-domino` (con `--ficticio`, porque sus nombres llevan cifras y V06 los bloquea a propósito) y en las jornadas con incomparecencia, No disputado, descanso, retirada y sustitución.
3. Tiempo de lectura: unos 0,35 s en Node y de 0,5 a 0,7 s en Chromium desde elegir el archivo hasta la revisión, con Excels de 6 a 6,5 MB. Medido aquí, no en el PC del árbitro.

## Pasar la web de hoy (en claro) a la web cifrada

Se hace una sola vez, desde la mesa de control, y el código ya está listo. Hasta entonces la web dice «Estamos preparando la web».

1. Abre `publicar.html` con el token guardado. El paso 2 dice «La web todavía no tiene contraseña» y la lista «En la web» avisa de que lo publicado va sin cifrar.
2. Pulsa «Establecer la contraseña», apunta la frase propuesta (o escribe otra de 14 caracteres o más), marca «La he apuntado en un sitio seguro» y pulsa «Cifrar con esta contraseña».
3. Espera a «✔ Contraseña puesta». Si sale un error, «Reintentar».
4. Comprueba en una ventana privada que la web pide la contraseña y que, con ella, se ve como antes. Con el repositorio actualizado, `node pruebas/probar_contrasena.cjs` debe decir que todo `datos/` va cifrado.
5. Lo publicado en claro sigue en el historial de git: después hay que reescribirlo y buscar copias en archivos de internet.

## Lo que falta comprobar

1. La escritura real contra GitHub con el token del padre (hasta ahora, solo contra una API simulada), ahora en los dos repositorios: permisos, errores 401, 403 y 409 y el origen `github.io`. Falta también confirmar que GitHub devuelve 404 y no 403 cuando el token no incluye `campeonatos-borradores` (la página trata los dos igual) y probar ocultar y publicar un borrador con datos reales.
2. El tiempo de lectura en el PC del árbitro (Windows 10, Chrome o Edge). Aquí tarda menos de un segundo, pero la máquina es otra.
3. Que Pages sirva `datos/` con el retraso esperado y que el refresco de 60 segundos vea las publicaciones.
4. Un Excel guardado por Excel de verdad. Los de prueba los guarda LibreOffice (y `inject_values.py` pone los valores), así que falta confirmar que Excel 2016 los guarda igual.
5. Una retirada con grupo B publicada con un Excel entregable (los casos de prueba de parejas e individual sí la cubren).
6. El cifrado contra GitHub de verdad: poner la contraseña, cambiarla y subir una normativa de más de 1 MB (se lee por la API de blobs). Aquí solo se ha probado contra la API simulada.
7. Cuánto tarda la contraseña (600 000 iteraciones) en un móvil modesto. En esta máquina, menos de un segundo.

Al cambiar `assets/`, sube el `?v=` de los `<link>` y `<script>` de los tres HTML, para que los navegadores no sigan usando la versión guardada (GitHub Pages la cachea 10 minutos).
