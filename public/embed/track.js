/* Vanitas request-tracking page controller (loaded by /embed/track.html).
   CSP-safe: this platform serves script-src 'self', so everything runs
   from this external file — no inline handlers. */
(function () {
  'use strict';
  var form = document.getElementById('form');
  var input = document.getElementById('token');
  var go = document.getElementById('go');
  var err = document.getElementById('err');
  var result = document.getElementById('result');

  function showErr(msg) {
    err.textContent = msg;
    err.hidden = false;
  }

  function text(tag, cls, value) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    node.textContent = value;
    return node;
  }

  function deliveryCard(delivery) {
    var card = text('div', 'card');
    card.appendChild(text('h3', null, 'Delivery details'));
    var dl = document.createElement('dl');
    [
      ['Host', delivery.host, true],
      ['SSH user', delivery.sshUser || 'root', true],
      ['Port', String(delivery.sshPort || 22), true],
    ].forEach(function (r) {
      dl.appendChild(text('dt', null, r[0]));
      dl.appendChild(text('dd', r[2] ? 'mono' : null, r[1]));
    });
    card.appendChild(dl);
    // Free-form hand-off notes read better as their own block.
    if (delivery.credentialsNote) {
      card.appendChild(text('div', 'note', delivery.credentialsNote));
    }
    return card;
  }

  function render(req) {
    result.textContent = '';
    result.hidden = false;

    var head = text('div', 'head');
    head.appendChild(text('h2', null, req.planName));
    var s = ['pending', 'approved', 'delivered', 'rejected'].indexOf(req.status) >= 0 ? req.status : 'pending';
    head.appendChild(text('span', 'badge st-' + s, s));
    result.appendChild(head);
    result.appendChild(text('p', 'sub', 'Requested by ' + req.requesterName));

    if (req.reviewNote) {
      var note = text('div', 'note', 'From the team: ' + req.reviewNote);
      result.appendChild(note);
    }
    if (req.delivery) result.appendChild(deliveryCard(req.delivery));

    var meta = text('div', 'card');
    meta.appendChild(text('h3', null, 'Request'));
    var dl = document.createElement('dl');
    [
      ['Submitted', new Date(req.createdAt).toLocaleString()],
      ['Updated', new Date(req.updatedAt).toLocaleString()],
      ['Request ID', req.id],
    ].forEach(function (r) {
      dl.appendChild(text('dt', null, r[0]));
      dl.appendChild(text('dd', r[0] === 'Request ID' ? 'mono' : null, r[1]));
    });
    meta.appendChild(dl);
    result.appendChild(meta);
  }

  function lookup(token) {
    err.hidden = true;
    result.hidden = true;
    go.disabled = true;
    go.textContent = 'Checking…';
    fetch('/api/v1/servers/requests/track/' + encodeURIComponent(token), {
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || 'Lookup failed (' + res.status + ')');
          return data;
        });
      })
      .then(function (data) {
        render(data.request);
      })
      .catch(function (e) {
        showErr(e.message || 'Lookup failed');
      })
      .then(function () {
        go.disabled = false;
        go.textContent = 'Check status';
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var token = input.value.trim();
    if (!token) {
      showErr('Paste a tracking token first.');
      return;
    }
    lookup(token);
  });

  // Deep link: /embed/track.html?token=vnt_strk_…
  var initial = new URLSearchParams(location.search).get('token');
  if (initial) {
    input.value = initial;
    lookup(initial);
  }
})();
