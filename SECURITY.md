# Seguridad de campeonatos-domino

Este repositorio es público y lo sirve GitHub Pages. Aquí se explica qué se publica, cómo se cifra, qué protege la contraseña y qué no, y qué hacer con el token de publicación.

## Qué se publica

En `datos/` van los JSON de cada campeonato: nombre, organizador, temporada, fechas, y por cada pareja o jugador el nombre de pila, el primer apellido y un nombre corto (por ejemplo «Fontan-Ródenas»). También van la zona, las mesas de cada jornada con su resultado, la clasificación y el calendario. Cada jornada queda guardada con los nombres que tenía ese día. Si la mesa la sube, va también la normativa del campeonato en PDF.

Todo eso va cifrado con la contraseña de la web (ver «La contraseña de la web»). En el repositorio, en la web servida, en las cachés y en cualquier copia que hagan buscadores o archivos de internet solo hay sobres cifrados. Sin la contraseña no se lee ni un nombre.

Nunca entran en el repositorio:

- teléfonos, números de licencia, segundos apellidos, direcciones de correo ni cuentas bancarias;
- ningún Excel (el `.gitignore` deja fuera `*.xlsx`, `*.xlsm` y `*.xls`);
- el token de GitHub.

Dos barreras lo impiden. `publicar.html` lee del Excel la hoja WEB y las hojas de datos de las partidas (`_WEBC`, `_R1`… y `P.1`…, más la celda de cada semilla de sorteo), nunca `Licencias`, `PAREJAS`, `JUGADORES` ni `SUSTITUCIONES`, en el ordenador de la mesa, y su validación V06 bloquea cualquier nombre con cifras o con arroba y cualquier texto libre que parezca un teléfono. Además, `pruebas/probar_contrato.cjs` comprueba esa validación. Si un dato personal llegara a publicarse por error, hay que borrarlo del repositorio y avisar a la persona afectada; el historial de Git conserva las versiones anteriores, así que quitar el archivo no basta.

## Cómo se publica

`publicar.html` es la mesa de control. Trabaja con dos repositorios: `campeonatos-domino` (público, la web) y `campeonatos-borradores` (privado, con la misma estructura `datos/`).

1. La mesa abre `publicar.html` y elige el Excel guardado. La página lo lee en el navegador; el Excel no se sube a ningún sitio. Rechaza archivos de más de 25 MB y hojas WEB con más de 300 filas o 80 columnas, y los textos de más de 300 caracteres.
2. La mesa elige el destino: borrador o web. Por defecto es la web si el torneo ya está en ella y borrador si es nuevo.
3. La página escribe con la API de contenidos de GitHub, con el token guardado en el navegador. Solo puede escribir en los dos repositorios, y en ellos solo en `datos/indice.json`, `datos/clave.json`, `datos/<id>/jornada_NN.json`, `datos/<id>/actual.json` y `datos/<id>/normativa.pdf.cifrado`. El `<id>` tiene que cumplir `[a-z0-9][a-z0-9-]{2,59}`, y la validación V20 bloquea un `<id>` que lleve el nombre o el apellido de un participante, porque los nombres de carpeta no se cifran. Cualquier otra ruta u otro repositorio se rechaza antes de llamar a GitHub. Para borrar rige la misma lista de rutas.
4. Lo que va a `campeonatos-domino` se cifra en el navegador antes de salir. La última comprobación antes de cada escritura rechaza, sin llamar a GitHub, cualquier archivo para la web que no sea un sobre cifrado (o un `clave.json` bien formado). Los borradores van en claro, porque su repositorio es privado.
5. Cada commit sale con autor y committer «Mesa de control» y el correo noreply de la cuenta (`356692983+JUGUEMOSDOMINO@users.noreply.github.com`), para que no se vea el correo real. Los mensajes llevan solo la acción y el id (por ejemplo «Ocultar sp-2026-27»), nunca nombres de personas.
6. El token solo se envía a `https://api.github.com`. Si GitHub responde 401, la página lo borra del navegador y lo avisa.
7. Los textos del Excel y de los JSON se pintan siempre como texto, nunca como HTML. Los enlaces externos solo se aceptan con `https://` y llevan `rel="noopener noreferrer"`.
8. Todo lo que borra o mueve pide confirmación: publicar un borrador, ocultar y eliminar. Eliminar exige escribir el id del campeonato.

### Orden de escritura

Cuando una acción toca varios archivos, la web pública no debe apuntar nunca a archivos que no existen:

