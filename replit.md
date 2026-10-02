# مَتِين — Mateen

Arabic RTL platform for studying Islamic scholarly texts. The approved full product requirements are in `master-project-spec.md`; `master-project-spec.en.md` is its English translation.

## Run & Operate

- Managed workflows: `artifacts/mateen-platform: web` and `artifacts/api-server: API Server`.
- `pnpm --filter @workspace/mateen-platform run dev` — frontend, artifact-managed `PORT` and `BASE_PATH`.
- `pnpm --filter @workspace/api-server run dev` — API, artifact-managed port 8080.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- For a manual frontend build, supply the artifact's non-secret runtime settings: `PORT=24832 BASE_PATH=/ pnpm --filter @workspace/mateen-platform run build`.
- PostgreSQL and Clerk use workspace-managed secrets. Never log credentials or session cookies.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Wouter, TanStack Query, Tailwind, Arabic typography
- Authentication: Replit-managed Clerk, same-origin session cookies
- API: Express 5 at `/api`
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- API build: esbuild (ESM bundle)

## Where things live

- `artifacts/mateen-platform` — landing, sign-in/onboarding, student reader/dashboard, teacher draft profile.
- `artifacts/api-server` — Clerk proxy, authenticated Mateen routes, canonical source JSON.
- `lib/db/src/schema` — user profiles, per-user progress, teacher draft applications.
- `lib/api-spec/openapi.yaml` — contracts; regenerate clients and Zod schemas rather than hand-editing generated files.
- `attached_assets/turath-nawawi-source.json` — source metadata and original page responses for text review.

## Architecture decisions

- Browser authentication uses cookies, not bearer tokens. Mount Clerk's canonical proxy before parsers; retain host-based publishable-key resolution.
- A self-reported study marker is not a memorization grade, passed assessment, or certification.
- Student-to-teacher conversations must originate through assistant referrals, never direct student initiation.
- Saving a teacher profile is only saving a draft, not submitting qualifications or receiving approval.

## Product

The current foundation supports real sign-in, student/teacher onboarding, persistent reading position, study markers, bookmarks, text search, name editing, and teacher draft profiles. Only الأربعون النووية under الحديث / التمهيدي is open; other texts are locked with «قريباً».

Voice grading, assessments and spaced-review scheduling remain separate implementation stages. Qualification uploads, independent source/teacher review, scholarly question intake, private history, consented referrals, text conversations, commentary administration and audit/moderation are implemented. Generated scholarly answers remain gated on a configured provider, authorized reviewed commentary and a passing model/corpus evaluation. See `docs/scholarly-assistant-operations.md`; do not advertise gated services as operational.

## Gotchas

- The imported Nawawi transcription is pending scientific review; modern edition reuse rights remain unclear. Preserve source attribution, separate printed page numbers from viewer indexes, and do not use unreviewed text for graded assessments.
- No production readiness claim until source review, remaining launch gates, and production authentication configuration are addressed.
- Use the approved warm brand, official logo, and Arabic RTL layout. The public landing stays light; portals may use a dark theme.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
