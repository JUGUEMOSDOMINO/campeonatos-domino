(function () {
  var btn = document.getElementById('btn-instalar');
  var guia = document.getElementById('guia-instalar');
  var caja = document.getElementById('caja-instalar');
  if (!btn || !guia || !caja) return;

  var yaInstalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (yaInstalada) {
    caja.hidden = true;
    return;
  }

  var eventoAndroid = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    eventoAndroid = e;
  });

  btn.addEventListener('click', function () {
    if (eventoAndroid) {
      eventoAndroid.prompt();
      eventoAndroid = null;
      return;
    }
    guia.hidden = !guia.hidden;
    btn.textContent = guia.hidden ? '📲 Instalar "App" en mi móvil' : '✖ Cerrar instrucciones';
  });
})();
