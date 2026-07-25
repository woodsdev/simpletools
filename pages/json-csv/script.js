'use strict';

/* ---------- CSV parsing (RFC 4180, lenient) ---------- */

function parseCSV(text, delim) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let col = 1;
  let quoteLine = 0;
  let quoteCol = 0;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; col += 2; continue; }
        inQuotes = false; i++; col++; continue;
      }
      if (ch === '\n' || ch === '\r') {
        field += '\n';
        i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
        line++; col = 1; continue;
      }
      field += ch; i++; col++; continue;
    }
    if (ch === '"') {
      if (field === '') { inQuotes = true; quoteLine = line; quoteCol = col; i++; col++; continue; }
      field += ch; i++; col++; continue; // lenient: stray quote mid-field is literal
    }
    if (ch === delim) { row.push(field); field = ''; i++; col++; continue; }
    if (ch === '\n' || ch === '\r') {
      row.push(field); field = '';
      rows.push(row); row = [];
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line++; col = 1; continue;
    }
    field += ch; i++; col++;
  }

  if (inQuotes) {
    return { error: 'Unclosed quote starting at line ' + quoteLine + ', column ' + quoteCol + '.' };
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return { rows };
}

/* ---------- CSV writing ---------- */

function csvField(value, delim, guard) {
  let s = value === null || value === undefined ? '' : String(value);
  if (guard && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (s.indexOf(delim) !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
    s = '"' + s.split('"').join('""') + '"';
  }
  return s;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function flattenRow(obj, prefix, out) {
  Object.keys(obj).forEach((k) => {
    const key = prefix ? prefix + '.' + k : k;
    const v = obj[k];
    if (isPlainObject(v)) flattenRow(v, key, out);
    else out[key] = v;
  });
  return out;
}

// Everything that isn't a primitive is stringified into the cell, so the
// CSV stays lossless and re-parseable.
function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function jsonErrorMessage(err, text) {
  const msg = err && err.message ? err.message : 'could not parse.';
  if (/line \d+/.test(msg)) return 'Invalid JSON: ' + msg;
  const m = /position (\d+)/.exec(msg);
  if (m) {
    const pos = Number(m[1]);
    let line = 1;
    let col = 1;
    for (let i = 0; i < pos && i < text.length; i++) {
      if (text[i] === '\n') { line++; col = 1; } else { col++; }
    }
    return 'Invalid JSON: ' + msg + ' (line ' + line + ', column ' + col + ').';
  }
  return 'Invalid JSON: ' + msg;
}

function pluralise(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

function jsonToCSV(text, delim, flatten, guard) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: jsonErrorMessage(e, text) };
  }
  if (isPlainObject(data)) data = [data];
  if (!Array.isArray(data)) {
    return { error: 'Expected a JSON array (or a single object) at the top level.' };
  }
  if (data.length === 0) {
    return { error: 'The JSON array is empty, so there is nothing to convert.' };
  }

  // Array of arrays: emit as-is, no header row.
  if (data.every(Array.isArray)) {
    const lines = data.map((r) => r.map((v) => csvField(cellValue(v), delim, guard)).join(delim));
    const width = data.reduce((max, r) => Math.max(max, r.length), 0);
    return { output: lines.join('\r\n'), stats: pluralise(data.length, 'row') + ' · ' + pluralise(width, 'column') };
  }

  // Rows of objects (primitives become { value: ... }).
  const objRows = data.map((item) => {
    if (isPlainObject(item)) return flatten ? flattenRow(item, '', {}) : item;
    return { value: item };
  });

  const cols = [];
  const seen = new Set();
  objRows.forEach((r) => {
    Object.keys(r).forEach((k) => {
      if (!seen.has(k)) { seen.add(k); cols.push(k); }
    });
  });

  const head = cols.map((c) => csvField(c, delim, guard)).join(delim);
  const body = objRows.map((r) => cols.map((c) => csvField(cellValue(r[c]), delim, guard)).join(delim));
  return {
    output: [head].concat(body).join('\r\n'),
    stats: pluralise(objRows.length, 'row') + ' · ' + pluralise(cols.length, 'column')
  };
}

