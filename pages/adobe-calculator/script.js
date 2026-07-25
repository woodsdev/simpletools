'use strict';

var MS_PER_DAY = 86400000;

function parseDateUTC(str) {
  if (!str) return null;
  var parts = str.split('-');
  if (parts.length !== 3) return null;
  var y = Number(parts[0]);
  var m = Number(parts[1]);
  var d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysBetween(currentUTC, renewalUTC) {
  return Math.round((renewalUTC - currentUTC) / MS_PER_DAY);
}

function divisorFor(currentUTC, renewalUTC) {
  var startYear = new Date(currentUTC).getUTCFullYear();
  var endYear = new Date(renewalUTC).getUTCFullYear();
  for (var y = startYear; y <= endYear; y++) {
    if (!isLeapYear(y)) continue;
    var feb29 = Date.UTC(y, 1, 29);
    if (currentUTC <= feb29 && feb29 < renewalUTC) return 366;
  }
  return 365;
}

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function calculate(input) {
  var days = daysBetween(input.currentUTC, input.renewalUTC);
  var divisor = divisorFor(input.currentUTC, input.renewalUTC);
  var costPerLicence = round2((input.yearlyCost / divisor) * days);
  var salePerLicence = round2((input.yearlySale / divisor) * days);
  var totalCost = round2(costPerLicence * input.qty);
  var totalSale = round2(salePerLicence * input.qty);
  return {
    days: days,
    divisor: divisor,
    costPerLicence: costPerLicence,
    salePerLicence: salePerLicence,
    totalCost: totalCost,
    totalSale: totalSale
  };
}

(function () {
  if (typeof document === 'undefined') return;

  function $(id) {
    return document.getElementById(id);
  }

  var currentEl = $('current-date');
  var renewalEl = $('renewal-date');
  var costEl = $('cost-year');
  var saleEl = $('sale-year');
  var qtyEl = $('qty');
  var currencyEl = $('currency');

  var touched = {};
  var formatters = {};

  function money(code, value) {
    if (!formatters[code]) {
      formatters[code] = new Intl.NumberFormat('en-GB', { style: 'currency', currency: code });
    }
    return formatters[code].format(value);
  }

  function todayLocalISO() {
    var now = new Date();
    return now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }
  
  function plusOneYearFromToday() {
    var now = new Date();
    // Date() normalises 29 Feb + 1 year to 1 Mar instead of an invalid date.
    var next = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    return next.getFullYear() + '-' +
      String(next.getMonth() + 1).padStart(2, '0') + '-' +
      String(next.getDate()).padStart(2, '0');
  }

  function isoFromUTC(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function setError(input, slotId, message) {
    var slot = $(slotId);
    slot.textContent = message;
    slot.hidden = !message;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function setText(id, text) {
    $(id).textContent = text;
  }

  function numberOrNull(raw) {
    return raw === '' ? null : Number(raw);
  }

  function refresh() {
    var currentUTC = parseDateUTC(currentEl.value);
    var renewalUTC = parseDateUTC(renewalEl.value);
    var yearlyCost = numberOrNull(costEl.value);
    var yearlySale = numberOrNull(saleEl.value);
    var qty = numberOrNull(qtyEl.value);
    var code = currencyEl.value;

    if (currentUTC !== null) {
      renewalEl.min = isoFromUTC(currentUTC + MS_PER_DAY);
    }

    var dateOrderBad = currentUTC !== null && renewalUTC !== null && renewalUTC <= currentUTC;
    setError(renewalEl, 'err-renewal', dateOrderBad ? 'Renewal date must be after the current date.' : '');

    var costOk = yearlyCost !== null && Number.isFinite(yearlyCost) && yearlyCost >= 0;
    var saleOk = yearlySale !== null && Number.isFinite(yearlySale) && yearlySale >= 0;
    var qtyOk = qty !== null && Number.isInteger(qty) && qty >= 1;

    setError(costEl, 'err-cost',
      (touched.cost && !costOk) ? 'Enter a yearly price of 0 or more.' : '');
    setError(saleEl, 'err-sale',
      (touched.sale && !saleOk) ? 'Enter a yearly price of 0 or more.' : '');
    setError(qtyEl, 'err-qty',
      (touched.qty && !qtyOk) ? 'Enter a whole number of 1 or more.' : '');

    var datesOk = currentUTC !== null && renewalUTC !== null && !dateOrderBad;

    if (datesOk) {
      var days = daysBetween(currentUTC, renewalUTC);
      var divisor = divisorFor(currentUTC, renewalUTC);
      setText('out-days', days + (days === 1 ? ' day' : ' days'));
      setText('out-basis', 'Remaining term priced over a ' + divisor + '-day year' +
        (divisor === 366 ? ' (29 Feb falls in the term).' : '.'));
    } else {
      setText('out-days', '— days');
      setText('out-basis', dateOrderBad
        ? 'Fix the dates to price the term.'
        : 'Enter a renewal date to price the term.');
    }

    setText('out-order-qty', qtyOk ? qty + (qty === 1 ? ' licence' : ' licences') : '— licences');

    if (datesOk && costOk && saleOk && qtyOk) {
      var r = calculate({
        currentUTC: currentUTC,
        renewalUTC: renewalUTC,
        yearlyCost: yearlyCost,
        yearlySale: yearlySale,
        qty: qty
      });
      setText('out-cost', money(code, r.costPerLicence));
      setText('out-sale', money(code, r.salePerLicence));
      setText('out-total-cost', money(code, r.totalCost));
      setText('out-total-sale', money(code, r.totalSale));
      $('out-below-cost').hidden = r.totalSale >= r.totalCost;
    } else {
      var placeholders = ['out-cost', 'out-sale', 'out-total-cost', 'out-total-sale'];
      for (var i = 0; i < placeholders.length; i++) setText(placeholders[i], '—');
      $('out-below-cost').hidden = true;
    }
  }

  var watched = [
    [currentEl, 'current'],
    [renewalEl, 'renewal'],
    [costEl, 'cost'],
    [saleEl, 'sale'],
    [qtyEl, 'qty'],
    [currencyEl, 'currency']
  ];

  watched.forEach(function (pair) {
    var el = pair[0];
    var key = pair[1];
    el.addEventListener('input', refresh);
    el.addEventListener('change', refresh);
    el.addEventListener('blur', function () {
      touched[key] = true;
      refresh();
    });
  });

  currentEl.value = todayLocalISO();
  renewalEl.value = plusOneYearFromToday();
  refresh();
  renewalEl.focus();
})();
