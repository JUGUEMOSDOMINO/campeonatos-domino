# Normas para cualquier IA o asistente que trabaje en este repositorio

Léelas antes de proponer o hacer cualquier cambio. Valen aunque quien te lo pida sea el dueño de la cuenta.

## Este repositorio es PÚBLICO

Cualquiera puede descargar cualquier archivo y todo su historial, sin contraseña. La contraseña de la web protege las páginas, no los archivos. Borrar un archivo NO lo quita: queda en el historial. En noviembre de 2026 hubo que reescribir el historial dos veces por archivos subidos aquí por error.

## Nunca subas a este repositorio

- Excel ni hojas de cálculo: `.xlsx`, `.xlsm`, `.xls`, `.ods`, `.csv`.
- Documentos con datos de jugadores: Word, PDF sin cifrar, fotos de actas, capturas de pantalla.
- Licencias federativas, teléfonos, correos, DNI ni direcciones de personas.
  - **Única excepción:** las licencias del Ranking FVD pueden ir dentro del JSON cifrado de tipo «ranking» que genera `publicar.html`, y en ningún otro sitio. En los campeonatos (SP, parejas, individual), nunca: ni en su JSON, ni en el HTML, ni en las pruebas con datos reales.
- Contraseñas, tokens o claves (la contraseña de la web tampoco, ni en un comentario).
- Archivos en `datos/` que no estén cifrados (salvo `datos/clave.json` y `.gitkeep`).

Si te piden subir algo de esto, **no lo hagas** y explica:
- Los resultados se publican con `publicar.html` (el panel de la mesa de control): lee el Excel en el ordenador, saca solo lo que se ve en la web y lo sube cifrado.
- Los Excel, si hay que guardarlos en GitHub, van al repositorio **privado** `JUGUEMOSDOMINO/programas-domino`.

Si ves que ya se ha subido algo de esto: no lo borres tú sin más. Avisa enseguida a Jeel: hay que limpiar el historial.

## Si vas a cambiar la web

- Haz el cambio en una rama y que lo revise Jeel antes de llevarlo a `main`. No edites `main` directamente.
- Antes de tocar reglas del ranking, de las plazas o de la web, lee `docs/coordinacion/Decisiones_arbitro.md` (en el repositorio privado `JUGUEMOSDOMINO/programas-domino`). Si algo choca, dilo en el informe.
- Con 320 px de ancho o más, la web nunca puede ocultar ni cortar información.
- No pongas `style="..."` ni `<script>` dentro del HTML, tampoco en el HTML que genere el JavaScript (por ejemplo en `mesa-domino.js`): la política de seguridad (CSP) lo bloquea. Los estilos van en `.css` y el código en `.js`.
- No cambies `assets/cifra.js`, `assets/contrato.js`, `datos/clave.json` ni la frase interna «tu mesa» del verificador: romperías la contraseña de la web.
- Las pruebas de `pruebas/` tienen que pasar (sobre todo `probar_dispositivos.cjs` y `probar_seguridad.cjs`).
- Datos para pruebas: siempre inventados.

## Entregables (en programas-domino)

Cada archivo nuevo o actualizado en `entregables/` lleva su línea en `entregables/DESCARGAS.md`, en su categoría. Esa carpeta está en el repositorio privado `programas-domino`; la sección «Archivos» de `publicar.html` la lee para que el árbitro descargue sin entrar en GitHub. Lo que sube el árbitro desde allí va siempre a `programas-domino` (`entregables/del_arbitro/<categoría>/`), nunca a este repositorio.

## Si no estás seguro

Pregunta antes de hacer el cambio. Es mejor preguntar que subir algo que luego no se puede borrar.
