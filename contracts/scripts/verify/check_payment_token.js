// Read-only diligence for canonical USDG before setting MAINNET_USDG.
// Usage: node scripts/verify/check_payment_token.js <tokenAddress> [--rpc <url>] [--explorer <blockscoutBaseUrl>]
// It never sends a transaction and never needs a key. Output is a go / no-go table plus the raw facts.
// A passing report is NOT proof that the token is canonical USDG. Confirm the address in the issuer's official docs.
const { ethers } = require("ethers");

const DEFAULT_RPC = "https://robinhood-rpc.publicnode.com";
const DEFAULT_EXPLORER = "https://robinhoodchain.blockscout.com";
const DEAD = "0x000000000000000000000000000000000000dEaD";

// EIP-1967 slots
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
];

// Selectors of privileged / dangerous functions commonly found in stablecoins and test tokens.
const PRIVILEGED = {
  "mint(address,uint256)": "can mint new supply",
  "burn(address,uint256)": "can burn from arbitrary account",
  "blacklist(address)": "can freeze addresses (stablecoin issuer-style, assess before launch)",
  "isBlacklisted(address)": "has a blacklist",
  "pause()": "can pause all transfers",
  "paused()": "has pause state",
  "owner()": "has an owner",
  "masterMinter()": "has a master minter",
  "configureMinter(address,uint256)": "minter allowlist",
  "setTax(uint256)": "transfer tax setter",
  "setFee(uint256)": "transfer fee setter",
  "rebase()": "rebasing",
  "gateway()": "bridge gateway (Arbitrum-style bridged token)",
  "l1Address()": "bridged from L1 (Arbitrum-style)",
  "bridgeMint(address,uint256)": "bridge can mint",
};

const parseArgs = (argv) => {
  const out = { token: undefined, rpc: DEFAULT_RPC, explorer: DEFAULT_EXPLORER };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--rpc") out.rpc = argv[++i];
    else if (argv[i] === "--explorer") out.explorer = argv[++i];
    else if (!out.token) out.token = argv[i];
  }
  return out;
};

const hasSelector = (code, signature) => {
  const sel = ethers.id(signature).slice(2, 10);
  return code.toLowerCase().includes(sel);
};

const slotAddress = (value) => {
  const addr = ethers.getAddress(`0x${value.slice(-40)}`);
  return addr === ethers.ZeroAddress ? undefined : addr;
};

const explorerInfo = async (base, address) => {
  try {
    const res = await fetch(`${base}/api/v2/smart-contracts/${address}`, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "carbonized-token-check/1.0", accept: "application/json" } });
    if (!res.ok) return { error: `explorer HTTP ${res.status}` };
    const j = await res.json();
    return {
      verified: Boolean(j.is_verified || j.is_fully_verified || j.source_code),
      name: j.name,
      compiler: j.compiler_version,
      proxy: j.proxy_type,
      implementations: (j.implementations || []).map((i) => i.address || i.address_hash),
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
};

