# Gauge govern mechanism

These details accompany the contract’s observable outcomes.

## GOVERN-001

The threshold action is approval:limit; billing adjustments use packet:adjust.

Command names.

## GOVERN-011

Audit UI/API: /app/audit, GET /api/gauge/audit, /api/gauge/audit/export and /api/gauge/audit/verify. Entries form a SHA-256 chain over canonical JSON {previous, entry}, starting at gauge-audit-v1; pending entries seal in sequence before commands/reads, and checkpoints use seq/hash.

Routes, canonicalization and integrity algorithm.

## GOVERN-008

Credentials use AES-256-GCM under a setup-generated dedicated installation provider key, not the session secret; per-credential keys use HKDF-SHA-256 bound to connection/version. Crank proof may use a network-edge receiver speaking its published trigger contract.

Cryptographic mechanism and network-edge proof method.
