#!/usr/bin/env node
"use strict";

/**
 * seraphbail postinstall — patch whatsapp-rust-bridge package.json
 *
 * whatsapp-rust-bridge ships without a CJS-compatible "exports" entry for
 * its package root, which makes `require('whatsapp-rust-bridge')` fail
 * under Node's CJS resolver with:
 *
 *   ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined in
 *   .../whatsapp-rust-bridge/package.json
 *
 * This script runs automatically after `npm install` and injects a
 * minimal "." export entry pointing at the package's existing main file,
 * without touching any of its actual code. It's idempotent — safe to run
 * on every install, and a no-op if the entry already exists.
 */

const fs = require("fs");
const path = require("path");

const TARGET_PKG = "whatsapp-rust-bridge";

function findPkgJson() {
  // Walk up from this script looking for node_modules/whatsapp-rust-bridge
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "node_modules", TARGET_PKG, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

function patch() {
  const pkgPath = findPkgJson();
  if (!pkgPath) {
    console.warn(`[seraphbail postinstall] ${TARGET_PKG} not found, skipping patch.`);
    return;
  }

  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);

  const mainFile = pkg.main || "index.js";
  const hasRootExport =
    pkg.exports &&
    (typeof pkg.exports === "string" || (pkg.exports["."] !== undefined));

  if (hasRootExport) {
    console.log(`[seraphbail postinstall] ${TARGET_PKG} already has a valid export entry, skipping.`);
    return;
  }

  pkg.exports = {
    ...(typeof pkg.exports === "object" ? pkg.exports : {}),
    ".": `./${mainFile}`.replace(/\/{2,}/g, "/")
  };
  pkg.main = mainFile;

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`[seraphbail postinstall] Patched ${TARGET_PKG}/package.json — added "." export -> ${pkg.exports["."]}`);
}

try {
  patch();
} catch (err) {
  // Never fail the whole npm install over this — just warn loudly.
  console.warn(`[seraphbail postinstall] Patch failed (non-fatal): ${err.message}`);
}
