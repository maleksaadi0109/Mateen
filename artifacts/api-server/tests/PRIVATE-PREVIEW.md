# Private administrative preview regressions

Run both the isolated HTTP and UI suites:

```sh
pnpm --filter @workspace/api-server run test:scholarly:preview
```

The existing `test:scholarly` command includes these suites alongside provider
unit tests and participant HTTP regressions. The participant bundle still
replaces the administrative router; the separate `--preview` bundle deliberately
does not replace either that router or the scholarly provider implementation.

## Isolation and coverage

- A fresh Unix-socket-only PostgreSQL cluster receives the schema and synthetic
  fixtures, then is destroyed even when tests fail. The child process does not
  inherit the application's database, Clerk or provider credentials.
- Clerk lookups are replaced only during test bundling. Reviewer metadata and
  session factors exist only in test memory; no real authority is granted.
- The real provider parser runs against synthetic transport responses. Its
  transport rejects unexpected URLs rather than allowing a network fallback.
- HTTP tests exercise secure content reviewers, student and qualification-only
  denial, ordinary sessions with optional MFA, verified email/active account, in-flight permission revocation,
  invalid bodies, the per-actor rate limit and provider failures.
- Every HTTP case compares complete before/after rows in all scholarly tables
  except the audit. Protected tables contain nonempty synthetic fixtures, so the
  comparison detects deletion and modification, not just additional rows.
- Successful audits contain only action metadata; denied and failed previews
  create no audit event. Neither questions nor answers are audit content.
- UI tests mount the real `PrivatePreview` with the generated mutation hook and
  React Query in a DOM. Only Clerk identity discovery and the decorative notice
  are replaced. They verify request payloads, rendering, warnings, clearing,
  errors, duplicate-submit prevention and draft removal on account/session
  switching, sign-out, late responses and remounting. Storage stays empty.

These tests establish deterministic access and privacy regressions, not real
Clerk authentication, a live authorized administrative browser journey, NVIDIA
Arabic quality, source grounding or scientific approval. An independently
authorized reviewer must still check the real administrative preview journey;
do not grant yourself authority to perform that check.