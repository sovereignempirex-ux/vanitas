// Local smoke test for the generated Vercel bundle: api/index.js
const { Readable } = require('stream');
const { EventEmitter } = require('events');

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';

async function invoke(handler, url, method = 'GET') {
  const req = new Readable({ read() {} });
  req.method = method;
  req.url = url;
  req.httpVersion = '1.1';
  req.headers = { host: 'vanitas-bot.vercel.app', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'test' };
  req.socket = { remoteAddress: '1.2.3.4', encrypted: true };

  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.removeHeader = (k) => { delete res.headers[k.toLowerCase()]; };
  res.writeHead = (code) => { res.statusCode = code; return res; };
  const chunks = [];
  res.write = (b) => { chunks.push(Buffer.from(b)); return true; };
  res.end = (b) => { if (b) chunks.push(Buffer.from(b)); res.writableEnded = true; done(); };
  res.writableEnded = false;
  let done;
  await new Promise((resolve, reject) => {
    done = resolve;
    setTimeout(() => reject(new Error('timeout waiting for res.end: ' + url)), 8000);
    Promise.resolve(handler(req, res)).catch(reject);
  });
  return { status: res.statusCode, body: Buffer.concat(chunks).toString('utf8').slice(0, 300) };
}

(async () => {
  const { pathToFileURL } = require('url');
  const path = require('path');
  const mod = await import(pathToFileURL(path.resolve(__dirname, '../api/index.js')).href);
  const handler = mod.default;
  if (typeof handler !== 'function') throw new Error('default export is not a function: ' + typeof handler);
  for (const url of ['/api/v1/health', '/api/v1/ready', '/api/v1/stats']) {
    const r = await invoke(handler, url);
    console.log(url, '->', r.status, r.body);
  }
  console.log('BUNDLE OK');
})().catch((e) => {
  console.error('BUNDLE FAILED:', e?.stack || e);
  process.exit(1);
});
