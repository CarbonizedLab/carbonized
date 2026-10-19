"use strict";
// Loads the reference Chainlink Functions sources for upload with `setSource(string)`.
//
// The uploaded text is the file with full-line `//` comments, indentation and blank lines removed (it is stored in contract
// storage, so every byte costs gas). `sourceHashOf(text)` is what the contract exposes as `sourceHash()`:
// keccak256(utf8 bytes of the uploaded text).
//
//   node scripts/functions/sources.js            # prints size and hash of each source

const fs = require("node:fs");
const path = require("node:path");
const { keccak256, toUtf8Bytes } = require("ethers");

/** Source name -> file. */
const SOURCE_FILES = {
  price: "price.js",
  emission: "emission.js",
  registry: "registry-check.js",
};

/** Contract -> source it must be given with `setSource`. */
const SOURCE_FOR_CONTRACT = {
  CarbonPriceOracle: "price",
  EmissionVerifier: "emission",
  RegistrySync: "registry",
};

/** Strip full-line comments, indentation and blank lines (the reference files contain no multi-line strings). */
function compact(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .join("\n");
}

/** The exact text to pass to `setSource` for `name` ("price" | "emission" | "registry"). */
function loadSource(name) {
  const file = SOURCE_FILES[name];
  if (!file) throw new Error(`unknown Functions source "${name}" (expected ${Object.keys(SOURCE_FILES).join(", ")})`);
  return compact(fs.readFileSync(path.join(__dirname, file), "utf8"));
}

/** Same value the contract stores in `sourceHash`. */
function sourceHashOf(text) {
  return keccak256(toUtf8Bytes(text));
}

module.exports = { SOURCE_FILES, SOURCE_FOR_CONTRACT, compact, loadSource, sourceHashOf };

if (require.main === module) {
  for (const name of Object.keys(SOURCE_FILES)) {
    const text = loadSource(name);
    console.log(`${name.padEnd(9)} ${String(Buffer.byteLength(text)).padStart(5)} bytes  ${sourceHashOf(text)}`);
  }
}