- Subir o publicar: primero `jornada_NN.json`, luego `actual.json` y al final `indice.json`.
- Ocultar: copia los archivos a borradores (descifrados) y apunta el borrador en su `indice.json`; después quita el torneo de `indice.json` de la web y solo al final borra sus archivos de la web, la normativa incluida. La normativa no pasa a borradores.
- Eliminar: quita el torneo de `indice.json` y luego borra sus archivos.
- Editar: primero `actual.json`, al final `indice.json`.
- Poner o cambiar la contraseña: primero los archivos de cada campeonato, después `indice.json` y al final `clave.json`. Ver «Cambiarla».

Si algo falla a medias, la página dice qué quedó hecho y ofrece «Reintentar» con los pasos que faltan. Si se cierra la página antes, las carpetas que queden en la web sin entrada en `indice.json` salen en la lista como restos, para eliminarlas.

## Borradores

`campeonatos-borradores` es privado. Una persona sin el token no ve nada de él.

- Ver un borrador: `torneo.html?t=<id>&borrador=1` lee los datos de `campeonatos-borradores` con la API de GitHub y el token guardado en ese navegador. Sin token, con un token que no llega al repositorio o si algo falla, la página dice que es un borrador privado y no enseña nada, ni siquiera el nombre. El código de la página es público; los datos no.
- Publicar un borrador cifra sus archivos, los copia a `campeonatos-domino` y lo añade a `indice.json`. El borrador se queda en borradores, en claro.
- Ocultar un campeonato lo copia a borradores y lo quita de la web. Sus archivos siguen en el historial de git de `campeonatos-domino`, que es público: quien sepa buscar en el historial puede verlos. Ocultar retira un campeonato de la portada. Un dato publicado por error sigue en el historial después de ocultarlo; para quitarlo hay que reescribir el historial, como se hizo el 15/11/2026.
- Nunca entra un Excel en `campeonatos-borradores`, igual que en el repositorio público. Los borradores pueden llevar nombres de pila y primer apellido, como la web; la validación V06 se aplica en los dos casos.

## La contraseña de la web

GitHub Pages es estático y el repositorio es público: cualquiera puede descargar los archivos de `datos/` sin pasar por la web. Una pantalla que tape la página no protegería nada, así que lo publicado va cifrado y la web lo descifra en el navegador de quien tiene la contraseña.

### Cómo funciona

- `assets/cifra.js` usa WebCrypto, sin librerías. La clave sale de la contraseña con PBKDF2-SHA-256, 600 000 iteraciones y una sal aleatoria de 16 bytes. Cada archivo se cifra con AES-256-GCM y un IV aleatorio de 12 bytes.
- `datos/clave.json` es público. Lleva la versión, el algoritmo, las iteraciones, la sal y un verificador: una frase fija cifrada con la clave. Con él la web sabe si una contraseña es la buena. No lleva la contraseña ni la clave.
- Cada JSON publicado, `indice.json` incluido, es un sobre `{"v":1,"iv":"…","ct":"…"}` en base64. La normativa va igual, en `datos/<id>/normativa.pdf.cifrado`.
- La web, sin clave en el dispositivo, enseña solo la pantalla de contraseña. Con «Recordar en este dispositivo» (marcada por defecto) guarda la clave derivada en `localStorage`; sin marcarla, en `sessionStorage`, que se borra al cerrar la pestaña. Nunca guarda la contraseña. El botón «Olvidar contraseña en este dispositivo» del pie la borra. En `localStorage` la web guarda también, si la persona pulsa «Soy yo» en Resumen, el número de su pareja o jugador, una clave por campeonato (`tumesa.quien:<id>`). Ningún nombre ni otro dato; «No soy yo» lo borra y, si el navegador lo impide, no pasa nada. Ese código vive en `assets/cifra.js`, igual que el de la clave.
- Si la clave guardada ya no abre `clave.json` (la mesa cambió la contraseña), la web la borra y pide la nueva.
- La web no lee un archivo en claro. Mientras `datos/clave.json` no exista, dice que se está preparando y no enseña nada.
- La normativa se descifra en el navegador y se descarga como archivo (un `blob`), sin iframe ni visor.

### Qué protege

Sin la contraseña no se puede leer nada de lo publicado: ni en la web, ni en el repositorio, ni en la caché de GitHub, de un buscador o de un archivo de internet como la Wayback Machine. Todos ellos solo ven sobres cifrados. Los nombres de archivo y de carpeta son los ids de los campeonatos (`sp-2026-27`), que no nombran a nadie.

