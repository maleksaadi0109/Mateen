# Scholarly participant regression checks

Run before merging changes to assistant history, referrals, teacher conversations,
or scholarly persistence:

```sh
pnpm --filter @workspace/api-server run test:scholarly
pnpm run typecheck
```

`test:scholarly` runs the existing pure safety/structured-output tests and the
HTTP/PostgreSQL participant tests. To run only the latter:

```sh
pnpm --filter @workspace/api-server run test:scholarly:http
```

## Requirements and isolation

- Node.js 24, workspace dependencies, and PostgreSQL binaries `initdb`, `pg_ctl`
  and `psql` on `PATH`. Run as a non-root user (PostgreSQL requires this).
- No Clerk keys, model credentials, application `DATABASE_URL`, or real accounts
  are required. The runner constructs its own child environment without secrets.
- Each run creates a fresh PostgreSQL cluster under the system temporary
  directory, with a private Unix socket and TCP database listening disabled.
  It generates the DDL from the **current Drizzle schema**, not a hand-maintained
  copy or an in-memory imitation. No development or production tables are changed.
- The runner stops the cluster and deletes temporary files on success or failure.
  Missing PostgreSQL or an unsuccessful test causes a nonzero exit; there is no
  skipped-test fallback.
- A temporary esbuild bundle substitutes Clerk identity discovery and model
  completion. Only four fixed synthetic participant identities are accepted.
  These substitutes are outside application `src` and are never imported by the
  production build. Administrator routes are excluded from this bundle.
- Real Express participant routes, origin checks, role/ownership checks, readiness
  gates, Drizzle queries, transactions, constraints, row locks, notifications,
  and successful-response Zod validation still run.
- Tests are sequential with fresh fixtures per case. Separate executions use
  different database clusters and HTTP ports and can run concurrently.

## Covered boundaries

| Area | HTTP and database assertions |
| --- | --- |
| Authentication and origin | Anonymous requests, wrong roles, and cross-origin writes are denied without persistence. |
| Student privacy | History belongs to the requesting student; guessed conversation/question IDs cannot expose messages, status, referral previews, follow-up writes, or issue reports. |
| Consent | Only persisted, owned, abstained questions can be referred; missing/false/string consent and extra sharing fields are rejected. |
| Minimal sharing | Preview, teacher inbox, and teacher message reads exclude other questions, answers, unrelated threads, and unlinked messages. |
| Concurrent assignment | Tests hold a real PostgreSQL teacher row lock, start the HTTP referral, confirm it is blocked, then change availability/approval before committing. Explicit stale selections share nothing; automatic selection chooses an eligible alternative. |
| Waiting and retries | No teachers produces a private waiting record; retry assigns that same record and notifies once. Concurrent consents produce one referral and one notification. |
| Established replies | Approved teachers may reply while unavailable for new assignments; student/teacher replies retain the referred question association. Same-ID retries are idempotent, changed content is rejected, and closed threads reject writes. |
| Revocation | Revoked teachers lose inbox/list/messages/status/reply/status-update access. Student replies to revoked assignments are blocked without notifications. |
| New questions | Assistant questions and assistant-only follow-ups remain private rather than becoming visible to a previously assigned teacher. |
| Source withdrawal | A controlled model-completion barrier lets a source be withdrawn after retrieval but before persistence; the question abstains without answer/citations/assistant message. A positive control verifies that an unchanged indexed source does publish citations. |
| Provider failure | A failed completion returns unavailable while privately saving an abstained question without an assistant answer. |

## Deliberate exclusions

This suite does **not** certify real Clerk sessions, MFA, trusted-administrator
review journeys, real model grounding quality, reuse rights, or production
readiness. Approval/evaluation records and commentary are synthetic fixtures in
the disposable cluster only. The existing safety-helper tests remain responsible
for provider structured-output and quotation validation; the HTTP suite replaces
the external model to make participant-boundary and timing tests deterministic.