const explorerToken = async (base, address) => {
  try {
    const [t, c] = await Promise.all([
      fetch(`${base}/api/v2/tokens/${address}`, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "carbonized-token-check/1.0", accept: "application/json" } }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${base}/api/v2/tokens/${address}/counters`, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "carbonized-token-check/1.0", accept: "application/json" } }).then((r) => (r.ok ? r.json() : null)),
    ]);
    return {
      holders: c?.token_holders_count ?? t?.holders_count,
      transfers: c?.transfers_count,
      exchangeRate: t?.exchange_rate,
      circulatingMarketCap: t?.circulating_market_cap,
      reputation: t?.reputation,
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
};

const main = async () => {
  const { token, rpc, explorer } = parseArgs(process.argv.slice(2));
  if (!token || !ethers.isAddress(token.toLowerCase())) {
    throw new Error("Usage: node scripts/verify/check_payment_token.js <tokenAddress> [--rpc url] [--explorer url]");
  }
  const address = ethers.getAddress(token.toLowerCase());
  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  const code = await provider.getCode(address);
  const rows = [];
  const add = (check, ok, detail) => rows.push({ check, result: ok === null ? "INFO" : ok ? "PASS" : "FAIL", detail });

  console.log(`Token ${address} on chain ${net.chainId} via ${rpc}\n`);
  if (code === "0x") {
    add("contract exists", false, "no code at this address");
    console.table(rows);
    process.exitCode = 1;
    return;
  }
  add("contract exists", true, `${(code.length - 2) / 2} bytes of code`);

  const erc20 = new ethers.Contract(address, ERC20_ABI, provider);
  const read = async (fn) => {
    try {
      return await erc20[fn]();
    } catch {
      return undefined;
    }
  };
  const [name, symbol, decimals, supply] = await Promise.all([read("name"), read("symbol"), read("decimals"), read("totalSupply")]);
  add("ERC-20 metadata readable", name !== undefined && symbol !== undefined && decimals !== undefined && supply !== undefined, `${name} / ${symbol}`);
  add("decimals == 6 (required by Carbonized)", Number(decimals) === 6, `decimals = ${decimals}`);
  const supplyWhole = decimals === undefined || supply === undefined ? undefined : Number(ethers.formatUnits(supply, decimals));
  add("total supply", null, supplyWhole === undefined ? "unreadable" : supplyWhole.toLocaleString("en-US"));

  const [implRaw, adminRaw, beaconRaw] = await Promise.all([
    provider.getStorage(address, IMPL_SLOT),
    provider.getStorage(address, ADMIN_SLOT),
    provider.getStorage(address, BEACON_SLOT),
  ]);
  let impl = slotAddress(implRaw);
  const admin = slotAddress(adminRaw);
  const beacon = slotAddress(beaconRaw);
  let beaconNote = '';
  if (!impl && beacon) {
    try {
      const b = new ethers.Contract(beacon, ['function implementation() view returns (address)', 'function owner() view returns (address)'], provider);
      impl = await b.implementation();
      const beaconOwner = await b.owner().catch(() => undefined);
      beaconNote = `, beacon ${beacon}${beaconOwner ? ` owned by ${beaconOwner}` : ''}`;
    } catch {
      beaconNote = `, beacon ${beacon} (implementation unreadable)`;
    }
  }
  const minimal = /^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3/i.exec(code);
  if (!impl && minimal) {
    impl = ethers.getAddress(`0x${code.slice(22, 62)}`);
    beaconNote = ', EIP-1167 minimal proxy (immutable pointer)';
  }
  add('upgradeable proxy (EIP-1967 / beacon)', impl ? null : true, impl ? `implementation ${impl}${admin ? `, admin ${admin}` : ''}${beaconNote}. Behavior is defined by the implementation; a beacon or admin can change it` : 'no proxy pattern detected');

  const flags = [];
  const scanTargets = [code];
  if (impl) {
    scanTargets.push(await provider.getCode(impl));
  }
  const allCode = scanTargets.join("");
  for (const [sig, meaning] of Object.entries(PRIVILEGED)) {
    if (hasSelector(allCode, sig)) flags.push(`${sig}: ${meaning}`);
  }
  add("privileged / unusual functions present", flags.length === 0 ? true : null, flags.length ? flags.join("; ") : "none of the checked selectors");

  const taxy = ["setTax(uint256)", "setFee(uint256)", "rebase()"].filter((s) => hasSelector(allCode, s));
  add("no tax or rebasing selectors (required)", taxy.length === 0, taxy.join(", ") || "none found (still cannot prove no hidden transfer fee; the contracts revert on a mismatch when staking)");

  const l1 = await new ethers.Contract(address, ['function l1Address() view returns (address)'], provider).l1Address().catch(() => undefined);
  if (l1) add('bridged token has an L1 address', null, `l1Address = ${l1}; independently verify the bridge and canonical USDG issuer`);
  const ex = await explorerInfo(explorer, address);
  if (ex.error) {
    add("source verified on explorer", null, `could not query explorer (${ex.error})`);
  } else {
    add("source verified on explorer", ex.verified, `${ex.name ?? "?"} ${ex.compiler ?? ""} ${ex.proxy ? `proxy=${ex.proxy}` : ""}`.trim());
  }
  const ti = await explorerToken(explorer, address);
  if (ti.error) {
    add("holders / activity", null, `could not query explorer (${ti.error})`);
  } else {
    add("holders / activity", null, `holders ${ti.holders ?? "?"}, transfers ${ti.transfers ?? "?"}, listed price ${ti.exchangeRate ?? "none"}`);
    if (ti.holders !== undefined) {
      add("meaningful distribution (>= 1,000 holders)", Number(ti.holders) >= 1000, `${ti.holders} holders`);
    }
  }
  add('supply is not absurd (0 or > 1e12 is a red flag)', supplyWhole !== undefined && supplyWhole > 0 && supplyWhole <= 1e12, supplyWhole === undefined ? 'unknown' : `${supplyWhole.toLocaleString('en-US')} units`);
  if (supplyWhole !== undefined && supplyWhole < 1_000_000) {
    add('liquidity / size', null, 'small supply: limited depth, and large USDG volume could not be settled');
  }

  console.table(rows);
  const failed = rows.filter((r) => r.result === "FAIL");
  console.log(failed.length ? `\nNO-GO: ${failed.length} check(s) failed.` : "\nNo hard failures. This is NOT confirmation that the token is canonical USDG: verify the address in the issuer's official documentation and read the verified source.");
  console.log(`Dead address reference (burn sink): ${DEAD}`);
  if (failed.length) process.exitCode = 1;
};

main().catch((e) => {
  console.error(String(e.message || e));
  process.exitCode = 1;
});
