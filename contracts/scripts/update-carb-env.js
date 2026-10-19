// Writes the NEXT_PUBLIC_* contract addresses of a deployment into the Carbonized web app's .env.local.
//
//   node scripts/update-carb-env.js --network robinhood          # testnet  (deployments/robinhood.json)
//   node scripts/update-carb-env.js --network robinhoodMainnet   # mainnet  (deployments/robinhoodMainnet.json)
//   options: --env-file <path>  override the target file     --dry  print, do not write
//
// Also writes deployments/vercel-env.<network>.txt: the same public values as a ready-to-paste Vercel list
// (RPC / Reown / app URL are placeholders; no secret ever appears in it).
//
// Only the contract / deploy-block lines are managed (inside a marked block). NEXT_PUBLIC_REOWN_PROJECT_ID,
// NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_NETWORK, NEXT_PUBLIC_CHAIN_ID and every other line are never touched;
// the script only warns when NETWORK / CHAIN_ID in the file do not match the deployment.

const fs = require("node:fs");
const path = require("node:path");

const NETWORKS = {
  robinhood: {
    chainId: 46630,
    appNetwork: "robinhood",
    rpc: "https://rpc.testnet.chain.robinhood.com/rpc",
    explorer: "https://explorer.testnet.chain.robinhood.com",
  },
  robinhoodMainnet: {
    chainId: 4663,
    appNetwork: "robinhood-mainnet",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    fallbackRpc: "https://robinhood-rpc.publicnode.com",
    explorer: "https://robinhoodchain.blockscout.com",
  },
};
const BLOCK_START = "# >>> carb contracts (managed by scripts/update-carb-env.js) >>>";
const BLOCK_END = "# <<< carb contracts <<<";
/** Obsolete aliases the previous version of this script wrote; removed so they cannot go stale. */
/** CARB stack: written only when the deployment file has it; always managed so a stale line cannot survive. */
const TOKEN_ENV_KEYS = {
  CarbToken: "NEXT_PUBLIC_CARB_TOKEN",
  CarbStaking: "NEXT_PUBLIC_CARB_STAKING",
  IssuerBond: "NEXT_PUBLIC_ISSUER_BOND",
  CarbGovernor: "NEXT_PUBLIC_GOVERNOR",
  CarbTimelock: "NEXT_PUBLIC_TIMELOCK",
  CarbVotes: "NEXT_PUBLIC_CARB_VOTES",
};
const LEGACY_KEYS = ["NEXT_PUBLIC_CCT_ICM_COMPLIANCE", "NEXT_PUBLIC_CCT_GOLD_STANDARD", "NEXT_PUBLIC_USDC_ADDRESS", "NEXT_PUBLIC_USDG_ADDRESS"];
/** "true" when the deployment attached an external (launchpad) CARB token instead of deploying CarbToken. */
const EXTERNAL_ENV_KEY = "NEXT_PUBLIC_CARB_EXTERNAL";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** `.env.local` of the web app: sibling `carb/` folder of the contracts workspace, or the repo root. */
function defaultEnvFile() {
  if (process.env.CARBON_ENV_FILE) return path.resolve(process.env.CARBON_ENV_FILE);
  const sibling = path.join(__dirname, "../../carb");
  if (fs.existsSync(path.join(sibling, "package.json"))) return path.join(sibling, ".env.local");
  const root = path.join(__dirname, "../..");
  if (fs.existsSync(path.join(root, "next.config.ts"))) return path.join(root, ".env.local");
  throw new Error("Cannot locate the web app; pass --env-file <path> (or set CARBON_ENV_FILE)");
}

