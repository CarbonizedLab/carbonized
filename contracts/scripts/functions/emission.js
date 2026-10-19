// Carbonized emission source for EmissionVerifier (Chainlink Functions, JavaScript). Runs WITHOUT secrets by default.
//
// args[0]  projectId
// args[1]  primary measurement URL template   (EmissionVerifier project.iotEndpoint)
// args[2]  cross-check URL template or ""      (EmissionVerifier project.satelliteRegion, legacy field name)
// args[3]  max disagreement between the two measurements, basis points (decimal string)
// args[4]  measurement window start, unix seconds (decimal string)
// args[5]  measurement window end, unix seconds (decimal string)
// In the URL templates, {projectId} {from} {to} are replaced (projectId URL-encoded).
//
// Each endpoint must answer HTTP 200 with JSON: { "tonnesCO2e": <emissions of the window in tonnes CO2e> }
// (a number or a decimal string, 0 < value <= 10,000,000). The window must be on the same time basis as the project's
// baseline onchain.
//
// Optional secrets (DON-hosted, see README): secrets.apiKey is sent as "Authorization: Bearer <key>" (or as the header
// named secrets.apiKeyHeader, raw) ONLY to URLs that start with secrets.allowedUrlPrefix. The URLs come from a project
// registrar, so ALWAYS set allowedUrlPrefix to the one host that deserves the key.
//
// Returns abi.encode(uint256 measuredEmissions, uint256 confidence), 64 bytes:
//   measuredEmissions  tonnes CO2e, 18 decimals; with a cross-check: the HIGHER of the two (fewer credits)
//   confidence         100 when both sources agree within args[3]; 70 with a single source (below the 90 needed to claim)
// The run fails (error onchain, nothing recorded) if a configured endpoint fails or the two disagree.
const MAX_TONNES = 10000000;
const TONNES_SCALE = 1e6;
const WEI_PER_MICRO_TONNE = 10n ** 12n;
const CONFIDENCE_CROSS_CHECKED = 100n;
const CONFIDENCE_SINGLE_SOURCE = 70n;

const [projectId, primary, secondary, toleranceArg, from, to] = args;
const isNumber = (s) => /^\d+$/.test(s || "");
if (!projectId || !primary || !isNumber(toleranceArg) || !isNumber(from) || !isNumber(to)) throw Error("invalid args");
const toleranceBps = BigInt(toleranceArg);

const isLocal = (u) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u);
const headersFor = (url) => {
  const headers = {};
  const s = typeof secrets === "object" && secrets ? secrets : {};
  if (s.apiKey && s.allowedUrlPrefix && url.startsWith(s.allowedUrlPrefix)) {
    if (s.apiKeyHeader) headers[s.apiKeyHeader] = s.apiKey;
    else headers.Authorization = `Bearer ${s.apiKey}`;
  }
  return headers;
};
const abiEncode = (words) => {
  const out = new Uint8Array(32 * words.length);
  words.forEach((w, i) => out.set(Functions.encodeUint256(w), 32 * i));
  return out;
};

const measure = async (template) => {
  const url = template
    .split("{projectId}").join(encodeURIComponent(projectId))
    .split("{from}").join(from)
    .split("{to}").join(to);
  if (!url.startsWith("https://") && !isLocal(url)) throw Error("url must be https");
  const res = await Functions.makeHttpRequest({ url, headers: headersFor(url), timeout: 4000 });
  if (res.error || !res.data) throw Error("measurement request failed");
  const v = res.data.tonnesCO2e;
  const tonnes = typeof v === "number" || typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(tonnes) || tonnes <= 0 || tonnes > MAX_TONNES) throw Error("invalid measurement");
  const micro = BigInt(Math.round(tonnes * TONNES_SCALE));
  if (micro === 0n) throw Error("invalid measurement");
  return micro;
};

const [a, b] = await Promise.all([measure(primary), secondary ? measure(secondary) : Promise.resolve(null)]);
let micro = a;
let confidence = CONFIDENCE_SINGLE_SOURCE;
if (b !== null) {
  const hi = a > b ? a : b;
  const lo = a > b ? b : a;
  if (((hi - lo) * 10000n) / hi > toleranceBps) throw Error("measurements disagree");
  micro = hi;
  confidence = CONFIDENCE_CROSS_CHECKED;
}
return abiEncode([micro * WEI_PER_MICRO_TONNE, confidence]);
