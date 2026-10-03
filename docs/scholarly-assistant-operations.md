# Scholarly assistant and referrals

## Launch boundaries

Question intake and private history work independently of generated answers. When scholarly answering is not ready, the assistant saves an abstention, not a religious answer. A student can review the referral preview and consent to sharing the selected question and study context. No teacher conversation can be started from a directory card or a direct referral request.

Generated answers remain disabled until all three gates pass:

1. At least one legally authorized, scientifically reviewed commentary version has been indexed.
2. A model provider is configured and usable.
3. The server's Arabic retrieval, exact-citation and abstention evaluation passes for the current model and corpus, together with the administrator's scientific sign-off.

Read the live readiness indicator for the configured provider and current corpus. A configured NVIDIA connection alone does not approve a commentary corpus. Do not mark sources as approved merely to make the indicator turn green. Synthetic regression fixtures are test data, not authorized scholarly sources.

## Administrative workflow

Use `/admin/scholarly`. Access uses the shared content-review authority: a verified email, MFA-protected session and trusted `mateenContentReviewer` grant in Clerk private metadata. The student's or teacher's browser cannot grant review access.

1. Create a distinct source version with its book, author, edition, publisher, rights basis and authorization reference.
2. Add extracted text passages. Keep the printed page and PDF page distinct; a viewer page is not a printed-page citation.
3. An independently authorized reviewer must read every extracted passage and its metadata before recording scientific approval and confirming reuse evidence. The creator cannot approve their own source version.
4. Index the reviewed version. Draft and withdrawn sources cannot supply new answers.
5. Select and save the supported model, then run the server evaluation and record the human scientific review.
6. Inspect issue reports with the associated question, answer and citations. Record a reason for moderation.
7. Withdraw a defective source immediately. Previous citation snapshots remain available for private review, but the withdrawn source cannot support new answers.

Changing the corpus, citation metadata or model invalidates the corresponding evaluation. Re-evaluate before presenting new scholarly answers.

## Provider configuration

The adapter supports NVIDIA Nemotron via `NVIDIA_API_KEY` at the fixed NVIDIA endpoint, Replit-managed OpenAI settings (`AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY`), and a direct OpenAI key (`OPENAI_API_KEY`, with optional `OPENAI_BASE_URL`). Manage credentials only through Replit Secrets; never enter them into source records, prompts, admin notes or source code.

NVIDIA requests never silently fall back to another provider. Once a connection is configured, use the scientific evaluation rather than assuming Arabic suitability.

Published answers are assembled only from verified exact quotations. The model's unrestricted explanatory prose is not published: a genuine citation alone cannot prove that every generated claim is supported. Fatwa requests and questions without sufficient evidence lead to abstention/referral.

## Short external commentary excerpts

Numbered Nawawi study requests now retrieve a short, exact excerpt (at most 70
words per book) from the corresponding chapter of Ibn Uthaymeen's commentary
and al-Abbad's *Fath al-Qawi al-Matin* on Shamela. The identifier accepts numbers
before or after "حديث", Arabic/Persian digits, ordinals, recognized names, and
distinctive phrases matched against the actual study text. The optional study
context can identify the entry too. Only ambiguous or unidentified requests ask
for more wording, a title, or a number; explicit invalid/conflicting numbers are
never replaced with an inferred entry. Other general study
questions retain their explicitly unverified model-answer path.

Excerpt intent is retained even when identification fails (including bare
requests such as "اشرح 99" and "اشرح ٠"). Multiple numeric or named references
are collected before selection; conflicting entries request clarification,
without fetching an excerpt or calling either model-answer path.

The source URLs and chapter indexes are server-owned allowlisted values.
Responses are bounded, redirects are refused, and the chapter heading and
printed-page metadata are checked. Only paginated text needed for a short
excerpt is fetched; a bounded five-minute memory cache reduces repeated
requests. External source failures are explicit and never substituted with
model-written explanations.

These are **unreviewed electronic reference excerpts**, not approved corpus
citations. They retain `unverified` status, `reference-excerpt` as their origin,
an explicit notice, and links to the exact external pages. They do not create
source/passages/approval/evaluation records or fabricate citation UUIDs. Saved
answers and message history retain the quoted text and source links. Full-book
reuse clearance and scientific review remain separate requirements.

## Private NVIDIA experiment

The **تجربة خاصة** tab at `/admin/scholarly` generates an unreviewed draft through `POST /api/mateen/admin/scholarly/preview`. It requires the same content-review permission and secured session as the other administrative operations; it does not grant access or disable MFA.

- This experiment does not require an indexed corpus or a passing scientific evaluation. Its fixed NVIDIA model is independent of the student assistant's configured model.
- The question is sent to NVIDIA; do not enter private student questions or personal information. Provider-side retention is governed by NVIDIA's own policies.
- Questions and draft answers are not stored in Mateen's database or audit details. Only the occurrence and model are audited. Leaving the tab, clearing the form or reloading removes the displayed draft.
- Inputs are bounded to 3–2000 characters; outputs are schema-checked and rendered as escaped plain text, not HTML or executable Markdown. Validation here is technical, not scientific.
- Five requests per minute per account are allowed, with a bounded provider timeout and explicit errors. Permission is rechecked after generation before releasing a result.
- Every result is marked **unreviewed**, without verified sources. This does not change source approvals, model configuration, corpus evaluation, student history, referrals or student readiness. Never treat a successful generation request as a scientific evaluation.

## Referral operation

- New assignment requires an approved teacher who is currently available. Qualification approval remains a prerequisite managed by the teacher-review workflow.
- A teacher becoming unavailable retains existing conversations but receives no new assignments.
- A waiting referral can be checked again by the student when a teacher becomes available.
- Teachers can reply, mark an inquiry answered, close it, or reopen it.
- Students can continue an existing consented inquiry. A new private assistant question does not silently expand a teacher's access to the student's history.
- Messages are text-only. Ownership is enforced on the server for lists, details, status changes and replies.

## Checks

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server run test:scholarly
```

These regression tests verify boundary validation, representative Arabic safety decisions, citation matching and privacy helpers without asserting that a real provider or production commentary corpus has been validated. Live evaluation is a separate administrative launch gate.