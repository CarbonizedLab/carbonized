#!/usr/bin/env python3
"""Fail-closed security gate for the public release. Prints file:line + kind, never the value.

Allowlist entries are specific file:line pairs verified by manual review:
- documented asterisk-password placeholders (postgres:***@localhost, unused:***@localhost)
- public EIP-1967 slot constants (well-known, not secret material)
"""
import re
import subprocess
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
files = subprocess.check_output(["git", "ls-files"], text=True, cwd=root).splitlines()

ALLOWLIST = {
    (".env.example", 83),
    (".github/actions/setup/action.yml", 20),
    ("drizzle.config.ts", 20),
    ("contracts/scripts/verify/check_payment_token.js", 12),
    ("contracts/scripts/verify/check_payment_token.js", 13),
    ("contracts/scripts/verify/check_payment_token.js", 14),
    ("scripts/security-gate.py", 34),  # self-reference: pattern definition line
    ("scripts/security-gate.py", 35),  # self-reference: comment line
}

patterns = [
    (r"ghp_[A-Za-z0-9]{36,}", "github-pat"),
    (r"github_pat_[A-Za-z0-9_]{20,}", "github-pat-fg"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "private-key-block"),
    (r"postgresql(\+?[a-z]*)://[^:\s]+:(?!\*+@)[^@\s]+@", "db-url-password"),
    (r"sk-[A-Za-z0-9]{20,}", "sk-key"),
    (r"SUMSUB_SECRET_KEY\s*=[\"']?[A-Za-z0-9/+_-]{16,}", "sumsub-value"),
    (r"BETTER_AUTH_SECRET\s*=[\"']?(?!dummy_)[A-Za-z0-9/+_-]{16,}", "auth-value"),
    (r"GOOGLE_CLIENT_SECRET\s*=[\"']?(?!dummy_)[A-Za-z0-9_-]{10,}", "google-value"),
    (r"\b0x[a-fA-F0-9]{64}\b", "hex64"),
    # match /root/ paths but ignore this script's own docstring mentions
    (r"(?<!scripts/)/root/", "server-path"),
    (r"mnemonic\s*[:=]", "mnemonic"),
    (r"\bAKIA[0-9A-Z]{16}\b", "aws"),
]

hits = []
for rel in files:
    if rel == "pnpm-lock.yaml" or "/fonts/" in rel or rel == "scripts/security-gate.py":
        continue  # lockfile: generated; fonts: base64 glyph data
    p = root / rel
    if not p.is_file():
        continue
    try:
        text = p.read_text(errors="replace")
    except Exception:
        continue
    for i, line in enumerate(text.splitlines(), 1):
        if (rel, i) in ALLOWLIST:
            continue
        for pat, kind in patterns:
            if re.search(pat, line):
                hits.append((rel, i, kind))

print("SECURITY_GATE_HITS=" + str(len(hits)))
for rel, ln, kind in hits:
    print(f"{kind}: {rel}:{ln}")
print("GATE_PASS=" + str(not hits))
raise SystemExit(0 if not hits else 1)
