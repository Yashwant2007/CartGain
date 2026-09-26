# ADR-008 — Observability without a platform

## Context
CartGain runs on Vercel serverless without an external observability vendor.
We still need: correlated request logs, error capture, failure alerting and
health visibility — without leaking secrets or PII.

## Decision
- **Trace corridor**: `src/middleware.ts` stamps every `/api/*` request with an
  `x-request-id` header (echoed on the response) so a merchant support report
  maps to server logs.
- **Structured logger** (`src/lib/observability/logger.ts`): `captureError`
  persists structured error rows (component, operation, statusCode,
  requestId), with automatic **secret redaction** and **PII redaction** before
  anything is stored.
- **Alerting**: `src/lib/alerter.ts` escalates high-severity failures.
- **Health**: `/api/health` reports db/redis/env/ai/version; liveness and
  readiness are intentionally combined (single-serverless region, low value in
  splitting).
- **Webhooks**: verify signatures synchronously, ack `2xx` fast, then process
  async with Redis NX de-duplication and per-topic error capture.

## Alternatives considered
- Adding an APM vendor — deferred (cost, no urgent need; revisit at scale).
- Logging everything raw — rejected (PII/secrets).

## Consequences
- Good-enough traceability and failure visibility for a small team.
- Moving to an APM later is a thin adapter away: the logger is already the
  single capture point.

## Status
Accepted. Implemented.