'use strict';

// Comment syntax per language. Strings are scanned so comment markers inside
// them are ignored; longer string delimiters must come first (Python's
// triple quotes before the single ones). escGuard skips a marker preceded by
// a backslash, which keeps regex literals like /https:\/\// intact.
const LANGUAGES = {
  javascript: {
    label: 'JavaScript / TypeScript', ext: 'js', escGuard: true,
    line: ['//'], block: [{ open: '/*', close: '*/' }],
    strings: [
      { open: '"', close: '"', esc: true },
      { open: "'", close: "'", esc: true },
      { open: '`', close: '`', esc: true }
    ]
  },
  'c-family': {
    label: 'C-family', ext: 'txt', escGuard: true,
    line: ['//'], block: [{ open: '/*', close: '*/' }],
    strings: [
      { open: '"', close: '"', esc: true },
      { open: "'", close: "'", esc: true },
      { open: '`', close: '`', esc: false }
    ]
  },
  python: {
    label: 'Python', ext: 'py', shebang: true,
    line: ['#'], block: [],
    strings: [
      { open: '"""', close: '"""', esc: true },
      { open: "'''", close: "'''", esc: true },
      { open: '"', close: '"', esc: true },
      { open: "'", close: "'", esc: true }
    ]
  },
  html: {
    label: 'HTML / XML', ext: 'html',
    line: [], block: [{ open: '<!--', close: '-->' }],
    strings: []
  },
  css: {
    label: 'CSS', ext: 'css',
    line: [], block: [{ open: '/*', close: '*/' }],
    strings: [
      { open: '"', close: '"', esc: true },
      { open: "'", close: "'", esc: true }
    ]
  },
  sql: {
    label: 'SQL', ext: 'sql',
    line: ['--'], block: [{ open: '/*', close: '*/' }],
    strings: [
      { open: "'", close: "'", esc: false },
      { open: '"', close: '"', esc: false }
    ]
  },
  shell: {
    label: 'Shell', ext: 'sh', shebang: true,
    line: ['#'], block: [],
    strings: [
      { open: '"', close: '"', esc: true },
      { open: "'", close: "'", esc: false }
    ]
  },
  ruby: {
    label: 'Ruby', ext: 'rb', shebang: true,
    line: ['#'],
    block: [{ open: '=begin', close: '\n=end', atLineStart: true, toLineEnd: true }],
    strings: [
      { open: '"', close: '"', esc: true },
      { open: "'", close: "'", esc: true }
    ]
  },
  yaml: {
    label: 'YAML', ext: 'yml',
    line: ['#'], block: [],
    strings: [
      { open: '"', close: '"', esc: true },
      { open: "'", close: "'", esc: false }
    ]
  },
  lua: {
    label: 'Lua', ext: 'lua',
    line: ['--'], block: [{ open: '--[[', close: ']]' }],
    strings: [
      { open: '"', close: '"', esc: true },
      { open: "'", close: "'", esc: true }
    ]
  },
  php: {
    label: 'PHP', ext: 'php', escGuard: true,
    line: ['//', '#'], block: [{ open: '/*', close: '*/' }],
    strings: [
      { open: '"', close: '"', esc: true },
      { open: "'", close: "'", esc: true }
    ]
  }
};

// Removes comments while preserving line structure, so line N of the output
// is line N of the input. The tidy pass then drops lines that only held a
// comment, and trailing whitespace is trimmed from lines that changed.
function stripComments(code, langKey, tidy) {
  const lang = LANGUAGES[langKey];
  let out = '';
  let i = 0;
  const n = code.length;
  let count = 0;

  if (lang.shebang && code.slice(0, 2) === '#!') {
    const nl = code.indexOf('\n');
    const end = nl === -1 ? n : nl;
    out = code.slice(0, end);
    i = end;
  }

  outer: while (i < n) {
    const guarded = lang.escGuard && i > 0 && code[i - 1] === '\\';

    if (!guarded) {
      for (const b of lang.block) {
        if (!code.startsWith(b.open, i)) continue;
        if (b.atLineStart && i !== 0 && code[i - 1] !== '\n') continue;
        count++;
        const closeIdx = code.indexOf(b.close, i + b.open.length);
        let j = closeIdx === -1 ? n : closeIdx + b.close.length;
        if (b.toLineEnd && closeIdx !== -1) {
          const nl = code.indexOf('\n', j);
          j = nl === -1 ? n : nl;
        }
        const removed = code.slice(i, j);
        out += '\n'.repeat(removed.split('\n').length - 1);
        i = j;
        continue outer;
      }
      for (const marker of lang.line) {
        if (!code.startsWith(marker, i)) continue;
        count++;
        const nl = code.indexOf('\n', i);
        i = nl === -1 ? n : nl;
        continue outer;
      }
    }

    for (const s of lang.strings) {
      if (!code.startsWith(s.open, i)) continue;
      let j = i + s.open.length;
      while (j < n) {
        if (s.esc && code[j] === '\\') { j += 2; continue; }
        if (code.startsWith(s.close, j)) { j += s.close.length; break; }
        j++;
      }
      if (j > n) j = n;
      out += code.slice(i, j);
      i = j;
      continue outer;
    }

    out += code[i];
    i++;
  }

  const inLines = code.split('\n');
  const outLines = out.split('\n');
  const kept = [];
  for (let k = 0; k < outLines.length; k++) {
    let line = outLines[k];
    const changed = line !== (inLines[k] === undefined ? '' : inLines[k]);
    if (changed) line = line.replace(/[ \t]+$/, '');
    if (tidy && changed && line.trim() === '' && inLines[k].trim() !== '') continue;
    kept.push(line);
  }

  return { output: kept.join('\n'), count };
}