### Qué no protege

- La contraseña es compartida: la tienen todos los jugadores. Si alguien la reenvía, quien la reciba lo puede leer todo, y no hay forma de saber quién la pasó. Entonces la única defensa es cambiarla.
- Quien la tuvo puede haber guardado copias de lo que vio. Cambiarla protege lo que se publique después, no lo que ya se leyó.
- Una contraseña débil se puede adivinar probando, sin límite de intentos y sin conexión, porque `clave.json` es público. Por eso la mesa propone una frase de cinco palabras al azar de una lista de 2 444 (unos 56 bits) y no acepta menos de 14 caracteres. Las 600 000 iteraciones encarecen cada intento.
- Se ve lo que no va cifrado: que la web existe, cuántos campeonatos hay (una carpeta por id), cuántas jornadas tiene cada uno, el tamaño aproximado de cada archivo y cuándo se publica (el historial de git).
- Lo que se publicó en claro antes de la contraseña sigue en el historial de git y en las copias que alguien hiciera entonces. Hay que reescribir el historial y pedir la retirada de las copias que se encuentren.
- Quien tenga el token puede cambiar `assets/*.js` y robar la contraseña de quien la escriba después. Por eso el token no se comparte (ver «El token»).

### Cambiarla

Conviene cambiarla si se sospecha que ha llegado a quien no debía, al empezar una temporada nueva o si cambian los jugadores.

1. En `publicar.html`, paso 2, pulsa «Cambiar la contraseña».
2. La página propone una frase de cinco palabras sacadas al azar con `crypto.getRandomValues`. «Proponer otra» saca otra. Se puede escribir otra contraseña, de 14 caracteres o más.
3. Apúntala, marca «La he apuntado en un sitio seguro» y pulsa «Cifrar con esta contraseña».
4. La página guarda la clave nueva en ese navegador como cambio pendiente y vuelve a cifrar todo lo publicado: primero los archivos de cada campeonato, después `indice.json` y al final `clave.json`. Hasta ese último paso la web sigue funcionando con la contraseña de antes para casi todo; cuando sube `clave.json`, pide la nueva.
5. Si algo falla a medias, la página dice qué quedó hecho y ofrece «Reintentar». Si se cierra antes, al volver a abrirla en el mismo navegador sale «Hay un cambio de contraseña a medias» y el botón «Terminar el cambio». Cada paso mira el archivo antes de tocarlo: lo que ya está con la clave nueva no se vuelve a escribir.
6. Pasa la contraseña nueva a los jugadores. Quien tenga guardada la de antes verá «La contraseña de la web ha cambiado. Escribe la nueva.»

«Cifrar lo publicado» cifra con la contraseña de ahora los JSON que haya en claro en la web, por ejemplo los de antes de tener contraseña. Lo que ya va cifrado no lo toca.

Si la contraseña se pierde y ningún navegador de la mesa la tiene guardada, lo publicado no se puede descifrar. Hay que eliminar los campeonatos de la web, poner una contraseña nueva y volver a publicarlos desde los Excel.

## Qué protege el sitio

GitHub Pages no deja poner cabeceras HTTP, así que cada página lleva `<meta>`:

- `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'none'; form-action 'none'`. No hay scripts ni estilos en línea. El cifrado no ha necesitado cambiarla: WebCrypto no depende de la CSP y la descarga de la normativa (un enlace `blob:` con `download`) no es una navegación. La pantalla de contraseña es un `<form>` que no se envía (se cancela en JavaScript), así que `form-action 'none'` no le afecta. `pruebas/probar_seguridad.cjs` lo comprueba sin violaciones.
- `referrer` con `no-referrer`.
- `robots` con `noindex, nofollow`, `googlebot` con `noarchive, nosnippet` y un `robots.txt` con `Disallow: /`.

Límites que conviene conocer:

- `frame-ancestors` no funciona en un `<meta>`, así que no se puede impedir que otra web enmarque estas páginas. Hace falta una cabecera HTTP, que GitHub Pages no ofrece.
- El `robots.txt` de un sitio de proyecto vive en `/campeonatos-domino/robots.txt`, no en la raíz del dominio, y los buscadores solo leen la raíz. Lo que de verdad pide que no se indexe es el `<meta name="robots">`. Ninguna de las dos cosas oculta el sitio: cualquiera con el enlace lo ve, y el repositorio es público.
- La CSP no protege de un token robado. Con permiso de escritura en el repositorio se pueden cambiar también `assets/*.js`, y esos scripts son de origen `'self'`.
- `noindex`, `noarchive` y `robots.txt` son peticiones que los buscadores serios respetan y otros no. Lo que protege los datos es el cifrado.

