// Chat de jugadores de la portada: ventana que se abre y se cierra. El chat de terceros se carga al abrirla, no al entrar.
(function () {
  var abrir = document.getElementById('abrir-chat'), cerrar = document.getElementById('cerrar-chat'), ventana = document.getElementById('ventanaChat'), marco = document.getElementById('cboxFrame');
  if (!abrir || !cerrar || !ventana || !marco) return;
  abrir.addEventListener('click', function (e) {
    e.preventDefault();
    if (!marco.getAttribute('src')) marco.src = 'https://www5.' + 'cbox.ws/box/?boxid=969043&boxtag=tDV93t';
    ventana.hidden = false;
  });
  cerrar.addEventListener('click', function () { ventana.hidden = true; });
})();
