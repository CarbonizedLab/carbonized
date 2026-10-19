// Fail-closed approval gate for real mainnet broadcasts. Hardhat override tests never call this gate.
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { verifyMessage } = require("ethers");

const SHA256 = /^[a-f0-9]{64}$/i;
const COMMIT = /^[a-f0-9]{40}$/i;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const APPROVED = "approved";
const MAINNET_CHAIN_ID = 4663;

function fail(message) {
  throw new Error(`MAINNET RELEASE MANIFEST REQUIRED: ${message}`);
}

/** Exact human-readable payload signed independently by every release approver. */
function approvalMessage({ chainId, releaseCommit, audit }) {
  return [
    "Carbonized mainnet release approval",
    `chainId:${chainId}`,
    `releaseCommit:${releaseCommit.toLowerCase()}`,
    `auditSha256:${audit.sha256.toLowerCase()}`,
    `auditApprovedAt:${audit.approvedAt}`,
  ].join("\n");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function checkedOutCommit({ cwd = process.cwd(), expectedCommit } = {}) {
  if (expectedCommit) return expectedCommit.toLowerCase();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().toLowerCase();
  } catch {
    fail("must run from an immutable Git checkout so releaseCommit can be verified");
  }
}

/**
 * Validates an operator-supplied, independently approved release manifest.
 * It binds the audit bytes, exact checked-out source commit, and two unique EVM
 * signatures. A checked-in template can never authorize a broadcast.
 */
function assertReleaseManifest({ env = process.env, manifestPath, cwd, expectedCommit } = {}) {
  const requested = manifestPath ?? env.RELEASE_MANIFEST;
  if (!requested?.trim()) fail("set RELEASE_MANIFEST to an approved manifest file before broadcasting");
  const file = path.resolve(requested);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) fail(`file not found: ${file}`);

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    fail(`invalid JSON: ${file}`);
  }
  if (manifest?.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (manifest.status !== APPROVED) fail('status must be "approved"');
  if (manifest.chainId !== MAINNET_CHAIN_ID) fail(`chainId must be ${MAINNET_CHAIN_ID}`);
  if (typeof manifest.releaseCommit !== "string" || !COMMIT.test(manifest.releaseCommit)) fail("releaseCommit must be a 40-character git commit hash");
  const commit = checkedOutCommit({ cwd, expectedCommit });
  if (manifest.releaseCommit.toLowerCase() !== commit) fail(`releaseCommit does not match checked-out commit ${commit}`);
  if (typeof manifest.audit?.report !== "string" || manifest.audit.report.trim() === "") fail("audit.report is required");
  if (typeof manifest.audit?.sha256 !== "string" || !SHA256.test(manifest.audit.sha256)) fail("audit.sha256 must be a SHA-256 hash");
  if (Number.isNaN(Date.parse(manifest.audit?.approvedAt ?? ""))) fail("audit.approvedAt must be an ISO timestamp");

  const auditFile = path.resolve(path.dirname(file), manifest.audit.report);
  if (!fs.statSync(auditFile, { throwIfNoEntry: false })?.isFile()) fail(`audit report file not found: ${auditFile}`);
  if (sha256File(auditFile) !== manifest.audit.sha256.toLowerCase()) fail("audit report SHA-256 does not match manifest");

  if (!Array.isArray(manifest.approvedBy) || manifest.approvedBy.length < 2) fail("approvedBy must contain at least two signed approvals");
  const message = approvalMessage(manifest);
  const signers = new Set();
  for (const approval of manifest.approvedBy) {
    if (!ADDRESS.test(approval?.address ?? "") || typeof approval?.signature !== "string") fail("each approval needs an EVM address and signature");
    let recovered;
    try {
      recovered = verifyMessage(message, approval.signature);
    } catch {
      fail("invalid approval signature");
    }
    if (recovered.toLowerCase() !== approval.address.toLowerCase()) fail("approval signature does not match its address");
    signers.add(recovered.toLowerCase());
  }
  if (signers.size < 2) fail("approvals must be signed by at least two unique addresses");
  return manifest;
}

module.exports = { approvalMessage, assertReleaseManifest, MAINNET_CHAIN_ID };
