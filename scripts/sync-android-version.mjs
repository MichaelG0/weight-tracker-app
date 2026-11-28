// Copies the package.json version into android/app/build.gradle.
// versionName = "X.Y.Z"; versionCode = X * 10000 + Y * 100 + Z (so it always increases with the semver).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) throw new Error(`package.json version "${version}" must be MAJOR.MINOR.PATCH`);

const [major, minor, patch] = match.slice(1).map(Number);
if (minor > 99 || patch > 99) throw new Error('minor and patch must be below 100 to build a valid versionCode');
const versionCode = major * 10000 + minor * 100 + patch;

let gradle;
try {
  gradle = await readFile(gradlePath, 'utf8');
} catch {
  throw new Error(`${gradlePath} not found. Run "npx cap add android" first.`);
}

if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]*"/.test(gradle)) {
  throw new Error('versionCode/versionName not found in android/app/build.gradle');
}

const updated = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);

await writeFile(gradlePath, updated);
console.log(`Android version set to ${version} (versionCode ${versionCode})`);
