#!/usr/bin/env node
/**
 * Runs the desktop app's C# suite.
 *
 *   node scripts/desktop-test.mjs          # dotnet test  (core only, offline)
 *   node scripts/desktop-test.mjs --app    # + build the WPF shell
 *
 * Vanitas.Core holds every decision the app makes — the HTTP client, the wire
 * models, the session store and the alert logic — and is tested against a
 * scripted transport: no gateway, no window, no credentials. Vanitas.Desktop is
 * the WPF shell around it, so building it is opt-in and mirrors what
 * `npm run build` does for the web.
 *
 * Why this is not part of scripts/run-tests.mjs: that runner boots
 * dist/server.cjs and needs only Node. This needs the .NET SDK, so it stays a
 * separate command that CI runs as its own job.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopDir = path.join(root, 'apps', 'desktop');
const wantApp = process.argv.includes('--app');

// .NET 10 writes the new XML solution format by default; older SDKs wrote a
// classic .sln. Both are accepted here so the script works either way.
const solution = path.join(desktopDir, existsSync(path.join(desktopDir, 'Vanitas.Desktop.slnx'))
  ? 'Vanitas.Desktop.slnx'
  : 'Vanitas.Desktop.sln');
const coreTests = path.join(desktopDir, 'Vanitas.Core.Tests', 'Vanitas.Core.Tests.csproj');

function die(message) {
  console.error(`desktop-test: ${message}`);
  process.exit(1);
}

function run(label, args) {
  console.log(`\n> ${label}`);
  const result = spawnSync('dotnet', args, {
    cwd: desktopDir,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.error && result.error.code === 'ENOENT') {
    die(
      'the .NET SDK was not found.\n' +
        '      Install it from https://dotnet.microsoft.com/download (an SDK, not\n' +
        '      just a runtime) — `dotnet --version` should print 8.0 or newer.',
    );
  }
  if (result.status !== 0) {
    die(`${label} failed (exit ${result.status}).`);
  }
}

if (!existsSync(coreTests)) die(`missing ${coreTests}`);

// The gate: every assertion runs offline against a scripted transport.
run('dotnet test (Vanitas.Core)', ['test', coreTests, '--nologo', '--verbosity', 'minimal']);

// Optional, because it needs the Windows Desktop workload and only proves the
// shell compiles — the logic behind it was already covered above.
if (wantApp) {
  run('dotnet build (WPF shell)', ['build', solution, '--nologo', '--verbosity', 'minimal']);
}

console.log('\ndesktop-test: OK');
