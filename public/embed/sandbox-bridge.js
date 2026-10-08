/* Vanitas sandbox console bridge.
   Injected at the top of every previewed document (see serveSandboxPreview).
   Runs INSIDE the opaque-origin iframe: forwards console output, crashes and
   page events to the wrapper, and evaluates code the wrapper's terminal
   sends over postMessage. The wrapper is always window.parent — target '*'
   because the parent origin is foreign to this opaque document. */
(function () {
  'use strict';
  if (window.__vntBridge) return;
  window.__vntBridge = true;

  function send(msg) {
    try {
      parent.postMessage(msg, '*');
    } catch (e) {
      /* wrapper went away — keep the page running */
    }
  }

  function ser(v) {
    try {
      if (v === undefined) return 'undefined';
      if (v === null) return 'null';
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
      if (typeof v === 'symbol') return v.toString();
      if (typeof v === 'function') return 'f ' + (v.name || 'anonymous') + '()';
      if (v instanceof Error) return (v.name || 'Error') + ': ' + v.message;
      if (v && v.nodeType === 1) {
        return '<' + String(v.nodeName).toLowerCase() + (v.id ? '#' + v.id : '') + '> element';
      }
      if (v && v.nodeType === 9) return '#document';
      var json = JSON.stringify(v, function (k, val) {
        return typeof val === 'function' ? 'f ' + (val.name || 'anonymous') + '()' : val;
      });
      if (json === undefined) return String(v);
      return json.length > 4000 ? json.slice(0, 4000) + ' ... (' + json.length + ' chars)' : json;
    } catch (e) {
      try {
        return Object.prototype.toString.call(v);
      } catch (e2) {
        return String(v);
      }
    }
  }

  /* Mirror console.* — original behaviour is preserved too. */
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level] ? console[level].bind(console) : null;
    console[level] = function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) parts.push(ser(arguments[i]));
      send({ src: 'vnt-sandbox', type: 'console', level: level, text: parts.join(' ') });
      if (original) {
        try {
          original.apply(null, arguments);
        } catch (e) {
          /* logging must never throw */
        }
      }
    };
  });

  window.addEventListener('error', function (e) {
    var text = e.message || 'Uncaught error';
    if (e.lineno) text += ' (line ' + e.lineno + ')';
    send({ src: 'vnt-sandbox', type: 'console', level: 'error', text: text });
  });

  window.addEventListener('unhandledrejection', function (e) {
    send({ src: 'vnt-sandbox', type: 'console', level: 'error', text: 'Unhandled rejection: ' + ser(e.reason) });
  });

  function pageInfo() {
    return {
      src: 'vnt-sandbox',
      type: 'page',
      title: document.title || '(untitled)',
      readyState: document.readyState,
      links: document.links ? document.links.length : 0,
      forms: document.forms ? document.forms.length : 0,
    };
  }

  send({ src: 'vnt-sandbox', type: 'ready' });
  window.addEventListener('load', function () {
    send(pageInfo());
  });

  /* Terminal protocol from the wrapper. Indirect eval runs the code in
     the PAGE's global scope — exactly what a devtools console does. */
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.src !== 'vnt-parent') return;
    if (d.type === 'ping') {
      send(pageInfo());
      return;
    }
    if (d.type !== 'eval') return;
    var text;
    var ok = true;
    try {
      var result = (0, eval)(d.code);
      text = ser(result);
    } catch (err) {
      ok = false;
      text =
        err && err.stack
          ? String(err.stack).split('\n').slice(0, 4).join('\n')
          : String(err);
    }
    send({ src: 'vnt-sandbox', type: 'result', id: d.id, ok: ok, text: text });
  });
})();
