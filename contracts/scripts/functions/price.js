// Carbonized price source for CarbonPriceOracle (Chainlink Functions, JavaScript). Runs WITHOUT secrets by default.
//
// args[0]   methodology, e.g. VERRA_VCS ("{methodology}" in a URL template is replaced by it)
// args[1]   max allowed spread between the highest and lowest source, basis points of the median (decimal string)
// args[2..] 1..5 operator-provided source URL templates (set onchain with CarbonPriceOracle.setPriceSources)
//
// Every source must answer HTTP 200 with JSON: { "price": <USD per tonne>, "volume24h": <USD, optional> }
// (a number or a decimal string). Sources that fail or return an invalid value are ignored; the run fails if none is valid
// or if the valid ones disagree by more than args[1].
//
// Optional secrets (DON-hosted, see README): secrets.apiKey is sent as "Authorization: Bearer <key>" (or as the header named
// secrets.apiKeyHeader, raw) ONLY to URLs that start with secrets.allowedUrlPrefix.
//
// Returns abi.encode(uint256 price, uint256 volume24h, uint256 confidence, uint256 dataPoints), 128 bytes:
//   price       USD per tonne, 8 decimals (median of the valid sources)
//   volume24h   USD, 8 decimals (sum of the volumes the valid sources reported)
//   confidence  0..100, round(100 * validSources / configuredSources)
//   dataPoints  number of valid sources
const MAX_SOURCES = 5;
const MAX_PRICE_USD = 1e7;
const MAX_VOLUME_USD = 1e15;
const SCALE = 1e8;

const methodology = args[0];
const spreadArg = args[1];
const urls = args.slice(2);
if (!methodology || !/^\d+$/.test(spreadArg || "") || urls.length < 1 || urls.length > MAX_SOURCES) {
  throw Error("invalid args");
}
const maxSpreadBps = BigInt(spreadArg);

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
const num = (v, max) => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
const abiEncode = (words) => {
  const out = new Uint8Array(32 * words.length);
  words.forEach((w, i) => out.set(Functions.encodeUint256(w), 32 * i));
  return out;
};

const fetchOne = async (template) => {
  const url = template.split("{methodology}").join(encodeURIComponent(methodology));
  if (!url.startsWith("https://") && !isLocal(url)) return null;
  const res = await Functions.makeHttpRequest({ url, headers: headersFor(url), timeout: 4000 });
  if (res.error || !res.data) return null;
  const price = num(res.data.price, MAX_PRICE_USD);
  if (price === null || price === 0) return null;
  const volume = res.data.volume24h === undefined ? 0 : num(res.data.volume24h, MAX_VOLUME_USD);
  if (volume === null) return null;
  return { price: BigInt(Math.round(price * SCALE)), volume: BigInt(Math.round(volume * SCALE)) };
};

const results = (await Promise.all(urls.map((u) => fetchOne(u).catch(() => null)))).filter((r) => r !== null);
if (results.length === 0) throw Error("no valid price source");

const sorted = results.map((r) => r.price).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const mid = sorted.length >> 1;
const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2n;
if (median === 0n) throw Error("zero price");
if (((sorted[sorted.length - 1] - sorted[0]) * 10000n) / median > maxSpreadBps) throw Error("sources disagree");

const volume = results.reduce((sum, r) => sum + r.volume, 0n);
const confidence = BigInt(Math.round((results.length * 100) / urls.length));
return abiEncode([median, volume, confidence, BigInt(results.length)]);
