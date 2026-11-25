#!/usr/bin/env node
/*
 * Add a stable release signing config to the generated Capacitor Android app.
 *
 * CI runs this after `npx cap add android` and `node scripts/prepare-android.mjs`.
 * The keystore path and passwords are read from the environment, so no secret is
 * ever written into the generated project. Every build therefore shares one
 * signing identity and future APKs install cleanly over older versions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gradlePath = path.join(root, "android", "app", "build.gradle");

function fail(message) {
  console.error("ShiftVault Android signing: " + message);
  process.exit(1);
}

const keystore = process.env.SHIFTVAULT_KEYSTORE || "";
const storePassword = process.env.SHIFTVAULT_STORE_PASSWORD || "";
const keyAlias = process.env.SHIFTVAULT_KEY_ALIAS || "";
const keyPassword = process.env.SHIFTVAULT_KEY_PASSWORD || "";

if (!keystore) fail("SHIFTVAULT_KEYSTORE is not set");
if (!storePassword) fail("SHIFTVAULT_STORE_PASSWORD is not set");
if (!keyAlias) fail("SHIFTVAULT_KEY_ALIAS is not set");
if (!keyPassword) fail("SHIFTVAULT_KEY_PASSWORD is not set");
if (!fs.existsSync(keystore)) fail("keystore not found: " + keystore);
if (!fs.existsSync(gradlePath)) fail("app/build.gradle not found. Run: npx cap add android");

const lines = fs.readFileSync(gradlePath, "utf8").split("\n");
const indentOf = (line) => (line.match(/^\s*/) || [""])[0];

if (lines.some((line) => /signingConfigs\s*\{/.test(line))) {
  console.log("Android signing config already present");
  process.exit(0);
}

const buildTypesAt = lines.findIndex((line) => /^\s*buildTypes\s*\{/.test(line));
if (buildTypesAt === -1) fail("buildTypes block not found in app/build.gradle");

const releaseAt = lines.findIndex((line, index) => index > buildTypesAt && /^\s*release\s*\{/.test(line));
if (releaseAt === -1) fail("release build type not found in app/build.gradle");

const base = indentOf(lines[buildTypesAt]);
const signingConfigs = [
  base + "signingConfigs {",
  base + "    release {",
  base + '        storeFile file(System.getenv("SHIFTVAULT_KEYSTORE"))',
  base + '        storePassword System.getenv("SHIFTVAULT_STORE_PASSWORD")',
  base + '        keyAlias System.getenv("SHIFTVAULT_KEY_ALIAS")',
  base + '        keyPassword System.getenv("SHIFTVAULT_KEY_PASSWORD")',
  base + "    }",
  base + "}",
  ""
];

lines.splice(buildTypesAt, 0, ...signingConfigs);

const offset = signingConfigs.length;
const releaseLine = releaseAt + offset;
lines.splice(releaseLine + 1, 0, indentOf(lines[releaseLine]) + "    signingConfig signingConfigs.release");

const output = lines.join("\n");
if (!/signingConfigs\s*\{/.test(output) || !/signingConfig\s+signingConfigs\.release/.test(output)) {
  fail("signing config verification failed");
}

fs.writeFileSync(gradlePath, output);
console.log("Release signing configured from " + path.basename(keystore) + " (alias " + keyAlias + ")");