/** Env values for a deployment file (schemaVersion 2; older files with MockUSDC are understood too). */
function buildValues(deployment) {
  const c = deployment.contracts ?? {};
  const pools = c.CarbonCreditTokens ?? {};
  const paymentSymbol = deployment.paymentToken?.symbol ?? (c.USDC || c.MockUSDC ? "USDC" : undefined);
  if (!/^[A-Z][A-Z0-9_]*$/.test(paymentSymbol ?? "")) throw new Error(`deployment file has invalid payment token symbol ${paymentSymbol}`);
  const paymentToken = c[paymentSymbol] ?? c.USDC ?? c.MockUSDC ?? deployment.paymentToken?.address;
  const values = {
    NEXT_PUBLIC_CARBON_CREDIT_NFT: c.CarbonCreditNFT,
    NEXT_PUBLIC_CARBON_CREDIT_TOKEN: pools.VERRA_VCS,
    NEXT_PUBLIC_CARBON_CREDIT_TOKEN_ICM_COMPLIANCE: pools.ICM_COMPLIANCE,
    NEXT_PUBLIC_CARBON_CREDIT_TOKEN_GOLD_STANDARD: pools.GOLD_STANDARD,
    NEXT_PUBLIC_CARBON_MARKETPLACE: c.CarbonMarketplace,
    NEXT_PUBLIC_CARBON_REGISTRY: c.CarbonRegistry,
    NEXT_PUBLIC_CARBON_PRICE_ORACLE: c.CarbonPriceOracle,
    NEXT_PUBLIC_EMISSION_VERIFIER: c.EmissionVerifier,
    NEXT_PUBLIC_REGISTRY_SYNC: c.RegistrySync,
    [`NEXT_PUBLIC_${paymentSymbol}_ADDRESS`]: paymentToken,
    NEXT_PUBLIC_DEPLOY_BLOCK: deployment.deployBlock === undefined ? undefined : String(deployment.deployBlock),
  };
  for (const [contractName, envKey] of Object.entries(TOKEN_ENV_KEYS)) {
    if (c[contractName] !== undefined) values[envKey] = c[contractName];
  }
  for (const [key, value] of Object.entries(values)) {
    if (key === "NEXT_PUBLIC_DEPLOY_BLOCK") {
      if (!/^[0-9]+$/.test(value ?? "")) throw new Error("deployment file has no numeric deployBlock");
    } else if (!ADDRESS.test(value ?? "")) {
      throw new Error(`deployment file has no valid address for ${key} (got ${value})`);
    }
  }
  // The app labels CARB as an external (launchpad) token; absent for the own CarbToken (and removed if stale).
  if (deployment.externalToken === true) values[EXTERNAL_ENV_KEY] = "true";
  return values;
}

function paymentNote(deployment) {
  const p = deployment.paymentToken;
  if (!p) return "# Payment token: USDC (older deployment file). The app reads decimals() from the token onchain; nothing to configure.";
  const kind = p.isMock ? "MOCK test token" : "canonical token";
  return `# Payment token: ${p.symbol} (${kind}), ${p.decimals} decimals. The app reads decimals() from the token onchain; nothing to configure.`;
}

/**
 * Comment line(s) for a deployment that attached an EXTERNAL (launchpad) CARB token: NEXT_PUBLIC_CARB_TOKEN is that
 * token's address, NEXT_PUBLIC_CARB_VOTES (only when present) is the CarbVotes wrapper used for governance.
 */
function externalTokenNote(deployment) {
  const e = deployment.config?.token?.external;
  if (!deployment.externalToken || !e) return [];
  const votes =
    e.votes === "wrapper"
      ? "governance votes via the CarbVotes wrapper (NEXT_PUBLIC_CARB_VOTES)"
      : "governance votes are the token's own (no wrapper, NEXT_PUBLIC_CARB_VOTES unset)";
  return [`# CARB: EXTERNAL token ${e.symbol} (${e.decimals} decimals) at NEXT_PUBLIC_CARB_TOKEN; ${votes}. The app reads decimals() / symbol() onchain.`];
}

/** Returns the new file text. Pure function: easy to test. */
function applyToEnvText(text, { values, networkName, deployment }) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const managedKeys = new Set([...Object.keys(values), ...Object.values(TOKEN_ENV_KEYS), EXTERNAL_ENV_KEY, ...LEGACY_KEYS]);
  const lines = text.split(/\r?\n/);

  const kept = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.startsWith(BLOCK_START)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line.startsWith(BLOCK_END)) inBlock = false;
      continue;
    }
    const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
    if (key && managedKeys.has(key)) continue;
    kept.push(line);
  }
  while (kept.length > 0 && kept.at(-1).trim() === "") kept.pop();

  const block = [
    BLOCK_START,
    `# network: ${networkName}  chain: ${deployment.chainId}  deployed: ${deployment.timestamp}`,
    paymentNote(deployment),
    ...externalTokenNote(deployment),
    ...Object.entries(values).map(([k, v]) => `${k}=${v}`),
    BLOCK_END,
  ];
  return `${[...kept, ...(kept.length ? [""] : []), ...block].join(eol)}${eol}`;
}

