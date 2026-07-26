'use strict';

// Click/tap toggling for the nav dropdowns. Hover is handled in CSS; this
// covers touch screens and keyboards, tracks aria-expanded, and closes on
// an outside click or Escape.
(function () {
  if (typeof document === 'undefined') return;

  const groups = Array.prototype.slice.call(document.querySelectorAll('.nav-group'));
  if (groups.length === 0) return;

  function close(group) {
    group.classList.remove('open');
    group.querySelector('button').setAttribute('aria-expanded', 'false');
  }

  groups.forEach((group) => {
    const btn = group.querySelector('button');
    btn.addEventListener('click', () => {
      const wasOpen = group.classList.contains('open');
      groups.forEach(close);
      if (!wasOpen) {
        group.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.nav-group')) groups.forEach(close);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') groups.forEach(close);
  });
})();
