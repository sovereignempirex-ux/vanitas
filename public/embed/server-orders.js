/* =========================================================================
   Vanitas "Request a Server" widget — drop-in embed for ANY website:

     <script src="https://YOUR-VANITAS-HOST/embed/server-orders.js"
             data-label="Request a Server"
             data-plan="spl_..."          (optional preselected plan id)
             data-position="bottom-right" (or bottom-left)
             defer></script>

   Renders a floating button + panel inside a CLOSED shadow root (the host
   page cannot touch it, its CSS cannot leak in). Reads the public plan
   catalog, submits an anonymous request to the public API (CORS '*'), and
   shows the one-time tracking token. Also offers a status-check screen.

   After a successful submission the widget fires a CustomEvent on window:

     window.addEventListener('vanitas:server-request', e => {
       // e.detail = { id, status, planName, trackToken, trackPath }
     });

   Programmatic API:  VanitasServers.open() / .close() / .track(token)
   ========================================================================= */
(function () {
  'use strict';
  if (window.VanitasServers) return;

  var script = document.currentScript;
  var ORIGIN = location.origin;
  try {
    if (script && script.src) ORIGIN = new URL(script.src, location.href).origin;
  } catch (e) {
    /* keep location.origin */
  }
  var API = ORIGIN + '/api/v1/servers';
  var LABEL = (script && script.getAttribute('data-label')) || 'Request a Server';
  var PLAN = (script && script.getAttribute('data-plan')) || '';
  var LEFT = (script && script.getAttribute('data-position')) === 'bottom-left';

  /* ------------------------------------------------------------------ host */
  var host = document.createElement('div');
  host.style.cssText =
    'all:initial;position:fixed;bottom:20px;' + (LEFT ? 'left:20px;' : 'right:20px;') + 'z-index:2147483000;';
  var root = host.attachShadow({ mode: 'closed' });

  var STYLE =
    ':host{all:initial}' +
    '.fab{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:11px 16px;' +
    'border-radius:999px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;' +
    'font:600 13px/1 system-ui,-apple-system,sans-serif;box-shadow:0 10px 30px -8px rgba(37,99,235,.7);' +
    'transition:transform .15s ease, box-shadow .15s ease}' +
    '.fab:hover{transform:translateY(-1px);box-shadow:0 14px 34px -8px rgba(37,99,235,.8)}' +
    '.fab svg{width:16px;height:16px;flex:none}' +
    '.panel{position:fixed;bottom:74px;' + (LEFT ? 'left:20px;' : 'right:20px;') +
    'width:min(360px, calc(100vw - 40px));max-height:min(78vh, 640px);display:flex;flex-direction:column;' +
    'border-radius:16px;background:#0b1220;color:#cbd5e1;overflow:hidden;' +
    'border:1px solid rgba(148,163,184,.18);box-shadow:0 24px 70px -18px rgba(0,0,0,.8);' +
    'font:13px/1.5 system-ui,-apple-system,sans-serif}' +
    '.panel[hidden]{display:none}' +
    '.head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.14);' +
    'background:linear-gradient(180deg,rgba(14,165,233,.14),transparent)}' +
    '.head b{flex:1;font-size:13px;color:#f1f5f9;letter-spacing:.02em}' +
    '.x{all:unset;cursor:pointer;width:26px;height:26px;display:flex;align-items:center;justify-content:center;' +
    'border-radius:8px;color:#94a3b8;font-size:15px}' +
    '.x:hover{background:rgba(148,163,184,.12);color:#f1f5f9}' +
    '.body{padding:14px;overflow-y:auto}' +
    'label{display:block;margin:0 0 10px;font-size:11px;font-weight:600;color:#94a3b8;' +
    'text-transform:uppercase;letter-spacing:.07em}' +
    'input,select,textarea{all:unset;box-sizing:border-box;display:block;width:100%;margin-top:5px;' +
    'padding:9px 11px;border-radius:10px;background:rgba(2,6,23,.72);color:#e2e8f0;' +
    'font:13px system-ui,sans-serif;border:1px solid rgba(148,163,184,.22)}' +
    'input:focus,select:focus,textarea:focus{border-color:#38bdf8}' +
    'textarea{min-height:64px;resize:vertical}' +
    'select option{background:#0b1220;color:#e2e8f0}' +
    '.btn{all:unset;cursor:pointer;display:block;width:100%;text-align:center;padding:10px 12px;' +
    'border-radius:10px;background:#0ea5e9;color:#04101d;font:700 13px system-ui,sans-serif}' +
    '.btn:hover{background:#38bdf8}' +
    '.btn[disabled]{opacity:.5;cursor:default}' +
    '.btn.ghost{background:transparent;color:#7dd3fc;border:1px solid rgba(56,189,248,.4);font-weight:600}' +
    '.btn.ghost:hover{background:rgba(56,189,248,.1)}' +
    '.err{margin:8px 0 0;padding:8px 10px;border-radius:8px;background:rgba(244,63,94,.12);' +
    'color:#fda4af;font-size:12px}' +
    '.err[hidden]{display:none}' +
    '.hp{position:absolute!important;left:-5000px;top:auto;width:1px;height:1px;overflow:hidden}' +
    '.sub{margin:10px 0 0;font-size:11px;color:#64748b;line-height:1.5}' +
    '.ok{text-align:center;padding:6px 0 2px}' +
    '.ok .tick{width:44px;height:44px;margin:0 auto 10px;border-radius:50%;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(16,185,129,.15);color:#34d399;font-size:22px}' +
    '.ok h4{margin:0 0 4px;font-size:15px;color:#f1f5f9}' +
    '.ok p{margin:0;font-size:12px;color:#94a3b8}' +
    '.token{margin:12px 0 8px;padding:10px;border-radius:10px;background:rgba(2,6,23,.8);' +
    'border:1px dashed rgba(56,189,248,.45);font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'color:#67e8f9;word-break:break-all;user-select:all}' +
    '.warn{margin:0 0 10px;font-size:11px;color:#fbbf24;text-align:center}' +
    '.badge{display:inline-block;padding:3px 9px;border-radius:999px;font:700 10px/1.4 system-ui,sans-serif;' +
    'text-transform:uppercase;letter-spacing:.08em}' +
    '.st-pending{background:rgba(245,158,11,.15);color:#fcd34d}' +
    '.st-approved{background:rgba(59,130,246,.15);color:#93c5fd}' +
    '.st-delivered{background:rgba(16,185,129,.15);color:#6ee7b7}' +
    '.st-rejected{background:rgba(244,63,94,.15);color:#fda4af}' +
    '.card{margin-top:10px;padding:12px;border-radius:12px;background:rgba(2,6,23,.6);' +
    'border:1px solid rgba(148,163,184,.16)}' +
    '.card dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 10px;font-size:12px}' +
    '.card dt{color:#64748b}' +
    '.card dd{margin:0;color:#e2e8f0;word-break:break-word}' +
    '.card .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#7dd3fc}' +
    '.note{margin:10px 0 0;padding:9px 10px;border-radius:8px;background:rgba(56,189,248,.08);' +
    'border-left:2px solid #38bdf8;font-size:12px;color:#bae6fd;white-space:pre-wrap}' +
    '.foot{padding:10px 14px;border-top:1px solid rgba(148,163,184,.12);text-align:center}' +
    '.link{all:unset;cursor:pointer;font-size:11px;color:#7dd3fc;text-decoration:underline}' +
    '.link:hover{color:#bae6fd}' +
    '.plan{font-size:12px;color:#94a3b8;margin:0 0 10px}';

  root.innerHTML =
    '<style>' + STYLE + '</style>' +
    '<button class="fab" type="button" aria-haspopup="dialog">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/>' +
    '<line x1="6" y1="6.5" x2="6.01" y2="6.5"/><line x1="6" y1="17.5" x2="6.01" y2="17.5"/></svg>' +
    '<span></span></button>' +
    '<div class="panel" role="dialog" aria-label="Server request" hidden>' +
    '<div class="head"><b></b><button class="x" type="button" aria-label="Close">&#10005;</button></div>' +
    '<div class="body"></div>' +
    '<div class="foot" hidden></div>' +
    '</div>';

  var fab = root.querySelector('.fab');
  var fabLabel = root.querySelector('.fab span');
  var panel = root.querySelector('.panel');
  var title = root.querySelector('.head b');
  var closeBtn = root.querySelector('.x');
  var body = root.querySelector('.body');
  var foot = root.querySelector('.foot');

  fabLabel.textContent = LABEL;
  title.textContent = 'Vanitas — Server Request';

  /* ------------------------------------------------------------- helpers */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k]; // only ever our own literals
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function jsonFetch(path, opts) {
    return fetch(API + path, opts).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || 'Request failed (' + res.status + ')');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function copy(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () {
        btn.textContent = old;
      }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch (e) {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
  }

  function statusBadge(status) {
    var s = ['pending', 'approved', 'delivered', 'rejected'].indexOf(status) >= 0 ? status : 'pending';
    return el('span', { 'class': 'badge st-' + s, text: s });
  }

  function deliveryCard(delivery) {
    var dl = el('dl', null, [
      el('dt', { text: 'Host' }),
      el('dd', { 'class': 'mono', text: delivery.host }),
      el('dt', { text: 'SSH user' }),
      el('dd', { 'class': 'mono', text: delivery.sshUser || 'root' }),
      el('dt', { text: 'Port' }),
      el('dd', { 'class': 'mono', text: String(delivery.sshPort || 22) }),
    ]);
    if (delivery.credentialsNote) {
      dl.appendChild(el('dt', { text: 'Notes' }));
      dl.appendChild(el('dd', { text: delivery.credentialsNote }));
    }
    return el('div', { 'class': 'card' }, [dl]);
  }

  /* ---------------------------------------------------------- form screen */
  var plansCache = null;

  function showForm() {
    foot.hidden = true;
    foot.textContent = '';
    title.textContent = 'Vanitas — Server Request';

    var planSelect = el('select', { id: 'vs-plan', required: 'required' }, [
      el('option', { value: '', text: 'Loading plans…' }),
    ]);
    var nameInput = el('input', { id: 'vs-name', required: 'required', maxlength: '80', placeholder: 'Your name' });
    var emailInput = el('input', {
      id: 'vs-email',
      type: 'email',
      required: 'required',
      maxlength: '160',
      placeholder: 'you@example.com',
    });
    var noteInput = el('textarea', {
      maxlength: '1000',
      placeholder: 'Anything we should know (optional)',
    });
    // Honeypot: invisible to humans, irresistible to dumb bots.
    var hp = el('input', { 'class': 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    var errBox = el('p', { 'class': 'err', hidden: 'hidden' });
    var submit = el('button', { 'class': 'btn', type: 'submit', text: 'Submit request' });

    var planLabel = el('label', { text: 'Plan' }, [planSelect]);
    var nameLabel = el('label', { text: 'Name' }, [nameInput]);
    var emailLabel = el('label', { text: 'Email' }, [emailInput]);
    var noteLabel = el('label', { text: 'Notes (optional)' }, [noteInput]);

    var form = el(
      'form',
      null,
      [
        planLabel,
        nameLabel,
        emailLabel,
        noteLabel,
        hp,
        errBox,
        submit,
        el('p', {
          'class': 'sub',
          text: 'Submitting creates a request with a one-time tracking token — no account needed.',
        }),
      ],
    );

    body.textContent = '';
    body.appendChild(form);

    function fillPlans(plans) {
      planSelect.textContent = '';
      if (!plans.length) {
        planSelect.appendChild(el('option', { value: '', text: 'No plans published yet — check back soon' }));
        submit.disabled = true;
        return;
      }
      planSelect.appendChild(el('option', { value: '', text: 'Choose a plan…' }));
      plans.forEach(function (p) {
        var label = p.name + (p.price ? ' — ' + p.price : '') + (p.specs ? ' · ' + p.specs : '');
        var opt = el('option', { value: p.id, text: label });
        if (PLAN && p.id === PLAN) opt.selected = 'selected';
        planSelect.appendChild(opt);
      });
    }

    if (plansCache) fillPlans(plansCache);
    else {
      jsonFetch('/plans')
        .then(function (data) {
          plansCache = data.plans || [];
          fillPlans(plansCache);
        })
        .catch(function () {
          planSelect.textContent = '';
          planSelect.appendChild(el('option', { value: '', text: 'Could not load plans — retry later' }));
          submit.disabled = true;
        });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errBox.hidden = true;
      var planId = planSelect.value;
      var name = nameInput.value.trim();
      var email = emailInput.value.trim();
      var note = noteInput.value.trim();
      if (!planId || !name || !email) {
        errBox.textContent = 'Plan, name and email are required.';
        errBox.hidden = false;
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Submitting…';
      jsonFetch('/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: planId, name: name, email: email, note: note, website: hp.value }),
      })
        .then(function (data) {
          showSuccess(data);
        })
        .catch(function (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
          submit.disabled = false;
          submit.textContent = 'Submit request';
        });
    });
  }

  /* -------------------------------------------------------- success screen */
  function showSuccess(data) {
    foot.hidden = false;
    foot.textContent = '';
    title.textContent = 'Request received';

    var trackUrl = ORIGIN + data.trackPath;
    var tokenBox = el('div', { 'class': 'token', text: data.trackToken });
    var copyBtn = el('button', { 'class': 'btn ghost', type: 'button', text: 'Copy tracking token' });
    copyBtn.addEventListener('click', function () {
      copy(data.trackToken, copyBtn);
    });

    body.textContent = '';
    body.appendChild(
      el('div', { 'class': 'ok' }, [
        el('div', { 'class': 'tick', text: '✓' }),
        el('h4', { text: 'Your request is in the queue' }),
        el('p', { text: data.planName + ' · status: ' + data.status }),
      ]),
    );
    body.appendChild(el('p', { 'class': 'warn', text: 'Save this token now — it is shown only once:' }));
    body.appendChild(tokenBox);
    body.appendChild(copyBtn);

    var openTrack = el('button', { 'class': 'btn ghost', type: 'button', text: 'Check status', style: 'margin-top:8px' });
    openTrack.addEventListener('click', function () {
      showTrackForm(data.trackToken);
    });
    body.appendChild(openTrack);

    foot.appendChild(
      el('a', {
        'class': 'link',
        href: trackUrl,
        target: '_blank',
        rel: 'noopener',
        text: 'Open the tracking page in a new tab',
      }),
    );

    // Notify the embedding page (its own customer — same party that
    // embedded the widget). The token travels too: the host site could
    // only ever see what its own visitor typed into this form anyway.
    try {
      window.dispatchEvent(
        new CustomEvent('vanitas:server-request', {
          detail: {
            id: data.id,
            status: data.status,
            planName: data.planName,
            trackToken: data.trackToken,
            trackPath: data.trackPath,
          },
        }),
      );
    } catch (e) {
      /* old browsers */
    }
  }

  /* ------------------------------------------------------------ track view */
  function showTrackForm(prefill) {
    foot.hidden = true;
    foot.textContent = '';
    title.textContent = 'Track a request';

    var tokenInput = el('input', {
      type: 'text',
      value: prefill || '',
      placeholder: 'vnt_strk_…',
      spellcheck: 'false',
    });
    var errBox = el('p', { 'class': 'err', hidden: 'hidden' });
    var go = el('button', { 'class': 'btn', type: 'submit', text: 'Check status' });
    var form = el('form', null, [
      el('label', { text: 'Tracking token' }, [tokenInput]),
      errBox,
      go,
      el('p', { 'class': 'sub', text: 'Paste the token you received when submitting the request.' }),
    ]);
    body.textContent = '';
    body.appendChild(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errBox.hidden = true;
      var token = tokenInput.value.trim();
      if (!token) {
        errBox.textContent = 'Paste a tracking token first.';
        errBox.hidden = false;
        return;
      }
      go.disabled = true;
      go.textContent = 'Looking up…';
      jsonFetch('/requests/track/' + encodeURIComponent(token))
        .then(function (data) {
          showTrackResult(data.request, token);
        })
        .catch(function (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
          go.disabled = false;
          go.textContent = 'Check status';
        });
    });

    if (prefill) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  function showTrackResult(req, token) {
    foot.hidden = false;
    foot.textContent = '';
    title.textContent = 'Request status';

    body.textContent = '';
    body.appendChild(
      el('div', { 'class': 'plan' }, [
        el('strong', { text: req.planName }),
        document.createTextNode(' for '),
        el('strong', { text: req.requesterName }),
      ]),
    );
    body.appendChild(el('p', { style: 'margin:0 0 4px' }, [statusBadge(req.status)]));

    if (req.reviewNote) {
      body.appendChild(el('div', { 'class': 'note', text: 'From the team: ' + req.reviewNote }));
    }
    if (req.delivery) body.appendChild(deliveryCard(req.delivery));

    body.appendChild(
      el('div', { 'class': 'card' }, [
        el('dl', null, [
          el('dt', { text: 'Submitted' }),
          el('dd', { text: new Date(req.createdAt).toLocaleString() }),
          el('dt', { text: 'Updated' }),
          el('dd', { text: new Date(req.updatedAt).toLocaleString() }),
          el('dt', { text: 'Request ID' }),
          el('dd', { 'class': 'mono', text: req.id }),
        ]),
      ]),
    );

    var again = el('button', { 'class': 'btn ghost', type: 'button', text: 'Track another request', style: 'margin-top:12px' });
    again.addEventListener('click', function () {
      showTrackForm('');
    });
    body.appendChild(again);

    var copyBtn = el('button', { 'class': 'btn ghost', type: 'button', text: 'Copy tracking token', style: 'margin-top:8px' });
    copyBtn.addEventListener('click', function () {
      copy(token, copyBtn);
    });
    body.appendChild(copyBtn);
  }

  /* ---------------------------------------------------------------- open */
  function open(view, token) {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    if (view === 'track') showTrackForm(token);
    else showForm();
  }
  function close() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
  }

  fab.addEventListener('click', function () {
    if (panel.hidden) open('form');
    else close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  window.VanitasServers = {
    open: function () {
      open('form');
    },
    close: close,
    track: function (token) {
      open('track', token);
    },
  };

  if (document.body) document.body.appendChild(host);
  else document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(host);
  });
})();
