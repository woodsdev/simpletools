'use strict';

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Accepts a bare domain, a full URL, or an email address and returns just the domain part, lowercased.
function normaliseDomain(raw) {
  let s = String(raw).trim().toLowerCase();
  if (s.indexOf('@') !== -1) s = s.slice(s.lastIndexOf('@') + 1);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  return s.replace(/^\.+/, '').replace(/\.+$/, '');
}

function isValidDomain(s) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s);
}

// Pulls the tenant details out of Microsoft's openid-configuration response.
function extractTenantInfo(config) {
  const source = (config && (config.token_endpoint || config.issuer)) || '';
  const m = GUID_RE.exec(source);
  if (!m) return null;
  return {
    tenantId: m[0].toLowerCase(),
    region: (config && config.tenant_region_scope) || null,
    cloud: (config && config.cloud_instance_name) || null
  };
}

(function () {
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);

  const formEl = $('lookup');
  const domainEl = $('domain');
  const lookupBtn = $('btn-lookup');
  const copyBtn = $('btn-copy');

  let requestSeq = 0;
  let tenantId = '';

  function setError(msg) {
    const slot = $('err-domain');
    slot.textContent = msg;
    slot.hidden = !msg;
    if (msg) {
      domainEl.setAttribute('aria-invalid', 'true');
    } else {
      domainEl.removeAttribute('aria-invalid');
    }
  }

  function setText(id, text) {
    $(id).textContent = text;
  }

  function setFail(msg) {
    const slot = $('out-fail');
    slot.textContent = msg;
    slot.hidden = !msg;
  }

  function clearResult(basis) {
    tenantId = '';
    ['out-domain', 'out-region', 'out-cloud', 'out-tenant'].forEach((id) => setText(id, '—'));
    setText('out-basis', basis);
  }

  function render(domain, info) {
    tenantId = info.tenantId;
    setText('out-domain', domain);
    setText('out-region', info.region || '—');
    setText('out-cloud', info.cloud || '—');
    setText('out-tenant', info.tenantId);
    setText('out-basis', "Read from Microsoft's openid-configuration.");
  }

  async function lookUp(domain) {
    const seq = ++requestSeq;
    lookupBtn.disabled = true;
    setFail('');
    clearResult('Looking up ' + domain + '…');
    try {
      const resp = await fetch(
        'https://login.microsoftonline.com/' + encodeURIComponent(domain) + '/.well-known/openid-configuration'
      );
      if (seq !== requestSeq) return;
      if (resp.ok) {
        const config = await resp.json();
        if (seq !== requestSeq) return;
        const info = extractTenantInfo(config);
        if (info) {
          render(domain, info);
        } else {
          clearResult('Enter a domain to look it up.');
          setFail('Microsoft answered, but no tenant ID was found in the response.');
        }
      } else {
        clearResult('Enter a domain to look it up.');
        setFail('No Microsoft tenant found for ' + domain + '.');
      }
    } catch (e) {
      if (seq !== requestSeq) return;
      clearResult('Enter a domain to look it up.');
      setFail("Couldn't reach Microsoft's login service. Check your connection and try again.");
    } finally {
      if (seq === requestSeq) lookupBtn.disabled = false;
    }
  }

  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const domain = normaliseDomain(domainEl.value);
    if (domain === '') {
      setError('Enter a domain to look up.');
      return;
    }
    if (!isValidDomain(domain)) {
      setError("That doesn't look like a valid domain.");
      return;
    }
    setError('');
    lookUp(domain);
  });

  domainEl.addEventListener('input', () => setError(''));

  copyBtn.addEventListener('click', () => {
    if (!tenantId) return;
    const done = () => {
      copyBtn.textContent = 'Copied ✓';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tenantId).then(done, () => {});
    }
  });

  domainEl.focus();
})();
