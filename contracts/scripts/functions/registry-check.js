// Carbonized registry source for RegistrySync (Chainlink Functions, JavaScript). Runs WITHOUT secrets by default.
//
// args[0]  registry name (informational; the endpoint decides which registry is queried)
// args[1]  serial number (URL-encoded into "{serial}")
// args[2]  endpoint URL template containing {serial} (RegistrySync registries[name].apiEndpoint, operator-provided)
//
// The endpoint must answer: HTTP 404 for an unknown serial, otherwise HTTP 200 with JSON { "status": "ACTIVE" | "RETIRED" }.
// Anything else (other HTTP errors, other status text) fails the run, which RegistrySync records as ERROR (no verdict change).
//
// Optional secrets (DON-hosted, see README): secrets.apiKey is sent as "Authorization: Bearer <key>" (or as the header named
// secrets.apiKeyHeader, raw) ONLY to URLs that start with secrets.allowedUrlPrefix.
//
// Returns Functions.encodeUint256(status), 32 bytes: 0 = NOT_FOUND, 1 = ACTIVE, 2 = RETIRED.
const [registry, serial, template] = args;
if (!registry || !serial || serial.length > 128 || !template || !template.includes("{serial}")) throw Error("invalid args");

const url = template.split("{serial}").join(encodeURIComponent(serial));
const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);
if (!url.startsWith("https://") && !isLocal) throw Error("url must be https");

const s = typeof secrets === "object" && secrets ? secrets : {};
const headers = {};
if (s.apiKey && s.allowedUrlPrefix && url.startsWith(s.allowedUrlPrefix)) {
  if (s.apiKeyHeader) headers[s.apiKeyHeader] = s.apiKey;
  else headers.Authorization = `Bearer ${s.apiKey}`;
}

const res = await Functions.makeHttpRequest({ url, headers, timeout: 5000 });
const httpStatus = res.status ?? (res.response && res.response.status);
if (httpStatus === 404) return Functions.encodeUint256(0n);
if (res.error || httpStatus !== 200 || !res.data) throw Error("registry request failed");

const status = typeof res.data.status === "string" ? res.data.status.toUpperCase() : "";
if (status === "ACTIVE") return Functions.encodeUint256(1n);
if (status === "RETIRED") return Functions.encodeUint256(2n);
throw Error("unrecognised status");
