# ADR-003 — Queue architecture (Bull, in-process serverless)

## Context
Vercel serverless has no persistent worker. Background work (abandoned-cart
processing, payment retries, revenue-share billing, weekly reports) runs via
Bull + ioredis, with producers/processors co-located in the same Next app and
triggered through authenticated job endpoints.

## Decision
- **Separation of concerns**: job *definition* (what), *producer* (when), and
  *processor* (how) live apart: `src/lib/jobs/*` defines/produces;
  `src/lib/queue/init.ts` registers processors; cron endpoints
  (`api/jobs/*`) trigger with `job-auth.ts` and are de-duplicated with
  `job-lock.ts` so a retried cron never double-queues.
- **Idempotency contract**: every processor must be safe to run twice; de-dup
  keys (e.g. Shopify order drops) use Redis NX with a TTL.
- **Failure handling**: processors capture structured errors via
  `observability/logger` and escalate via `alerter`; queue retries are explicit
  per-job.

## Alternatives considered
- External worker (BullMQ Pro remote worker) — deferred until volume justifies
  it; in-process processing within Vercel's 60s window covers current scale.
- No queue, all inline — rejected (webhook paths must ack fast).

## Consequences
- Simple ops story (no new infra) at the cost of a 60s ceiling per run — watch
  for jobs that exceed it as scale grows.

## Status
Accepted. Implemented.