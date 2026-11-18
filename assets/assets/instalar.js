(function () {
  var btn = document.getElementById('btn-instalar');
  var guia = document.getElementById('guia-instalar');
  var caja = document.getElementById('caja-instalar');
  if (!btn || !guia || !caja) return;

  var yaInstalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (yaInstalada) {
    caja.style.display = 'none';
    return;
  }

  var eventoAndroid = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    eventoAndroid = e;
  });

  btn.onclick = function () {
    if (eventoAndroid) {
      eventoAndroid.prompt();
      eventoAndroid = null;
      return;
    }
    var visible = guia.classList.toggle('abierta');
    btn.textContent = visible ? '✖ Cerrar instrucciones' : '📲 Instalar "App" en mi móvil';
  };
})();