function csvToJSON(text, delim, headers, pretty) {
  const parsed = parseCSV(text, delim);
  if (parsed.error) return { error: parsed.error };

  // Drop fully empty lines (including the one after a trailing newline).
  const rows = parsed.rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) return { error: 'No rows found in that CSV.' };

  let data;
  let stats;
  if (headers) {
    if (rows.length === 1) return { error: 'Only a header row was found. Add at least one data row.' };
    const counts = {};
    const head = rows[0].map((h, idx) => {
      const name = h === '' ? 'column_' + (idx + 1) : h;
      if (counts[name] === undefined) { counts[name] = 1; return name; }
      counts[name]++;
      return name + '_' + counts[name];
    });
    data = rows.slice(1).map((r) => {
      const obj = {};
      head.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      for (let i = head.length; i < r.length; i++) obj['_extra' + (i - head.length + 1)] = r[i];
      return obj;
    });
    stats = pluralise(data.length, 'object') + ' · ' + pluralise(head.length, 'field');
  } else {
    data = rows;
    stats = pluralise(rows.length, 'row');
  }
  return { output: JSON.stringify(data, null, pretty ? 2 : 0), stats };
}

/* ---------- DOM wiring ---------- */

(function () {
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);

  const dirJ2C = $('dir-j2c');
  const dirC2J = $('dir-c2j');
  const delimEl = $('delimiter');
  const inEl = $('conv-in');
  const outEl = $('conv-out');
  const errEl = $('conv-err');
  const statsEl = $('conv-stats');
  const copyBtn = $('btn-copy');

  let outputKind = 'csv'; // what the output textarea currently holds

  function isJsonToCsv() {
    return dirJ2C.checked;
  }

  function setError(message) {
    errEl.textContent = message;
    errEl.hidden = !message;
    if (message) {
      inEl.setAttribute('aria-invalid', 'true');
    } else {
      inEl.removeAttribute('aria-invalid');
    }
  }

  function applyDirection() {
    const j2c = isJsonToCsv();
    $('opts-j2c').hidden = !j2c;
    $('opts-c2j').hidden = j2c;
    $('conv-in-label').textContent = j2c ? 'JSON input' : 'CSV input';
    $('conv-out-label').textContent = j2c ? 'CSV output' : 'JSON output';
    inEl.placeholder = j2c
      ? '[\n  { "name": "Ada", "role": "Engineer" }\n]'
      : 'name,role\nAda,Engineer';
    setError('');
  }

  function convert() {
    const text = inEl.value;
    if (text.trim() === '') {
      setError('Paste or upload something to convert first.');
      return;
    }
    const delim = delimEl.value === 'tab' ? '\t' : delimEl.value;
    const result = isJsonToCsv()
      ? jsonToCSV(text, delim, $('opt-flatten').checked, $('opt-guard').checked)
      : csvToJSON(text, delim, $('opt-headers').checked, $('opt-pretty').checked);

    if (result.error) {
      setError(result.error);
      outEl.value = '';
      statsEl.textContent = '';
      return;
    }
    setError('');
    outputKind = isJsonToCsv() ? 'csv' : 'json';
    outEl.value = result.output;
    statsEl.textContent = result.stats;
  }

  dirJ2C.addEventListener('change', applyDirection);
  dirC2J.addEventListener('change', applyDirection);

  $('btn-convert').addEventListener('click', convert);

  $('btn-clear').addEventListener('click', () => {
    inEl.value = '';
    setError('');
    inEl.focus();
  });

  $('conv-file').addEventListener('change', function () {
    const file = this.files && this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      inEl.value = String(reader.result);
      setError('');
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
    this.value = '';
  });

  copyBtn.addEventListener('click', () => {
    if (!outEl.value) return;
    const done = () => {
      copyBtn.textContent = 'Copied ✓';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(outEl.value).then(done, () => {
        outEl.select();
        done();
      });
    } else {
      outEl.select();
      document.execCommand('copy');
      done();
    }
  });

  $('btn-download').addEventListener('click', () => {
    if (!outEl.value) return;
    const blob = new Blob([outEl.value], {
      type: outputKind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.' + outputKind;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  applyDirection();
})();
