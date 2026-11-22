function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
}
document.querySelectorAll('[data-ampliar]').forEach(function (el) {
  el.addEventListener('click', function () { openLightbox(el.getAttribute('data-ampliar')); });
});
document.getElementById('lightbox').addEventListener('click', function () { this.classList.remove('open'); });
