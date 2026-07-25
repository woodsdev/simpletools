'use strict';

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

// indent is a number of spaces, '\t' for tabs, or 0 to minify.
function formatJSON(text, indent) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: jsonErrorMessage(e, text) };
  }
  const output = JSON.stringify(data, null, indent);
  return {
    output,
    stats: pluralise(output.split('\n').length, 'line') + ' · ' + pluralise(output.length, 'character')
  };
}

(function () {
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);

  const inEl = $('fmt-in');
  const outEl = $('fmt-out');
  const errEl = $('fmt-err');
  const statsEl = $('fmt-stats');
  const copyBtn = $('btn-copy');

  function setError(message) {
    errEl.textContent = message;
    errEl.hidden = !message;
    if (message) {
      inEl.setAttribute('aria-invalid', 'true');
    } else {
      inEl.removeAttribute('aria-invalid');
    }
  }

  function indentValue() {
    const v = $('indent').value;
    return v === 'tab' ? '\t' : Number(v);
  }

  function run(indent) {
    const text = inEl.value;
    if (text.trim() === '') {
      setError('Paste or upload some JSON first.');
      return;
    }
    const result = formatJSON(text, indent);
    if (result.error) {
      setError(result.error);
      outEl.value = '';
      statsEl.textContent = '';
      return;
    }
    setError('');
    outEl.value = result.output;
    statsEl.textContent = result.stats;
  }

  $('btn-beautify').addEventListener('click', () => run(indentValue()));
  $('btn-minify').addEventListener('click', () => run(0));

  $('btn-clear').addEventListener('click', () => {
    inEl.value = '';
    setError('');
    inEl.focus();
  });

  $('fmt-file').addEventListener('change', function () {
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
    const blob = new Blob([outEl.value], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