## El token

Es un token fine-grained de GitHub con este alcance:

- los dos repositorios, `JUGUEMOSDOMINO/campeonatos-domino` y `JUGUEMOSDOMINO/campeonatos-borradores`, y ningún otro, en «Repository access» (Only select repositories);
- permiso «Contents: Read and write» y ningún otro;
- caduca en noviembre de 2027.

Se pega una vez en `publicar.html`, en el equipo de la mesa, y se queda en el `localStorage` de ese navegador. No se manda por WhatsApp ni por correo, ni se escribe en el Excel o en el repositorio. Con el token se ven los borradores desde ese navegador. El token y la contraseña de la web son cosas distintas: la contraseña se reparte a los jugadores, el token no sale nunca del equipo de la mesa.

Si el token no tiene acceso a `campeonatos-borradores`, la lista de borradores dice que falta «Repository access» y el resto de la página sigue funcionando: se puede subir a la web, ver, editar y eliminar lo que ya está en ella. Ocultar necesita los dos repositorios y se detiene en el primer paso, sin cambiar nada. Si solo puede leer, avisa de que falta «Contents: Read and write».

### Rotarlo

Conviene hacerlo antes de que caduque, o si cambia el equipo de la mesa.

1. En GitHub: Settings, Developer settings, Personal access tokens, Fine-grained tokens. Crea uno nuevo con el alcance de arriba (los dos repositorios) y una caducidad nueva, o usa «Regenerate token» en el existente.
2. En `publicar.html`, pulsa «Quitar el token», pega el nuevo y pulsa «Guardar y comprobar». La página comprueba los dos repositorios.
3. Borra el token antiguo en la misma pantalla de GitHub.
4. Anota la nueva fecha de caducidad en esta página y en la guía.

Si el token caduca o se pierde sin avisar, la página lo dice («GitHub no acepta el token…») y lo borra del navegador. No se pierde nada: se crea uno nuevo y se repite la acción.

### Si se filtra

Un token filtrado da acceso de escritura a la web y a los borradores privados. No da la contraseña de la web, pero quien lo tenga puede cambiar `assets/*.js` para robarla.

1. Revócalo ya: GitHub, Settings, Developer settings, Fine-grained tokens, Delete. Es lo único urgente.
2. Mira los commits recientes de los dos repositorios. Los de la mesa llevan autor «Mesa de control» y mensajes como «Publicar <id>: jornada N», «Borrador <id>: jornada N», «Publicar borrador <id>», «Ocultar <id>», «Editar <id>», «Eliminar <id>», «Normativa <id>», «Quitar normativa <id>», «Poner contraseña a la web», «Cambiar la contraseña de la web» o «Cifrar lo publicado». Cualquier otro commit, o uno que toque algo fuera de `datos/`, hay que revisarlo.
3. Si hay cambios que no son nuestros, restáuralos con `git revert` o repón los archivos desde el último commit bueno. Presta atención a `assets/` y a las páginas HTML.
4. Lee los borradores por si alguien los ha copiado: contienen lo mismo que la web, pero aún sin publicar.
5. Crea un token nuevo como se explica arriba.
6. Mira el registro de seguridad de la cuenta (Settings, Security log) por si se ha usado en algo más.
7. Si alguien tocó `assets/` o las páginas, da la contraseña de la web por perdida: cámbiala cuando todo esté restaurado.

## Revisar cuando cambie algo

Si se añade una página, tiene que llevar las cuatro etiquetas `<meta>` (CSP, referrer, robots y googlebot) y ningún script ni estilo en línea. `pruebas/probar_seguridad.cjs` lo comprueba, y también que el token y la dirección de la API de GitHub solo aparecen en `assets/mesa.js` y que solo `mesa.js` (token) y `cifra.js` (clave) guardan algo en el navegador. `pruebas/probar_contrasena.cjs` falla si, existiendo `datos/clave.json`, queda en `datos/` algún archivo sin cifrar.

## Avisos de seguridad

Si ves algo raro en la web, escribe a la mesa de control. No lo publiques en un issue si incluye datos de personas.
