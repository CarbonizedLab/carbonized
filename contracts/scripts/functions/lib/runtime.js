"use strict";
// Local execution of a Chainlink Functions JavaScript source.
//
// Two engines with the same result shape `{ responseHex?, errorString?, output }`:
//  - "toolkit": @chainlink/functions-toolkit `simulateScript` (Deno sandbox; needs `deno` on PATH);
//  - "shim":    a minimal in-process implementation of the `Functions` global (makeHttpRequest, encodeUint256,
//               encodeInt256, encodeString) with the documented DON limits. NOT a security sandbox; it exists to run the
//               reference sources in CI and on machines without Deno.
// "auto" picks the toolkit when `deno --version` works, else the shim.

const { execSync } = require("node:child_process");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// DON limits (functions-toolkit simulationConfig defaults)
const LIMITS = {
  maxHttpRequests: 5,
  maxUrlLength: 2048,
  maxHttpTimeoutMs: 9000,
  maxHttpResponseBytes: 2_000_000,
  maxOnChainResponseBytes: 256,
  maxExecutionMs: 10_000,
};
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_INT256 = (1n << 255n) - 1n;
const MIN_INT256 = -(1n << 255n);

const toBytes = (hex) => Uint8Array.from(Buffer.from(hex, "hex"));

function encodeUint256(value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) throw Error("encodeUint256 invalid input");
    value = BigInt(value);
  }
  if (typeof value !== "bigint" || value < 0n || value > MAX_UINT256) throw Error("encodeUint256 invalid input");
  return toBytes(value.toString(16).padStart(64, "0"));
}

function encodeInt256(value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw Error("encodeInt256 invalid input");
    value = BigInt(value);
  }
  if (typeof value !== "bigint" || value < MIN_INT256 || value > MAX_INT256) throw Error("encodeInt256 invalid input");
  const twos = value < 0n ? (1n << 256n) + value : value;
  return toBytes(twos.toString(16).padStart(64, "0"));
}

function encodeString(value) {
  if (typeof value !== "string") throw Error("encodeString invalid input");
  return Uint8Array.from(Buffer.from(value, "utf8"));
}

/**
 * `Functions.makeHttpRequest` as the DON exposes it: resolves (never rejects) with an axios-like object,
 * `{ error:false, status, data, ... }` on 2xx and `{ error:true, message, code, response:{ status, data } }` otherwise.
 * `rewriteUrl(url)` lets tests serve `https://x.test/...` from a local server without the script noticing.
 */
function makeHttpRequestFactory(rewriteUrl, limits = LIMITS) {
  let used = 0;
  return async function makeHttpRequest({ url, method = "get", params, headers, data, timeout = 5000 }) {
    if (used >= limits.maxHttpRequests) throw Error("exceeded numAllowedQueries");
    used++;
    if (typeof url !== "string" || url.length > limits.maxUrlLength) throw Error("HTTP request URL length >2048");
    if (timeout > limits.maxHttpTimeoutMs) throw Error("HTTP request timeout >9000");

    let target = rewriteUrl ? rewriteUrl(url) : url;
    if (params) target += (target.includes("?") ? "&" : "?") + new URLSearchParams(params).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(target, {
        method: method.toUpperCase(),
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: controller.signal,
      });
      const text = await res.text();
      if (text.length > limits.maxHttpResponseBytes) {
        return { error: true, message: "maxContentLength size exceeded", code: "ERR_BAD_RESPONSE" };
      }
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        // axios keeps the raw text when it is not JSON
      }
      if (!res.ok) {
        return {
          error: true,
          message: `Request failed with status code ${res.status}`,
          code: "ERR_BAD_REQUEST",
          response: { status: res.status, statusText: res.statusText, data: body },
        };
      }
      return { error: false, status: res.status, statusText: res.statusText, data: body };
    } catch (e) {
      return { error: true, message: e.message, code: e.name === "AbortError" ? "ECONNABORTED" : "ERR_NETWORK" };
    } finally {
      clearTimeout(timer);
    }
  };
}

function hasDeno() {
  try {
    execSync("deno --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function runWithShim({ source, args, bytesArgs, secrets, rewriteUrl }) {
  const Functions = { makeHttpRequest: makeHttpRequestFactory(rewriteUrl), encodeUint256, encodeInt256, encodeString };
  let timer;
  try {
    const run = new AsyncFunction("Functions", "args", "bytesArgs", "secrets", `"use strict";\n${source}`);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("script runtime exceeded")), LIMITS.maxExecutionMs);
    });
    const result = await Promise.race([run(Functions, args, bytesArgs, secrets), timeout]);
    if (!(result instanceof Uint8Array)) throw Error("returned value not a Uint8Array");
    if (result.length > LIMITS.maxOnChainResponseBytes) throw Error(`response >${LIMITS.maxOnChainResponseBytes} bytes`);
    return { responseHex: `0x${Buffer.from(result).toString("hex")}`, output: "" };
  } catch (e) {
    return { errorString: e instanceof Error ? e.message : String(e), output: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function runWithToolkit({ source, args, bytesArgs, secrets }) {
  const { simulateScript } = require("@chainlink/functions-toolkit");
  const res = await simulateScript({ source, args, bytesArgs: bytesArgs.length ? bytesArgs : undefined, secrets });
  return {
    responseHex: res.responseBytesHexstring,
    errorString: res.errorString,
    output: res.capturedTerminalOutput ?? "",
  };
}

/**
 * Run `source` like a DON node would.
 * @param {object} p
 * @param {string} p.source JavaScript source
 * @param {string[]} [p.args] string args (exactly what the contract put in the request)
 * @param {string[]} [p.bytesArgs] hex strings
 * @param {Record<string,string>} [p.secrets]
 * @param {(url:string)=>string} [p.rewriteUrl] shim only: map the URL the script uses to the URL actually fetched
 * @param {"auto"|"shim"|"toolkit"} [p.engine]
 * @returns {Promise<{responseHex?:string, errorString?:string, output:string, engine:string}>}
 */
async function runSource({ source, args = [], bytesArgs = [], secrets = {}, rewriteUrl, engine = "auto" }) {
  const chosen = engine === "auto" ? (hasDeno() ? "toolkit" : "shim") : engine;
  const result =
    chosen === "toolkit"
      ? await runWithToolkit({ source, args, bytesArgs, secrets })
      : await runWithShim({ source, args, bytesArgs, secrets, rewriteUrl });
  return { ...result, engine: chosen };
}

module.exports = { runSource, hasDeno, encodeUint256, encodeInt256, encodeString, LIMITS };
