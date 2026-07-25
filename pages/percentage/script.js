'use strict';

(function () {
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

  function num(el) {
    const raw = el.value.trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function show(outId, noteId, value, note) {
    $(outId).textContent = value;
    const noteEl = $(noteId);
    noteEl.textContent = note;
    noteEl.hidden = !note;
  }

  function watch(ids, render) {
    ids.forEach((id) => {
      $(id).addEventListener('input', render);
      $(id).addEventListener('change', render);
    });
    render();
  }

  // What is X% of Y?
  watch(['p1-x', 'p1-y'], () => {
    const x = num($('p1-x'));
    const y = num($('p1-y'));
    if (x === null || y === null) return show('p1-out', 'p1-note', '—', '');
    show('p1-out', 'p1-note', fmt.format((x / 100) * y), '');
  });

  // X is what % of Y?
  watch(['p2-x', 'p2-y'], () => {
    const x = num($('p2-x'));
    const y = num($('p2-y'));
    if (x === null || y === null) return show('p2-out', 'p2-note', '—', '');
    if (y === 0) return show('p2-out', 'p2-note', '—', "Can't divide by zero. Y must not be 0.");
    show('p2-out', 'p2-note', fmt.format((x / y) * 100) + '%', '');
  });

  // % change from X to Y
  watch(['p3-x', 'p3-y'], () => {
    const x = num($('p3-x'));
    const y = num($('p3-y'));
    if (x === null || y === null) return show('p3-out', 'p3-note', '—', '');
    if (x === 0) return show('p3-out', 'p3-note', '—', 'Change from zero is undefined. X must not be 0.');
    const change = ((y - x) / x) * 100;
    if (change === 0) return show('p3-out', 'p3-note', 'No change', '');
    // "Increase/decrease" is ambiguous for a negative start value, so show the signed ratio.
    if (x < 0) return show('p3-out', 'p3-note', fmt.format(change) + '%', '');
    show('p3-out', 'p3-note', fmt.format(Math.abs(change)) + '% ' + (change > 0 ? 'increase' : 'decrease'), '');
  });

  // Increase / decrease X by Y%
  watch(['p4-x', 'p4-y', 'p4-inc', 'p4-dec'], () => {
    const x = num($('p4-x'));
    const y = num($('p4-y'));
    if (x === null || y === null) return show('p4-out', 'p4-note', '—', '');
    const sign = $('p4-inc').checked ? 1 : -1;
    show('p4-out', 'p4-note', fmt.format(x * (1 + (sign * y) / 100)), '');
  });
})();
