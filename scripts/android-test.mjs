#!/usr/bin/env node
/**
 * Runs the Android app's Kotlin suite.
 *
 *   node scripts/android-test.mjs          # :core:test  (JDK only, offline)
 *   node scripts/android-test.mjs --apk    # + :app:assembleDebug (needs SDK)
 *
 * :core holds every decision the app makes — the HTTP client, the wire models
 * and the alert logic — and is tested against a mock engine: no emulator, no
 * gateway, no credentials. :app is the Android shell around it, so assembling
 * it is opt-in and mirrors what `npm run build` does for the web.
 *
 * Why this is not part of scripts/run-tests.mjs: that runner boots
 * dist/server.cjs and needs only Node. Gradle needs a JDK, so it stays a
 * separate command that CI runs as its own job.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = path.join(root, 'apps', 'android');
const isWindows = process.platform === 'win32';
const wantApk = process.argv.includes('--apk');

function die(message) {
  console.error(`android-test: ${message}`);
  process.exit(1);
}

function javaBinary() {
  const home = process.env.JAVA_HOME;
  if (home) {
    const bin = path.join(home, 'bin', isWindows ? 'java.exe' : 'java');
    if (existsSync(bin)) return bin;
  }
  // Fall back to whatever `java` resolves to on PATH.
  return 'java';
}

function hasJava() {
  return spawnSync(javaBinary(), ['-version'], { stdio: 'ignore' }).status === 0;
}

if (!hasJava()) {
  die(
    'no JDK found. Install a JDK 17+ and set JAVA_HOME (or put `java` on PATH).\n' +
      '      Android Studio bundles one at <Android Studio>/jbr.',
  );
}

// The wrapper is invoked the way gradlew itself invokes it — java against the
// committed wrapper jar — instead of through gradlew.bat. A shell would mangle
// paths with spaces (C:\Users\New PC\…), and .bat files cannot be spawned
// shell-free on Windows; this runs identically on every platform.
const wrapperJar = path.join(projectDir, 'gradle', 'wrapper', 'gradle-wrapper.jar');
if (!existsSync(wrapperJar)) {
  die(`missing ${path.relative(root, wrapperJar)} — the Gradle wrapper is committed with the project.`);
}

const tasks = [':core:test'];
if (wantApk) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk && !existsSync(path.join(projectDir, 'local.properties'))) {
    die('--apk needs an Android SDK: set ANDROID_HOME or write sdk.dir into apps/android/local.properties.');
  }
  tasks.push(':app:assembleDebug');
}

console.log(`android-test: gradle ${tasks.join(' ')}`);
const result = spawnSync(
  javaBinary(),
  ['-cp', wrapperJar, 'org.gradle.wrapper.GradleWrapperMain', ...tasks, '--console=plain'],
  {
    cwd: projectDir,
    stdio: 'inherit',
    env: process.env,
  },
);

if (result.error) die(result.error.message);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('android-test: OK');
