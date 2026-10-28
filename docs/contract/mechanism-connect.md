# Gauge connect mechanism

These details accompany the contract’s observable outcomes.

## CONNECT-006

Linear uses its GraphQL API.

Provider transport detail.

## CONNECT-007

Current owner-initiated reads cover the latest 30 pull requests and issues per repository.

Present bounded provider query; broader ingestion remains due.

## CONNECT-013

Use Harvest API v2 and Forecast API or schedule exports.

Source interface versions.

## CONNECT-016

Zapier Catch Hooks and general hooks use HMAC-SHA-256 over exact event bytes.

Transport/signature mechanism.

## CONNECT-022

Workflow receipt verification is domain-separated from the outbound event signature.

Receipt-authentication mechanism.

## CONNECT-024

Only SHA-256 hashes are stored. Read route: GET /api/gauge/state?from&to; self-revoke: POST /api/gauge/keys/revoke with the presented Bearer key and no body-selected key. Unsupported use returns 403, revoked reads 401, and self-revocation always empty 200.

Hash, route and transport response details.

## CONNECT-026

The secret is retained as a SHA-256 hash only.

Credential hash representation.

## CONNECT-029

Signature is HMAC-SHA-256 over timestamp, a full stop and exact body bytes.

Signature algorithm and wire format.
