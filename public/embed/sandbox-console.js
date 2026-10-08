/* Vanitas sandbox wrapper console — toolbar + SANDBOX TERMINAL.
   Loaded by serveSandboxPreview (external file: the platform serves
   script-src 'self', so inline scripts would be blocked).

   Talks to /embed/sandbox-bridge.js inside the iframe over postMessage.
   The frame's origin is null (sandboxed, no allow-same-origin), so the
   trust check is the SOURCE WINDOW (e.source === frame.contentWindow),
   never the origin header. */
(function () {
  'use strict';
  var frame = document.getElementById('frame');
  if (!frame) return;

  var term = document.getElementById('term');
  var out = document.getElementById('term-out');
  var input = document.getElementById('term-input');
  var form = document.getElementById('term-form');
  var loader = document.getElementById('loader');
  var badgeErr = document.getElementById('badge-err');
  var badgeLog = document.getElementById('badge-log');
  var btnConsole = document.getElementById('btn-console');

  var MAX_LINES = 500;
  var history = [];
  var histPos = -1;
  var evalSeq = 0;
  var errorCount = 0;

  function stamp() {
    var d = new Date();
    var p = function (n) {
      return ('0' + n).slice(-2);
    };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function updateBadges() {
    var total = out.childNodes.length;
    badgeLog.hidden = total === 0;
    badgeLog.textContent = String(total);
    badgeErr.hidden = errorCount === 0;
    badgeErr.textContent = String(errorCount);
  }

  function addLine(level, text) {
    var line = document.createElement('div');
    line.className = 'l-' + level;
    var ts = document.createElement('span');
    ts.className = 't';
    ts.textContent = stamp();
    line.appendChild(ts);
    line.appendChild(document.createTextNode(String(text)));
    out.appendChild(line);
    while (out.childNodes.length > MAX_LINES) out.removeChild(out.firstChild);
    if (level === 'error') errorCount++;
    updateBadges();
    out.scrollTop = out.scrollHeight;
  }

  function setTermOpen(open) {
    term.hidden = !open;
    btnConsole.classList.toggle('on', open);
    if (open) input.focus();
  }

  function clearAll() {
    while (out.firstChild) out.removeChild(out.firstChild);
    errorCount = 0;
    updateBadges();
  }

  /* ---- toolbar ---- */
  btnConsole.addEventListener('click', function () {
    setTermOpen(term.hidden);
  });
  document.getElementById('term-close').addEventListener('click', function () {
    setTermOpen(false);
  });
  document.getElementById('term-clear').addEventListener('click', function () {
    clearAll();
    addLine('sys', 'terminal cleared');
  });
  document.getElementById('btn-refresh').addEventListener('click', function () {
    loader.hidden = false;
    addLine('sys', '- sandbox reloaded -');
    // Re-assigning srcdoc re-parses the ORIGINAL document from scratch.
    frame.srcdoc = frame.getAttribute('srcdoc');
  });
  document.getElementById('btn-width').addEventListener('click', function () {
    document.body.classList.toggle('phone');
    this.classList.toggle('on');
  });
  document.getElementById('btn-back').addEventListener('click', function () {
    if (document.referrer) {
      try {
        if (new URL(document.referrer).origin === location.origin) {
          history.back();
          return;
        }
      } catch (e) {
        /* fall through */
      }
    }
    location.href = '/';
  });

  /* ---- frame lifecycle ---- */
  frame.addEventListener('load', function () {
    loader.hidden = true;
    // The bridge may have attached before this script ran; ask it to
    // re-announce the page (it answers with a 'page' message).
    try {
      frame.contentWindow.postMessage({ src: 'vnt-parent', type: 'ping' }, '*');
    } catch (e) {
      /* frame not reachable yet */
    }
  });
  try {
    frame.contentWindow.postMessage({ src: 'vnt-parent', type: 'ping' }, '*');
  } catch (e) {
    /* ditto */
  }

  /* ---- bridge messages ---- */
  window.addEventListener('message', function (e) {
    if (e.source !== frame.contentWindow) return;
    var d = e.data;
    if (!d || d.src !== 'vnt-sandbox') return;
    if (d.type === 'console') {
      var lvl = d.level === 'warn' || d.level === 'error' ? d.level : 'log';
      var firstError = lvl === 'error' && term.hidden;
      addLine(lvl, d.text);
      if (firstError) setTermOpen(true); // surfaced, never focused — no input stealing
    } else if (d.type === 'result') {
      addLine(d.ok ? 'result' : 'error', (d.ok ? '<- ' : 'x ') + d.text);
    } else if (d.type === 'ready') {
      addLine('sys', 'bridge attached - console streaming');
    } else if (d.type === 'page') {
      addLine(
        'sys',
        'page: ' + d.title + ' | readyState ' + d.readyState + ' | links ' + d.links + ' | forms ' + d.forms,
      );
    }
  });

  /* ---- terminal input ---- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = input.value;
    input.value = '';
    histPos = -1;
    if (!code || !code.trim()) return;
    history.unshift(code);
    if (history.length > 60) history.pop();

    var trimmed = code.trim();
    if (trimmed === 'clear') {
      clearAll();
      addLine('sys', 'terminal cleared');
      return;
    }
    if (trimmed === 'help') {
      addLine('sys', 'JavaScript runs INSIDE the sandbox (opaque origin - no access to this platform).');
      addLine('sys', 'commands: help, clear - anything else is evaluated, e.g.:');
      addLine('log', 'document.title');
      addLine('log', 'document.body.style.background = "tomato"');
      addLine('log', 'Array.from(document.querySelectorAll("a")).map(a => a.href)');
      return;
    }
    addLine('cmd', '> ' + code);
    evalSeq++;
    frame.contentWindow.postMessage({ src: 'vnt-parent', type: 'eval', id: evalSeq, code: code }, '*');
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      histPos = Math.min(histPos + 1, history.length - 1);
      input.value = history[histPos];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histPos <= 0) {
        histPos = -1;
        input.value = '';
        return;
      }
      histPos--;
      input.value = history[histPos];
    }
  });
})();
