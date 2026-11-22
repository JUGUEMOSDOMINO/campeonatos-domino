document.querySelectorAll('.caso-item').forEach(function(item) {
  var summary = item.querySelector('summary');
  var textarea = item.querySelector('textarea');
  var aviso = item.querySelector('.aviso-escribir');

  summary.addEventListener('click', function(e) {
    if (textarea.value.trim().length < 5) {
      e.preventDefault();
      aviso.textContent = '⚠️ Escribe al menos 5 caracteres para desplegar la respuesta.';
      aviso.style.display = 'block';
      textarea.focus();
    } else {
      aviso.style.display = 'none';
    }
  });

  textarea.addEventListener('input', function() {
    if (textarea.value.trim().length >= 5) {
      aviso.style.display = 'none';
    }
  });
});
