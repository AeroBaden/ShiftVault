#!/usr/bin/env node
/*
 * Prepare a generated Capacitor Android project for ShiftVault:
 *   1. copy the generated vault icon set into res/
 *   2. move the LAUNCHER intent-filter from MainActivity to two activity-aliases
 *      (Dark Vault / Light Vault)
 *   3. register a tiny native plugin that toggles those aliases at runtime
 *
 * Run after `npx cap add android` and before `npx cap sync android`.
 * The script is idempotent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "assets", "android");
const android = path.join(root, "android");
const res = path.join(android, "app", "src", "main", "res");
const manifestPath = path.join(android, "app", "src", "main", "AndroidManifest.xml");

const ALIASES = [
  { name: "MainActivityDark", icon: "ic_launcher_dark", enabled: true },
  { name: "MainActivityLight", icon: "ic_launcher_light", enabled: false }
];

function fail(message) {
  console.error("ShiftVault Android setup: " + message);
  process.exit(1);
}

if (!fs.existsSync(source)) fail("assets/android is missing. Run: python3 scripts/gen-icons.py");
if (!fs.existsSync(res)) fail("Android platform not found. Run: npx cap add android");
if (!fs.existsSync(manifestPath)) fail("AndroidManifest.xml not found. Run: npx cap add android");

/* ---------------------------------------------------------------- 1. icons */

let copied = 0;
for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const from = path.join(source, entry.name);
  const to = path.join(res, entry.name);
  fs.mkdirSync(to, { recursive: true });
  for (const file of fs.readdirSync(from)) {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
    copied += 1;
  }
}
console.log(`ShiftVault icons installed (${copied} files)`);

/* ------------------------------------------------------------- 2. manifest */

function aliasXml(def) {
  return [
    "",
    '        <activity-alias',
    `            android:name=".${def.name}"`,
    `            android:enabled="${def.enabled}"`,
    '            android:exported="true"',
    `            android:icon="@mipmap/${def.icon}"`,
    `            android:roundIcon="@mipmap/${def.icon}_round"`,
    '            android:label="@string/app_name"',
    '            android:targetActivity=".MainActivity">',
    "            <intent-filter>",
    '                <action android:name="android.intent.action.MAIN" />',
    '                <category android:name="android.intent.category.LAUNCHER" />',
    "            </intent-filter>",
    "        </activity-alias>"
  ].join("\n");
}

let manifest = fs.readFileSync(manifestPath, "utf8");

if (manifest.includes(".MainActivityDark")) {
  console.log("Manifest already declares the launcher aliases");
} else {
  const nameIndex = manifest.indexOf('android:name=".MainActivity"');
  if (nameIndex === -1) fail('Could not find android:name=".MainActivity" in AndroidManifest.xml');

  const openIndex = manifest.lastIndexOf("<activity", nameIndex);
  const closeIndex = manifest.indexOf("</activity>", nameIndex);
  if (openIndex === -1 || closeIndex === -1) fail("Could not locate the MainActivity element");

  const endIndex = closeIndex + "</activity>".length;
  let block = manifest.slice(openIndex, endIndex);
  const launcherFilter =
    /<intent-filter\b[^>]*>(?:(?!<\/intent-filter>)[\s\S])*?android\.intent\.category\.LAUNCHER(?:(?!<\/intent-filter>)[\s\S])*?<\/intent-filter>/;

  if (!launcherFilter.test(block)) {
    fail("MainActivity has no LAUNCHER intent-filter to move to the aliases");
  }

  block = block.replace(launcherFilter, "");
  const aliases = ALIASES.map(aliasXml).join("\n");
  manifest = manifest.slice(0, openIndex) + block + aliases + manifest.slice(endIndex);

  const launcherCount = (manifest.match(/android\.intent\.category\.LAUNCHER/g) || []).length;
  if (manifest.indexOf("<activity-alias") === -1 || launcherCount !== ALIASES.length) {
    fail("Manifest patch verification failed");
  }

  fs.writeFileSync(manifestPath, manifest);
  console.log("Manifest: launcher intent moved to Dark Vault / Light Vault aliases");
}

/* --------------------------------------------------- 3. native plugin setup */

function findMainActivity(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findMainActivity(full);
      if (nested) return nested;
    } else if (entry.name === "MainActivity.java" || entry.name === "MainActivity.kt") {
      return full;
    }
  }
  return null;
}

const mainActivityPath = findMainActivity(path.join(android, "app", "src", "main", "java"));
if (!mainActivityPath) fail("MainActivity not found in android/app/src/main/java");

const original = fs.readFileSync(mainActivityPath, "utf8");
const packageMatch = original.match(/^\s*package\s+([\w.]+)/m);
if (!packageMatch) fail("Could not read the package name from MainActivity");
const packageName = packageMatch[1];
const activityDir = path.dirname(mainActivityPath);
const isKotlin = mainActivityPath.endsWith(".kt");

if (isKotlin) {
  const mainActivity = `package ${packageName}

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(IconSwitchPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
`;

  const plugin = `package ${packageName}

import android.content.ComponentName
import android.content.pm.PackageManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "IconSwitch")
class IconSwitchPlugin : Plugin() {

    @PluginMethod
    fun setIcon(call: PluginCall) {
        val useDark = call.getString("variant", "dark") != "light"
        // Enable the target alias first so the launcher never loses its icon.
        if (useDark) {
            setAliasState("MainActivityDark", true)
            setAliasState("MainActivityLight", false)
        } else {
            setAliasState("MainActivityLight", true)
            setAliasState("MainActivityDark", false)
        }

        val result = JSObject()
        result.put("variant", if (useDark) "dark" else "light")
        call.resolve(result)
    }

    private fun setAliasState(alias: String, enabled: Boolean) {
        val packageName = context.packageName
        val component = ComponentName(packageName, packageName + "." + alias)
        val state = if (enabled) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        context.packageManager.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP)
    }
}
`;

  fs.writeFileSync(mainActivityPath, mainActivity);
  fs.writeFileSync(path.join(activityDir, "IconSwitchPlugin.kt"), plugin);
  console.log("Native plugin registered (Kotlin)");
} else {
  const mainActivity = `package ${packageName};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IconSwitchPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;

  const plugin = `package ${packageName};

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "IconSwitch")
public class IconSwitchPlugin extends Plugin {

    @PluginMethod
    public void setIcon(PluginCall call) {
        String variant = call.getString("variant", "dark");
        boolean useDark = !"light".equals(variant);

        // Enable the target alias first so the launcher never loses its icon.
        if (useDark) {
            setAliasState("MainActivityDark", true);
            setAliasState("MainActivityLight", false);
        } else {
            setAliasState("MainActivityLight", true);
            setAliasState("MainActivityDark", false);
        }

        JSObject result = new JSObject();
        result.put("variant", useDark ? "dark" : "light");
        call.resolve(result);
    }

    private void setAliasState(String alias, boolean enabled) {
        String packageName = getContext().getPackageName();
        ComponentName component = new ComponentName(packageName, packageName + "." + alias);
        int state = enabled
            ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
        getContext().getPackageManager().setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP);
    }
}
`;

  fs.writeFileSync(mainActivityPath, mainActivity);
  fs.writeFileSync(path.join(activityDir, "IconSwitchPlugin.java"), plugin);
  console.log("Native plugin registered (Java)");
}

console.log("ShiftVault Android icon switching ready");
