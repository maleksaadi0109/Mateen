# Actual study continuity

## Counting and privacy

- Reading: at least 30 continuous seconds in a visible, focused reader, followed by an explicit navigation to a different digital page. Restoration, same-page selection, fast skipping and opening the reader do not complete activity.
- Recitation: at least five seconds in the focused reader and five new **final recognized words**, irrespective of correctness. Interim speech, omissions inferred by alignment, silence, microphone permission/start, manual reveals and report imports are not evidence.
- Server-owned receipt time assigns the day. No client timestamp, owner, date, transcript, question or audio is accepted. The server enforces minimum elapsed session time; visibility/navigation and word counts are client-attested engagement, not anti-cheat evidence or exam mastery.
- The first reader session fixes the account's validated IANA timezone. Subsequent devices cannot rewrite it. DST is handled by calendar dates, not 24-hour intervals. A current streak ends on today or yesterday; one missed calendar day breaks it.
- Daily rows are unique per account/day. Completion locks the session and remembers its original completion day, so retries cannot mint a new day after midnight. Session starts are idempotent within their two-hour lifetime; expired sessions are pruned opportunistically at subsequent starts. Historical day rows are independent of session pruning.
- There is no backfill from report timestamps or saved positions, and report creation/import/deletion cannot edit the activity ledger. The old report-save summary remains explicitly labelled separately.
- Offline completion isn't backdated or silently queued. The reader displays an error and allows an idempotent retry; if received later, the **first accepted** completion uses the server's current day. Expired sessions need fresh activity.

## Implementation and verification

Contract: `lib/api-spec/openapi.yaml`; regenerate with `pnpm --filter @workspace/api-spec run codegen`.

Schema/migration: `lib/db/src/schema/study-activity.ts` and `lib/db/migrations/0011_study_activity.sql`. Follow existing development and post-merge schema-push flow; no historical data migration.

API: `artifacts/api-server/src/routes/study-activity.ts`; pure calendar policy beside its unit tests in `src/lib/study-activity-policy.ts`.

Client: `use-study-activity.ts` uses account-scoped queries, server-confirmed updates, focus/visibility resets, explicit navigation and monotonic final-ASR word counts. Reader, library and reports share the same continuity card and rules.

Checks:

```sh
pnpm --filter @workspace/api-server run test:study-activity
pnpm --filter @workspace/mateen-platform run test:scholarly:preview
pnpm run typecheck
```

The API regression uses disposable PostgreSQL and a bundle-only auth adapter, never real study history. Tests cover midnight/DST, gaps, timing, ownership, duplicate concurrent sessions, report independence, foreground dwell and speech provenance. Browser verification uses real authenticated API calls; simulated speech, if used, is only to exercise browser events, not certify speech-recognition quality.