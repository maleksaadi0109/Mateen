# Scholarly assistant and referrals

## Launch boundaries

Question intake and private history work independently of generated answers. When scholarly answering is not ready, the assistant saves an abstention, not a religious answer. A student can review the referral preview and consent to sharing the selected question and study context. No teacher conversation can be started from a directory card or a direct referral request.

Generated answers remain disabled until all three gates pass:

1. At least one legally authorized, scientifically reviewed commentary version has been indexed.
2. A model provider is configured and usable.
3. The server's Arabic retrieval, exact-citation and abstention evaluation passes for the current model and corpus, together with the administrator's scientific sign-off.

The current workspace does **not** contain an approved commentary corpus or a configured model provider. Do not mark these as approved merely to make the readiness indicator turn green. Synthetic regression fixtures are test data, not authorized scholarly sources.

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

The adapter supports Replit-managed OpenAI settings (`AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY`) and a direct OpenAI key (`OPENAI_API_KEY`, with optional `OPENAI_BASE_URL`). Manage credentials only through Replit Secrets; never enter them into source records, prompts, admin notes or source code.

The managed setup was not available in this task environment, so no provider connection was fabricated. Once an actual connection is configured, use the server evaluation rather than assuming Arabic suitability.

Published answers are assembled only from verified exact quotations. The model's unrestricted explanatory prose is not published: a genuine citation alone cannot prove that every generated claim is supported. Fatwa requests and questions without sufficient evidence lead to abstention/referral.

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