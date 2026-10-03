// Vercel serverless entry — SOURCE file.
// Vercel only ships plain JS into its lambda, so this source is compiled by
// `npm run build` into the committed bundle `api/index.js`
// (esbuild, ESM, node platform). Do NOT import this file from Vercel directly.
//
// The wrapper converts ANY boot/invocation failure into a readable JSON
// payload instead of the opaque FUNCTION_INVOCATION_FAILED page.

type AnyReq = any;
type AnyRes = any;

let appPromise: Promise<any> | null = null;
let currentRes: AnyRes | null = null;

function loadApp(): Promise<any> {
  if (!appPromise) {
    appPromise = import('../../server.ts')
      .then((mod: any) => {
        const buildApp = mod.default;
        if (typeof buildApp !== 'function') {
          throw new Error('server.ts has no default export buildApp()');
        }
        return buildApp();
      })
      .catch((err: any) => {
        appPromise = null; // allow a retry on the next invocation
        throw err;
      });
  }
  return appPromise;
}

function fail(res: AnyRes | null, stage: string, err: any): void {
  const detail = {
    error: 'function_error',
    stage,
    message: String(err?.message || err),
    stack: String(err?.stack || '')
      .split('\n')
      .slice(0, 10)
      .join('\n'),
    node: process.version,
    vercel: process.env.VERCEL ? '1' : '',
    nodeEnv: process.env.NODE_ENV || '',
    time: new Date().toISOString(),
  };
  // Full details (stack, runtime metadata) stay in the function logs only —
  // never in the response body: driver/SQL text and version info are for
  // operators, not for whoever triggered the failure.
  console.error('[vanitas]', JSON.stringify(detail));
  if (!res) return;
  const clientPayload: Record<string, unknown> = { error: 'function_error', stage };
  if (process.env.NODE_ENV !== 'production') clientPayload.message = detail.message;
  try {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(clientPayload, null, 2));
  } catch {
    /* response already gone */
  }
}

// Process-level safety net: attribute crashes instead of losing them.
process.on('unhandledRejection', (reason) => {
  console.error('[vanitas] unhandledRejection', reason);
  if (currentRes && !currentRes.writableEnded) fail(currentRes, 'unhandledRejection', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[vanitas] uncaughtException', err);
  if (currentRes && !currentRes.writableEnded) fail(currentRes, 'uncaughtException', err);
});

export default async function handler(req: AnyReq, res: AnyRes) {
  currentRes = res;
  res.on?.('finish', () => {
    if (currentRes === res) currentRes = null;
  });
  try {
    const app = await loadApp();
    return app(req, res);
  } catch (err) {
    return fail(res, 'boot', err);
  }
}
