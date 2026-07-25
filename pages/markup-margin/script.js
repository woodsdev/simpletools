'use strict';

const FIELDS = ['cost', 'sale', 'markup', 'margin'];

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// Compute the two unknown fields from the two knowns ("drivers").
// Returns { values } on success, { err: { field, msg } } when the driver
// pair is mathematically impossible, or { indeterminate: true } when the
// pair fixes no absolute price (markup + margin).
function compute(drivers, v) {
  const has = (f) => drivers.includes(f);
  if (has('markup') && has('margin')) return { indeterminate: true };

  let cost = has('cost') ? v.cost : null;
  let sale = has('sale') ? v.sale : null;
  let markup = has('markup') ? v.markup : null;
  let margin = has('margin') ? v.margin : null;

  if (has('cost') && has('markup')) {
    if (markup < -100) return { err: { field: 'markup', msg: 'A markup below -100% would make the sale price negative.' } };
    sale = cost * (1 + markup / 100);
  } else if (has('cost') && has('margin')) {
    if (margin >= 100) return { err: { field: 'margin', msg: 'A margin of 100% or more is impossible; the sale price would be infinite.' } };
    sale = cost / (1 - margin / 100);
  } else if (has('sale') && has('markup')) {
    if (markup <= -100) return { err: { field: 'markup', msg: 'Markup must be above -100% to work back to a cost.' } };
    cost = sale / (1 + markup / 100);
  } else if (has('sale') && has('margin')) {
    if (margin > 100) return { err: { field: 'margin', msg: 'A margin above 100% would make the cost negative.' } };
    cost = sale * (1 - margin / 100);
  }

  const profit = sale - cost;
  if (!has('markup')) markup = cost > 0 ? (profit / cost) * 100 : null;
  if (!has('margin')) margin = sale > 0 ? (profit / sale) * 100 : null;

  return { values: { cost, sale, markup, margin, profit } };
}

(function () {
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);

  const els = {};
  FIELDS.forEach((f) => (els[f] = $(f)));
  const currencyEl = $('currency');

  const touched = {};
  // Most-recent-last; the last two entries are the knowns everything else
  // is calculated from.
  let editOrder = ['cost', 'sale'];

  const moneyFormatters = {};
  const money = (v) => {
    const code = currencyEl.value;
    if (!moneyFormatters[code]) {
      moneyFormatters[code] = new Intl.NumberFormat('en-GB', { style: 'currency', currency: code });
    }
    return moneyFormatters[code].format(v);
  };
  const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const pct = (v) => pctFmt.format(v) + '%';

  function promote(field) {
    editOrder = editOrder.filter((f) => f !== field);
    editOrder.push(field);
  }

  function parse(field) {
    const raw = els[field].value.trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function validDriver(field, n) {
    if (n === null) return false;
    if ((field === 'cost' || field === 'sale') && n < 0) return false;
    return true;
  }

  function driverError(field) {
    return field === 'cost' || field === 'sale'
      ? 'Enter a price of 0 or more.'
      : 'Enter a valid percentage.';
  }

  function setError(field, msg) {
    const slot = $('err-' + field);
    slot.textContent = msg;
    slot.hidden = !msg;
    if (msg) {
      els[field].setAttribute('aria-invalid', 'true');
    } else {
      els[field].removeAttribute('aria-invalid');
    }
  }

  function markComputed(field, isComputed) {
    els[field].classList.toggle('computed', isComputed);
    $('flag-' + field).hidden = !isComputed;
  }

  function setText(id, text) {
    $(id).textContent = text;
  }

  function clearOutputs(basis) {
    ['out-cost', 'out-sale', 'out-profit', 'out-markup', 'out-margin', 'out-total']
      .forEach((id) => setText(id, '—'));
    $('out-below-cost').hidden = true;
    setText('out-basis', basis);
  }

  function describe(drivers) {
    const names = { cost: 'cost', sale: 'sale price', markup: 'markup', margin: 'margin' };
    const ordered = FIELDS.filter((f) => drivers.includes(f));
    return 'Calculated from the ' + names[ordered[0]] + ' and ' + names[ordered[1]] + '.';
  }

  function refresh() {
    const drivers = editOrder.slice(-2);
    const computed = FIELDS.filter((f) => !drivers.includes(f));

    computed.forEach((f) => {
      markComputed(f, true);
      setError(f, '');
    });
    drivers.forEach((f) => markComputed(f, false));

    const v = {};
    drivers.forEach((f) => (v[f] = parse(f)));

    let driversOk = true;
    drivers.forEach((f) => {
      const ok = validDriver(f, v[f]);
      if (!ok) driversOk = false;
      setError(f, touched[f] && !ok ? driverError(f) : '');
    });

    if (!driversOk) {
      computed.forEach((f) => { els[f].value = ''; });
      clearOutputs('Enter any two values to calculate the rest.');
      return;
    }

    const result = compute(drivers, v);

    if (result.indeterminate) {
      computed.forEach((f) => { els[f].value = ''; });
      clearOutputs("Markup and margin alone can't fix a price. Enter a cost or sale price too.");
      return;
    }

    if (result.err) {
      setError(result.err.field, result.err.msg);
      computed.forEach((f) => { els[f].value = ''; });
      clearOutputs('Fix the highlighted field to calculate.');
      return;
    }

    const r = result.values;

    computed.forEach((f) => {
      els[f].value = r[f] === null ? '' : String(round2(r[f]));
    });

    setText('out-cost', money(round2(r.cost)));
    setText('out-sale', money(round2(r.sale)));
    setText('out-profit', money(round2(r.profit)));
    setText('out-markup', r.markup === null ? '—' : pct(r.markup));
    setText('out-margin', r.margin === null ? '—' : pct(r.margin));
    setText('out-total', money(round2(r.sale)));
    $('out-below-cost').hidden = r.profit >= 0;
    setText('out-basis', describe(drivers));
  }

  FIELDS.forEach((f) => {
    const el = els[f];
    el.addEventListener('input', () => { promote(f); refresh(); });
    el.addEventListener('change', () => { promote(f); refresh(); });
    el.addEventListener('blur', () => { touched[f] = true; refresh(); });
  });
  currencyEl.addEventListener('change', refresh);

  refresh();
  els.cost.focus();
})();