// Best-guess language detection: hard signals first, then a weighted score.
function detectLanguage(code) {
  const firstLine = code.slice(0, code.indexOf('\n') === -1 ? code.length : code.indexOf('\n'));
  if (code.indexOf('<?php') !== -1) return 'php';
  if (firstLine.slice(0, 2) === '#!') {
    if (/python/.test(firstLine)) return 'python';
    if (/node/.test(firstLine)) return 'javascript';
    if (/ruby/.test(firstLine)) return 'ruby';
    return 'shell';
  }
  if (/^\s*(<!DOCTYPE|<\?xml|<html|<svg)/i.test(code)) return 'html';

  const SIGNALS = [
    [/^\s*def \w+\s*\(.*\)\s*:/m, 'python', 4],
    [/^\s*(from \w[\w.]* )?import \w/m, 'python', 2],
    [/^\s*elif .*:/m, 'python', 3],
    [/\bself\./, 'python', 2],
    [/"""/, 'python', 2],
    [/^import .+ from ['"]/m, 'javascript', 5],
    [/\b(const|let)\s+\w+\s*=/, 'javascript', 3],
    [/=>/, 'javascript', 2],
    [/\bfunction\s*\w*\s*\(/, 'javascript', 2],
    [/\bconsole\.\w+\(/, 'javascript', 3],
    [/===|!==/, 'javascript', 2],
    [/\brequire\(['"]/, 'javascript', 3],
    [/^\s*#include\s*[<"]/m, 'c-family', 6],
    [/\busing System/, 'c-family', 5],
    [/\bpublic\s+(class|static|void)\b/, 'c-family', 4],
    [/\bstd::/, 'c-family', 5],
    [/^package \w+$/m, 'c-family', 3],
    [/\bfunc \w+\(/, 'c-family', 3],
    [/\bfn \w+\(/, 'c-family', 3],
    [/<\/(div|span|p|a|ul|li|body|head|script|style|table)>/i, 'html', 4],
    [/<(div|span|br|img|meta|link|input)\b/i, 'html', 2],
    [/<!--/, 'html', 2],
    [/@(media|import|keyframes|font-face)\b/, 'css', 4],
    [/^\s*[.#][\w-]+[^{;]*\{/m, 'css', 3],
    [/:\s*(#[0-9a-f]{3,8}|\d+(px|rem|em|vw|vh)|bold|flex|grid|absolute)\b/i, 'css', 3],
    [/\b(select\s+[\s\S]+?\bfrom|insert\s+into|create\s+table|update\s+\w+\s+set|delete\s+from)\b/i, 'sql', 5],
    [/^\s*--(?!\[)/m, 'sql', 1],
    [/^\s*(fi|done|esac)\s*$/m, 'shell', 4],
    [/^\s*(if \[|for \w+ in |echo )/m, 'shell', 2],
    [/\bdo \|\w+\|/, 'ruby', 5],
    [/^\s*require ['"][\w\/]+['"]$/m, 'ruby', 3],
    [/\bputs /, 'ruby', 3],
    [/^=begin/m, 'ruby', 5],
    [/^[ \t]*[\w-]+:[ \t]+\S/m, 'yaml', 1],
    [/^[ \t]*- \w/m, 'yaml', 2],
    [/^---$/m, 'yaml', 2],
    [/\blocal (function |\w+\s*=)/, 'lua', 5],
    [/--\[\[/, 'lua', 5],
    [/\b(elseif .+ then|end\)|\bnil\b)/, 'lua', 2],
    [/^\s*#(?!!)/m, 'python', 1],
    [/\/\//, 'javascript', 1],
    [/\/\*/, 'css', 1]
  ];

  const scores = {};
  for (const [re, langKey, weight] of SIGNALS) {
    if (re.test(code)) scores[langKey] = (scores[langKey] || 0) + weight;
  }
  // YAML has no braces or semicolons; penalise it when they show up.
  if (/[{};]/.test(code)) scores.yaml = (scores.yaml || 0) - 3;

  const order = ['javascript', 'python', 'html', 'css', 'c-family', 'sql', 'shell', 'ruby', 'yaml', 'lua', 'php'];
  let best = 'javascript';
  let bestScore = -Infinity;
  for (const key of order) {
    const s = scores[key] || 0;
    if (s > bestScore) { best = key; bestScore = s; }
  }
  return best;
}

function pluralise(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

(function () {
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);

  const inEl = $('cr-in');
  const outEl = $('cr-out');
  const errEl = $('cr-err');
  const statsEl = $('cr-stats');
  const copyBtn = $('btn-copy');

  let usedLang = 'javascript';

  function setError(message) {
    errEl.textContent = message;
    errEl.hidden = !message;
    if (message) {
      inEl.setAttribute('aria-invalid', 'true');
    } else {
      inEl.removeAttribute('aria-invalid');
    }
  }

  function run() {
    const code = inEl.value;
    if (code.trim() === '') {
      setError('Paste or upload some code first.');
      return;
    }
    setError('');
    const choice = $('language').value;
    const auto = choice === 'auto';
    usedLang = auto ? detectLanguage(code) : choice;
    const result = stripComments(code, usedLang, $('opt-tidy').checked);
    outEl.value = result.output;
    statsEl.textContent = (auto ? 'Detected: ' : '') + LANGUAGES[usedLang].label + ' · ' +
      (result.count === 0 ? 'no comments found' : pluralise(result.count, 'comment') + ' removed');
  }

  $('btn-remove').addEventListener('click', run);

  $('btn-clear').addEventListener('click', () => {
    inEl.value = '';
    setError('');
    inEl.focus();
  });

  $('cr-file').addEventListener('change', function () {
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
    const blob = new Blob([outEl.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code.' + LANGUAGES[usedLang].ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