/** Ready-to-paste Vercel environment list (public values only; placeholders where the operator must choose). */
function buildVercelText(values, networkName, deployment) {
  const net = NETWORKS[networkName];
  const rows = [
    `# Vercel -> Project -> Settings -> Environment Variables (all NEXT_PUBLIC_*: inlined at build time, redeploy after changes)`,
    `# Generated by scripts/update-carb-env.js from deployments/${networkName}.json (deployed ${deployment.timestamp}). PUBLIC VALUES ONLY.`,
    paymentNote(deployment),
    ...externalTokenNote(deployment),
    `NEXT_PUBLIC_NETWORK=${net.appNetwork}`,
    `NEXT_PUBLIC_CHAIN_ID=${net.chainId}`,
    `NEXT_PUBLIC_RPC_URL=<set your RPC URL, e.g. ${net.rpc}${net.fallbackRpc ? ` or fallback ${net.fallbackRpc}` : ""}>`,
    "NEXT_PUBLIC_LOGS_RPC_URL=<optional: RPC that serves eth_getLogs for the event scans>",
    `NEXT_PUBLIC_EXPLORER_URL=${net.explorer}`,
    "NEXT_PUBLIC_REOWN_PROJECT_ID=<your Reown / WalletConnect project id>",
    "NEXT_PUBLIC_APP_URL=<https://your-domain>",
    ...Object.entries(values).map(([k, v]) => `${k}=${v}`),
  ];
  return `${rows.join("\n")}\n`;
}

/** Warnings about lines this script deliberately leaves alone. */
function mismatchWarnings(text, networkName) {
  const expected = NETWORKS[networkName];
  const read = (key) => new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\r\\n#]*)"?`, "m").exec(text)?.[1]?.trim();
  const warnings = [];
  const net = read("NEXT_PUBLIC_NETWORK");
  const chain = read("NEXT_PUBLIC_CHAIN_ID");
  if (net !== expected.appNetwork) warnings.push(`NEXT_PUBLIC_NETWORK is "${net ?? "(unset)"}"; set it to ${expected.appNetwork}`);
  if (chain !== String(expected.chainId)) warnings.push(`NEXT_PUBLIC_CHAIN_ID is "${chain ?? "(unset)"}"; set it to ${expected.chainId}`);
  if (!read("NEXT_PUBLIC_RPC_URL")) warnings.push(`NEXT_PUBLIC_RPC_URL is unset; e.g. ${expected.rpc}`);
  return warnings;
}

function parseArgs(argv) {
  const out = { network: undefined, envFile: undefined, dry: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--network") out.network = argv[++i];
    else if (argv[i] === "--env-file") out.envFile = argv[++i];
    else if (argv[i] === "--dry") out.dry = true;
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (!out.network || !NETWORKS[out.network]) {
    throw new Error(`--network must be one of: ${Object.keys(NETWORKS).join(", ")}`);
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  const expected = NETWORKS[args.network];
  const deploymentFile = path.join(__dirname, "../deployments", `${args.network}.json`);
  if (!fs.existsSync(deploymentFile)) throw new Error(`${deploymentFile} not found; deploy first`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  if (deployment.chainId !== expected.chainId) {
    throw new Error(`${deploymentFile} is for chain ${deployment.chainId}, expected ${expected.chainId}`);
  }

  const values = buildValues(deployment);
  const envFile = args.envFile ? path.resolve(args.envFile) : defaultEnvFile();
  const existing = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const next = applyToEnvText(existing, { values, networkName: args.network, deployment });

  const vercelFile = path.join(path.dirname(deploymentFile), `vercel-env.${args.network}.txt`);
  const vercelText = buildVercelText(values, args.network, deployment);
  if (args.dry) {
    process.stdout.write(`${next}\n`);
    process.stdout.write(`--- ${vercelFile} ---\n${vercelText}`);
  } else {
    fs.writeFileSync(envFile, next);
    fs.writeFileSync(vercelFile, vercelText);
    process.stdout.write(`Updated ${envFile}\nWrote ${vercelFile}\n`);
  }
  for (const w of mismatchWarnings(existing, args.network)) process.stdout.write(`WARNING: ${w}\n`);
  process.stdout.write("REOWN / RPC / NETWORK / CHAIN_ID lines were not modified. Restart `next dev` / redeploy the site to pick up changes.\n");
  if (!deployment.isTestnet && deployment.isTestnet !== undefined) {
    process.stdout.write("Mainnet: also set the same NEXT_PUBLIC_* values in the Vercel project (they are inlined at build time).\n");
  }
}

module.exports = { buildValues, buildVercelText, TOKEN_ENV_KEYS, applyToEnvText, mismatchWarnings, NETWORKS, BLOCK_START, BLOCK_END };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
