# Master Project Specification — Mateen Platform

**File:** `master-project-spec.en.md`  
**Source:** English translation of `master-project-spec.md`  
**Decision approval date:** September 22, 2026  
**Status:** Approved specification for phased implementation; not a statement that these features already exist.  
**Product:** Mateen Platform — منصة مَتِين  
**Product language:** Arabic, with a right-to-left interface.

> This English document changes the language of the specification, not the language of the product. Arabic interface labels, scholarly text titles, brand assets, and the approved requirements remain unchanged.

## 0. How to Use This Document

This specification guides development of the complete platform, including its interfaces, backend, data, AI services, and operations. Development teams and coding agents must use it to avoid inventing product rules or changing approved decisions.

- Inspect the existing project before implementation. Reuse suitable work rather than rebuilding from scratch by default.
- Creating this document does not authorize implementing the application or automatically resuming earlier interface mockups.
- Distinguish demonstrations from production functionality. Do not present simulated AI results, messages, or approvals as real.
- Where older requirements conflict with this specification, the newer decisions here take precedence, particularly recitation scope, assessments, and privacy.
- The original landing-page specification governs its content and interactions; the design-system image governs visual identity. Do not copy wording from the inspirational reference website. Correct promises that exceed first-release capabilities.
- Do not add payments, video classes, or certificate issuance merely because they are common in other platforms.
- Items designated as launch conditions cannot be bypassed using demonstration data or silent assumptions.

### Local References

- Landing-page specification: `attached_assets/landing-page-updates_1790089998529.md`.
- Design-system image: `attached_assets/Design_System_1790090535602.png`.
- Official logo: `attached_assets/MateeeeeeeeenLOGO_1790090010886.png`.
- Existing frontend: `artifacts/mateen-platform`.
- Existing backend: `artifacts/api-server`.
- Any prototypes in `artifacts/mockup-sandbox` are not approved production portals.

---

## 1. Product Vision and Scope

Mateen is an interactive educational platform for memorizing, reciting, and understanding classical Islamic scholarly texts and didactic poems. It connects students with approved source texts, verified commentaries, and trustworthy human guidance.

### 1.1 In Scope

- Studying texts in Islamic creed, Hadith, Tajwid, and Qira’at.
- Word-level recitation and memorization assessment.
- Spaced review and analysis of progress and mistakes.
- Oral and written level assessments.
- A scholarly assistant restricted to approved sources.
- Direct questions and assistant referrals to approved teachers through text messages.
- Reviewing teachers’ qualifications and ijazat before allowing them to receive questions.

### 1.2 Mandatory Constraints

- The platform does not provide memorization of the Qur’an itself. The Tajwid and Qira’at track covers scholarly poems such as Tuhfat al-Atfal.
- Do not use images or icons depicting people, animals, or living creatures, including default human avatars or person-shaped icons.
- Do not promise automatic student certificates.
- Do not advertise diacritic or pronunciation correction as available in the first release.
- The assistant must not issue independent fatwas or be described as infallible.
- Do not display fabricated success figures, approvals, or statistics.

### 1.3 Outside the First Release

Assessment of diacritics, shaddah, sukun, elongation, or articulation points; audio/video calls; class and assignment management; conversation attachments; student certificate issuance; SMS and browser push notifications; and commerce or subscriptions not defined in this agreement.

---

## 2. Technology and Architecture

### 2.1 Approved Choices

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS, RTL, Mateen visual identity |
| Routing | Retain the existing Wouter setup while it meets requirements |
| Frontend server state | TanStack Query |
| Forms | React Hook Form + Zod |
| Global UI state | Context for themes and interface settings, not as a replacement for server-state management |
| Animation | Framer Motion, respecting reduced-motion preferences |
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL + Drizzle ORM with versioned migrations |
| Scholarly search | Lexical and semantic search; pgvector where supported |
| Files | Private object storage, not binary files inside PostgreSQL |
| Communication | REST + WebSocket |
| Heavy processing | Background jobs with retries and status tracking |
| Specialized processing | Python when genuinely needed, not a mandatory separate service from the outset |
| Service contracts | OpenAPI and shared/generated types |

### 2.2 Architectural Approach

Start with a modular monolith: identity, content, study, recitation, assessments, assistant, referrals, messaging, teacher approval, and administration. Do not begin with distributed microservices without a demonstrated need.

Separate audio processing and book indexing from ordinary requests when they require long-running work or specialized resources. Put speech and language-model services behind replaceable provider interfaces rather than scattering provider calls throughout the frontend.

### 2.3 Mandatory Implementation Principles

- Enforce permissions, ownership, and level progression on the server.
- Never expose service secrets or API keys to the browser.
- Store file paths and metadata in the database, not file bytes.
- Follow the existing project’s service and artifact routing conventions. Do not hardcode localhost in browser code.
- Mutations must return real data and visibly update the interface, including after reload.
- Use database transactions and idempotency keys for sensitive actions such as assessment submission and teacher approval.
- Provide explicit loading, empty, and error states. Never replace an error with demonstration success data.

---

## 3. Visual Identity and User Experience

### 3.1 Visual Identity

| Role | Approved Value |
|---|---|
| Primary color | `#6D4C3D` |
| Secondary color | `#994703` |
| Tertiary color | `#4E3A00` |
| Neutral | `#FDF9F3` |
| Headlines | Kufam |
| Body text | Noto Naskh Arabic |
| Labels and UI | Cairo |

- Light theme: “Natural Parchment” — القرطاس الطبيعي.
- Dark theme: “Night Manuscripts” — المخطوطات الليلية.
- Use the official logo rather than an improvised text substitute when the asset is available.
- The reference website and video inspire composition and motion, not copied content.
- Do not use emojis.

### 3.2 Accessibility and Responsiveness

- Support mobile, tablet, and desktop layouts.
- Implement genuine RTL behavior, including correct treatment of numbers, citations, and mixed-direction text.
- Target WCAG 2.2 AA and verify it before claiming compliance.
- Support keyboard navigation, visible focus, meaningful control names, and dialog focus management.
- Do not communicate success or errors through color alone.
- Persist theme preference and respect reduced motion.
- Confirm destructive actions. Explain why an action is unavailable rather than showing an unexplained disabled button.

---

## 4. Roles and Accounts

### 4.1 Approved Roles

| Role | Access Boundary |
|---|---|
| Guest | Public pages and the informational landing assistant |
| Student | Their own learning data, assessments, conversations, and the public scholar directory |
| Teacher pending review | Their account, application, and documents; cannot receive student questions |
| Approved teacher | Their scholarly profile, conversations, referrals, and availability |
| Scholarly content moderator | Content, sources, and scientific review explicitly assigned to them |
| Administrator | Platform administration through explicit, audited permissions |

A content moderator does not automatically receive access to private teacher documents. A teacher cannot view another teacher’s conversations or all students’ data.

### 4.2 Identity and Authentication

- Use a reliable managed identity provider; do not build password storage from scratch.
- Require verified email and secure account recovery.
- Support passkeys where the selected provider permits.
- Require two-factor authentication for administrators and teachers; make it optional for students.
- Provide session/device visibility and session revocation.
- Rate-limit authentication attempts and protect against abuse.
- Check account status on the server for every sensitive operation.
- Selecting the actual identity provider and verifying its capabilities is an implementation prerequisite. Do not advertise features that the integration does not support.

### 4.3 Teacher Approval

Account creation → email verification and account security → profile and document submission → administrative review → approval, request for additional information, or rejection with a reason.

Uploading a document does not approve it. Teachers cannot assign their own verification badge. Newly updated documents remain under review until accepted.

---

## 5. Public Interfaces

### 5.1 Landing Page

Retain the content and interactions from the local landing specification, correcting any promises that conflict with first-release capabilities:

- Sticky header, logo, theme switching, and unified login.
- Links to About, Smart Simulator, Features, Tracks, Methodology, and FAQ.
- No level-assessment button in the navigation bar.
- Student and teacher registration buttons open the correct account context.
- The simulator is for scholarly texts and must not include Surah Al-Fatiha.
- Clearly label a demonstrative simulator as such. Do not present fake recording controls as a real service.
- Include platform features, the Hadith with its source and copy/share controls, tracks, methodology, FAQ, and student CTA.
- No certificate promises in track cards.
- Old wording about free or paid services does not create unapproved payment requirements.

### 5.2 About Page

Route `/about`; display “قريباً” (“Coming soon”) and a home-return button according to the current specification until additional content is approved.

### 5.3 Account Modal

A unified modal with student and teacher tabs and login/register modes. Successful authentication must reflect the real account and role, not merely close the modal.

### 5.4 Informational Assistant

Answer platform-information questions only, using the approved landing-page responses. For personalized questions, invite the visitor to sign in and provide a login action. This is not a general scholarly assistant for anonymous visitors.

---

## 6. Student Portal

The following routes are implementation guidance. They may be adapted to the existing routing structure without changing their functions.

| Page | Suggested Route | Purpose |
|---|---|---|
| Home | `/student` | Welcome, resume study, performance overview |
| Tracks | `/student/tracks` | Available learning tracks |
| Track details | `/student/tracks/:trackId` | Levels and their states |
| Study | `/student/study/:textId` | Source text, recitation, and commentary |
| Reviews | `/student/reviews` | Due and spaced reviews |
| Assessments | `/student/exams` | Eligibility, attempts, and results |
| Assessment attempt | `/student/exams/:attemptId` | Both sections, timing, and resumption |
| Scholars | `/student/scholars` | Specialties and availability |
| Scholar profile | `/student/scholars/:teacherId` | Public scholarly information and ijazat |
| Messages | `/student/messages` | Direct questions and referrals |
| Settings | `/student/settings` | Account, privacy, and notifications |

### 6.1 Home

Show a personal welcome, the last studied text and saved position, a resume action, memorization progress, recitation results, recurring word mistakes, due reviews, and the next assessment. Provide an honest new-student state rather than fabricated progress.

### 6.2 Initial Tracks and Content

| Track | Level | Text |
|---|---|---|
| Creed — العقيدة | Preparatory — التمهيدي | Nawaqid al-Islam — نواقض الإسلام |
| Creed — العقيدة | Level One — الأول | Al-Qawa‘id al-Arba‘ — القواعد الأربع |
| Hadith — الحديث | Preparatory — التمهيدي | The Forty Nawawi Hadith — الأربعون النووية |
| Tajwid and Qira’at — التجويد والقراءات | Preparatory — التمهيدي | Tuhfat al-Atfal — تحفة الأطفال |

- This is the only initially available catalog.
- Do not present additional levels or texts as published.
- Level states: available, locked, in progress, passed.
- The preparatory level is initially accessible. A subsequent level requires passing its predecessor.
- Students may directly attempt the assessment for an accessible level without completing its study. This does not provide access to the assessment of a later locked level.
- When no subsequent published level exists, show completion of the available content rather than inventing another level.

### 6.3 Study and Review

- Display the approved, vocalized source text and save the study position.
- Support word-level recitation comparison.
- Provide access to commentary, the scholarly assistant, and referrals.
- Save memorization mistakes and progress without requiring permanent audio storage.
- Schedule spaced reviews using actual performance; show and update review dates.
- Document and test the scheduling algorithm during implementation. Do not claim scientific diagnosis that the system does not provide.

### 6.4 Scholars and Messages

- Filter scholars by specialty and availability.
- Show scholarly information, approved ijazat, and authorized redacted public document copies.
- Start a question with an approved, available teacher. Recheck availability when sending, not only when displaying the card.
- Text-only conversations: no files, images, recordings, or video.
- Referrals include the studied text, student question, and why the assistant could not answer.
- Display a message after server confirmation. Provide explicit failure and retry handling without duplicates.

---

## 7. Audio Recitation and Feedback

### 7.1 What Is Assessed

Word correctness and sequence, substitutions, and omissions/skipped words. Diacritics and pronunciation quality are outside the first release.

Silence alone is not an omission. Confirm a skipped word when the student proceeds beyond it. Unclear audio must not become a confirmed memorization error.

### 7.2 Processing Flow

1. Select the approved text and passage.
2. Obtain microphone permission and check service connectivity.
3. Send numbered audio chunks.
4. Transcribe audio and align it against the reference text through an independent matching service.
5. Show provisional results, then confirm findings once stable.
6. Save performance summaries and progress; clean up audio according to retention policy.

### 7.3 Feedback

- Practice: immediately highlight an error once confirmed, with information beyond color alone.
- Allow uninterrupted continuation rather than mandatory stopping, then show a session summary.
- Provisional results may change and must not immediately become grades or permanent mistakes.
- Assessment: show recording and connectivity status without revealing answers or coaching corrections during the attempt.
- Failure: request repetition or show service unavailability. Never invent success or failure.

### 7.4 Speech Provider Selection

The initial evaluation candidate is OpenAI, based on documentation reviewed during the agreement:

- `gpt-live-transcribe` for live audio.
- `gpt-transcribe` for completed recordings.
- Comparison candidate: an ElevenLabs Scribe version supporting the required Arabic workflow at implementation time.

This is an initial evaluation choice, not proof of superior Arabic accuracy. Revalidate model names, availability, regions, and terms during implementation.

According to the reviewed documentation, the named live model does not provide word-level timestamps or confidence scores. Do not fabricate them. Implement word alignment within the platform and select an alternative if the results do not meet recitation requirements.

### 7.5 Speech Launch Condition

Compare providers using recordings authorized for this purpose. Include target vocabulary, varied speakers, background noise, pauses, and deliberate substitutions and omissions. Measure:

- Transcript accuracy and true-error detection.
- False positives, especially correct recitation marked as wrong.
- The model’s tendency to silently repair incorrect words.
- Feedback latency and transcript stability.
- Cost, availability, and retention terms.

Do not supply the full assessment answer as a transcription hint in a way that encourages the model to complete words the student did not say. Finalize the provider using documented measurements rather than marketing claims.

---

## 8. Assessments and Progression Rules

### 8.1 Approved Settings

| Setting | Value |
|---|---|
| Total questions | 30 |
| Written | 15 |
| Oral | 15 |
| Total duration | 30 minutes of active time |
| Question weight | 1 mark |
| Total marks | 30 |
| Passing score | At least 25/30 |
| Separate minimum per section | None |
| Retry after failure | 24 hours after the failed attempt ends |
| Studying the level first | Not required |
| Progression | Complete both sections and achieve the passing total |

“Passing both sections” means taking both components and achieving the approved overall total, not imposing unapproved separate section thresholds. Unanswered questions at time expiry score zero; not every response needs to be correct.

### 8.2 Question Construction

- Randomly select completion passages from a published, approved version of the current level’s texts.
- Oral: the student hears or sees an approved starting passage and recites the required continuation without seeing the answer.
- Written: the student completes text without needing diacritics.
- Freeze the question set, order, source version, and grading rules when the attempt is created.
- Do not rerandomize after reconnection or page reload.
- Validate the question pool even for short texts. Do not invent material to reach the required number.
- Keep answer keys on the server; do not send them to the browser during an attempt.

### 8.3 Grading

- Award one mark for an answer matching the required passage and zero otherwise. No fractional marks or negative marking without an approved policy change.
- Ignore diacritics, tatweel, and nonsemantic whitespace/punctuation differences in written responses.
- Do not accept a synonym in place of a memorized word; this is a textual memorization assessment.
- Do not erase meaningful letter differences through broad, unreviewed normalization.
- Grade oral responses using finalized transcription. Unevaluable audio is a technical condition requiring repetition/review, not an automatic zero due to service failure.
- A language model must not be the sole authority for a grade.
- Reveal results and mistake review after submission, not beforehand.

### 8.4 Attempt States

`created → in_progress → paused_connection → in_progress → submitted → grading → passed | failed`

Use `technical_review` where an issue prevents fair grading. Do not automatically treat a technical problem as an academic failure that imposes the retry waiting period.

### 8.5 Timing, Disconnection, and Resumption

- The server is authoritative for elapsed time, remaining time, and the current question.
- Save confirmed answers, question position, and periodic time checkpoints.
- Use server-side heartbeats and disconnect detection. Do not trust a client-supplied pause action or time value.
- On confirmed disconnection, freeze the attempt at the last trusted checkpoint, disable answering, and hide question content while paused.
- Reconnect to the same attempt, questions, position, and saved remaining time; do not grant a new duration.
- Restore a local draft when possible, but do not count an answer until the server confirms it. Clearly communicate loss of unconfirmed data.
- Number and acknowledge audio chunks. Do not grade an incomplete recording as complete.
- Prevent conflicting simultaneous active sessions for the same attempt.
- Duplicate requests or reconnects must not duplicate answers, time deductions, or marks.
- Log repeated disconnects for review; do not automatically interpret them as cheating.
- The actual cause of an internet disconnection cannot be proven absolutely. This is a recovery mechanism, not comprehensive exam proctoring.
- Automatically submit saved answers when 30 active minutes have elapsed.

### 8.6 Retry and Progression

- Calculate `retryAvailableAt` on the server as 24 hours after the failed attempt ends.
- Show the student the availability time and remaining wait.
- Do not create another attempt when a resumable attempt exists for that level.
- Record success and unlock the next level consistently in the database, safely handling repeated requests.
- Later policy edits must not silently alter ongoing attempts or historical results.

---

## 9. Scholarly Assistant and Sources

### 9.1 Knowledge Preparation

Use legally authorized sources with book, author, edition, volume, and page metadata. Review extracted text before indexing. Distinguish PDF file-page numbers from printed page numbers.

Associate every passage with a source version and approval status. Draft or withdrawn sources must not support new answers.

### 9.2 Answering Flow

1. Identify the question’s scope, studied text, and context.
2. Perform lexical and semantic search over approved sources only.
3. Retrieve sufficient passages linked to references.
4. Produce a bounded explanation or a clearly identified quotation grounded in those passages.
5. Verify that every citation exists and corresponds to its source text.
6. Answer, or abstain and offer a referral.

Do not claim that RAG eliminates hallucinations. Evaluate Arabic quality, source adherence, and abstention. Pin the chosen model version in configuration and update it only after evaluation.

### 9.3 Referrals

- Refer when sources do not cover the question, evidence is insufficient, or human guidance is needed.
- Show the student the context that will be shared with the teacher.
- Transfer the studied text, question, and referral reason without unnecessary private information.
- Select an approved, available teacher or show an honest waiting state; never invent availability.
- Students can ask teachers directly without first using the assistant.
- Treat source text and messages as untrusted data rather than system instructions to resist prompt injection.

---

## 10. Teacher Portal

| Page | Functions |
|---|---|
| Home | Pending questions, referrals, recent conversations, response activity |
| Questions and messages | Direct/referral filters, response status, question context, text replies |
| Scholarly profile | Biography, specialties, teachers, ijazat, and review status |
| Settings | Account and notifications |

### 10.1 Availability

- Provide a clear “Available for questions / Unavailable” control.
- Unavailable teachers do not receive new questions or referrals.
- They retain existing conversations and can reply.
- Follow-up in an existing conversation remains possible; do not open a new case inside it to bypass availability.
- Administrative suspension or approval withdrawal is distinct from voluntary unavailability and restricts permissions according to the administrative decision.

### 10.2 Questions

Use states such as Awaiting Reply and Answered. Changing a state does not delete conversation history. Search and filters must not reveal unauthorized conversations.

### 10.3 Boundaries

Teachers provide guidance and answers in this release. Do not add video-class dashboards, assignment management, certificate issuance, or permission to change student grades merely because the account is a teacher.

---

## 11. Administration Portal

### 11.1 Home

Show platform activity, learning metrics, review queues, delayed referrals, and significant service issues. Calculate statistics from real data.

### 11.2 Users

Search and filter by role and account status, display authorized details, and change status/permissions through explicit, audited actions.

### 11.3 Teacher Approval

Review profiles and original documents under restricted permissions, then approve, request more information, or reject with a reason. Record reviewer, time, and changes without placing sensitive document contents in general logs.

### 11.4 Tracks and Content

Support drafting, editing, review, publishing, and archiving of tracks, levels, texts, and ordering. Do not delete a version used by a historical assessment in a way that breaks result references.

### 11.5 Assessments

Manage passage-selection rules, policies, results, and technical reviews. Section 8 contains the binding defaults; coding agents must not arbitrarily change them.

### 11.6 Sources and Assistant

Approve and index commentaries, investigate answer/citation/referral issues, and withdraw defective sources from new answers.

### 11.7 Reports and Audit

Manage reports, record sensitive administrative actions, confirm destructive operations, and retain the reason, actor, and date.

---

## 12. Logical Data Model

These are functional entities, not mandatory literal table names.

| Domain | Entities and Relationships |
|---|---|
| Identity | User, roles/permissions, account status, identity-provider ID, preferences |
| Teacher | Scholarly profile, specialties, availability, approval application, documents, review decisions, redacted public copies |
| Content | Track → ordered levels → texts → approved versions → passages |
| Study | Track enrollment, progress, saved position, recitation session, word mistakes, scheduled review |
| Assessment | Versioned policy, attempt, frozen questions, answers, temporary recordings, time checkpoints, result |
| Knowledge | Book/edition, cited passages, approval status, semantic index |
| Assistant | Question, answer, citations, abstention decision, referral |
| Messaging | Conversation, authorized participants, direct/referral type, messages, question status |
| Operations | Notification, preferences, report, audit record, background job, deletion/export request |

### Data Invariants

- Progress and assessment passages reference a specific text version.
- Results retain the grading policy used.
- Clients cannot assign ownership, roles, grades, or approval status.
- Account deletion handles related records, files, and backups according to the published policy.
- Store timestamps consistently on the server and display them in the relevant time zone.
- Give messages, answers, and administrative operations identifiers that prevent duplicate processing.

---

## 13. Service Contracts and Events

Define contracts in OpenAPI before wiring the interface. Validate inputs and regenerate types after contract changes.

### 13.1 REST Domains

- Current account, preferences, and authorized sessions.
- Published tracks, levels, and source texts.
- Study progress, reviews, and recitation sessions.
- Assessment eligibility, attempt creation/resumption/saving/submission, and results.
- Public scholars and redacted profiles.
- Conversations, messages, and referrals.
- Teacher profile, documents, and availability.
- User, approval, content, source, policy, and report administration.
- Notifications and export/deletion requests.

### 13.2 Realtime Events

Semantic examples: session started, audio chunk, receipt acknowledgement, provisional/final transcript, confirmed word mistake, service status, assessment checkpoint, disconnect/resume, new message, and question-status update.

Authenticate every connection and verify session ownership. Number chunks, resist duplicates, and handle reconnection. Define audio/message size limits and timeouts during implementation.

### 13.3 Explicit Errors

Distinguish unauthenticated access, forbidden access, missing resources, attempt-state conflicts, expired time, retry cooldown, provider failure, and invalid inputs. Do not expose stack traces or secrets to users.

---

## 14. Privacy and Retention

### 14.1 Principles

Collect only necessary data, obtain clear microphone consent, explain processing purposes, and require separate consent for using data to improve models.

### 14.2 Approved Policy

| Data | Policy |
|---|---|
| Practice audio | Temporary processing; delete after processing by default, retaining performance results |
| Assessment audio | Retain for 30 days for review and appeals, then automatically delete |
| Original teacher documents | Private storage accessible only to authorized qualification reviewers |
| Public ijazat | Teacher-authorized redacted copies with sensitive information hidden |
| Backups | Daily, retained for 30 days, with restoration testing |
| Account export/deletion | Identity-verified request, tracked execution, and user notification |

- Explain assessment-audio retention before the attempt begins.
- Do not copy temporary audio into backups that silently extend retention.
- Explain how long deleted data may remain in backups. Reapply deletion records after restoration.
- Do not claim provider-side deletion beyond the provider’s actual capabilities and terms. Review audio/model provider retention and processing regions before launch.
- Specify remaining retention periods for messages, rejected teacher applications, and audit records in the launch privacy policy. Do not invent indefinite retention.
- Encrypt transit and storage, use short-lived signed links for private files, and never store signed links as permanent database references.

### 14.3 Legal Launch Condition

Determine operating jurisdiction, intended age groups, legal basis, required consent, and cross-border transfers. This document is not a legal compliance certification. Do not assume minors may register without guardian consent in every jurisdiction.

---

## 15. Security and Notifications

### 15.1 Security

- Check permissions for every request and event subscription.
- Prevent access to another user’s attempts, conversations, or documents by changing IDs.
- Validate uploaded files, types, and sizes and scan them before making them available to reviewers.
- Protect sessions; handle CSRF when using cookies, XSS, SQL injection, and request-rate abuse.
- Separate document-review permissions from content-management permissions.
- Do not place audio, documents, or private message contents in general operational logs.
- Audit administrative actions and protect records from ordinary modification.
- Treat prompts and sources as untrusted inputs; never execute instructions extracted from them.

### 15.2 Notifications

- In-app: replies, referrals, results, reviews, and approval states.
- Email: important and security-related events.
- User controls for learning and message notifications.
- Do not include private questions or document contents in email.
- No SMS or browser push in the first release.
- Send through background jobs with safe retries and deduplication.

---

## 16. Operations and Quality

- Monitor backend/provider errors, latency, and failed jobs.
- Separate development and production environments and data.
- Use reviewable database migrations and backups before sensitive changes.
- Automate expired-file cleanup and verify actual deletion.
- Monitor speech/model costs and usage limits without silent overruns.
- On provider failure, explain the issue and protect progress; do not substitute fabricated success.
- Provider failover during a session must preserve chunks and avoid duplicate results and must be tested before activation.
- Document required configuration without committing secrets.

---

## 17. Acceptance Criteria

### Accounts and Permissions

- Registration tabs select the intended role; new teachers cannot receive questions before approval.
- Students cannot access another student’s data; teachers cannot access unrelated conversations.
- Content moderators cannot read original ijazat without explicit authorization.
- Teachers and administrators must complete two-factor authentication before using privileged functions.

### Study and Tracks

- Display only the three tracks and four texts in the approved catalog.
- Restore the student’s study position after login/reload.
- Study completion alone does not unlock the next level.
- An accessible level’s assessment can be attempted without prior study.

### Recitation

- Technical evaluation distinguishes correct words, substitutions, and omissions.
- Pauses do not automatically become omissions.
- Practice displays stable errors immediately without forcing a stop.
- Do not reveal assessment answers during an attempt.
- Do not grade diacritic errors in the first release.

### Assessments

- Every attempt has 15 written and 15 oral questions.
- Total active time is 30 minutes and total marks are 30.
- 24/30 fails; 25/30 passes. There is no hidden separate section threshold.
- Correct written answers without diacritics are accepted.
- Block retry before 24 hours and allow it afterward.
- Reconnection restores questions, current position, and saved time without rerandomization.
- Reloading or changing device time does not grant additional time.
- Duplicate submission does not duplicate results or level unlocking.
- Time expiry submits saved answers and scores unanswered questions as zero.
- Audio service failure does not automatically fail the student without technical handling.

### Scholars and Messaging

- Unavailable teachers receive no new questions but retain existing conversations.
- Public profiles do not expose sensitive original documents.
- Sent text persists after server confirmation and reload.
- No attachments or calls are available.
- Referrals share their context and reason only with authorized participants.

### Assistant and Administration

- Citations refer to existing approved passages and sources.
- Questions lacking evidence result in abstention/referral, not fabricated references.
- Requests for additional qualification information are visible to the teacher; approval/rejection updates account status.
- Assessment-policy edits do not silently regrade historical attempts.
- Editing published content does not break historical assessment references.

### Privacy and Accessibility

- Practice and assessment audio cleanup follows policy.
- Public document copies are redacted and authorized.
- Export, deletion, and identity verification work.
- Verify keyboard navigation, mobile layouts, and dark mode.
- No living-creature icons or automatic-certificate promises appear.

---

## 18. Implementation Phases When Build Work Is Requested

1. **Audit the existing project:** distinguish actual and demonstrative functionality; align landing-page claims with capabilities.
2. **Foundation:** identity, permissions, database, approved content, and private storage.
3. **Early speech feasibility evaluation:** compare providers on the target texts before tying academic outcomes to them.
4. **Student portal:** study, progress, reviews, and scholar directory.
5. **Teacher and administration portals:** approval, availability, questions, messaging, and content management.
6. **Scholarly assistant:** prepare sources, retrieval, citations, abstention, and referrals.
7. **Assessments:** passage generation, grading, timing, resumption, and progression.
8. **Launch readiness:** privacy, deletion, backups, security, accessibility, and acceptance testing.

Independent work may proceed in parallel. Do not launch automatically graded oral assessments before validating the speech service, or a scholarly assistant before approving its sources.

---

## 19. Launch Decisions That Must Not Be Falsely Marked Complete

The product and its primary rules are approved. The following are implementation verification requirements, not permission to change scope:

- Demonstrate the chosen model’s availability and suitability for Arabic and the target texts, and pin its operational version.
- Select the identity provider and verify required security capabilities.
- Obtain approved, authorized versions of texts, commentaries, and recordings.
- Review privacy law, processing jurisdiction, and age groups.
- Calibrate speech quality and document acceptance standards with scholarly reviewers.
- Define remaining retention periods before launch.

Do not repeatedly ask the project owner about values already approved here. Ask only about a consequential new decision outside the delegated scope or a conflict that changes the outcome.

---

## 20. External Service References

These references were reviewed during the agreement. Services change, so verify them again before implementation:

- OpenAI transcription: https://developers.openai.com/api/docs/guides/transcription
- OpenAI realtime transcription: https://developers.openai.com/api/docs/guides/realtime-transcription
- ElevenLabs speech to text: https://elevenlabs.io/docs/overview/capabilities/speech-to-text

**End of specification — the approved requirements translated into English, not automatic authorization to begin implementation.**# Master Project Specification — Mateen Platform

**File:** `master-project-spec.en.md`  
**Source:** English translation of `master-project-spec.md`  
**Decision approval date:** September 22, 2026  
**Status:** Approved specification for phased implementation; not a statement that these features already exist.  
**Product:** Mateen Platform — منصة مَتِين  
**Product language:** Arabic, with a right-to-left interface.

> This English document changes the language of the specification, not the language of the product. Arabic interface labels, scholarly text titles, brand assets, and the approved requirements remain unchanged.

## 0. How to Use This Document

This specification guides development of the complete platform, including its interfaces, backend, data, AI services, and operations. Development teams and coding agents must use it to avoid inventing product rules or changing approved decisions.

- Inspect the existing project before implementation. Reuse suitable work rather than rebuilding from scratch by default.
- Creating this document does not authorize implementing the application or automatically resuming earlier interface mockups.
- Distinguish demonstrations from production functionality. Do not present simulated AI results, messages, or approvals as real.
- Where older requirements conflict with this specification, the newer decisions here take precedence, particularly recitation scope, assessments, and privacy.
- The original landing-page specification governs its content and interactions; the design-system image governs visual identity. Do not copy wording from the inspirational reference website. Correct promises that exceed first-release capabilities.
- Do not add payments, video classes, or certificate issuance merely because they are common in other platforms.
- Items designated as launch conditions cannot be bypassed using demonstration data or silent assumptions.

### Local References

- Landing-page specification: `attached_assets/landing-page-updates_1790089998529.md`.
- Design-system image: `attached_assets/Design_System_1790090535602.png`.
- Official logo: `attached_assets/MateeeeeeeeenLOGO_1790090010886.png`.
- Existing frontend: `artifacts/mateen-platform`.
- Existing backend: `artifacts/api-server`.
- Any prototypes in `artifacts/mockup-sandbox` are not approved production portals.

---

## 1. Product Vision and Scope

Mateen is an interactive educational platform for memorizing, reciting, and understanding classical Islamic scholarly texts and didactic poems. It connects students with approved source texts, verified commentaries, and trustworthy human guidance.

### 1.1 In Scope

- Studying texts in Islamic creed, Hadith, Tajwid, and Qira’at.
- Word-level recitation and memorization assessment.
- Spaced review and analysis of progress and mistakes.
- Oral and written level assessments.
- A scholarly assistant restricted to approved sources.
- Direct questions and assistant referrals to approved teachers through text messages.
- Reviewing teachers’ qualifications and ijazat before allowing them to receive questions.

### 1.2 Mandatory Constraints

- The platform does not provide memorization of the Qur’an itself. The Tajwid and Qira’at track covers scholarly poems such as Tuhfat al-Atfal.
- Do not use images or icons depicting people, animals, or living creatures, including default human avatars or person-shaped icons.
- Do not promise automatic student certificates.
- Do not advertise diacritic or pronunciation correction as available in the first release.
- The assistant must not issue independent fatwas or be described as infallible.
- Do not display fabricated success figures, approvals, or statistics.

### 1.3 Outside the First Release

Assessment of diacritics, shaddah, sukun, elongation, or articulation points; audio/video calls; class and assignment management; conversation attachments; student certificate issuance; SMS and browser push notifications; and commerce or subscriptions not defined in this agreement.

---

## 2. Technology and Architecture

### 2.1 Approved Choices

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS, RTL, Mateen visual identity |
| Routing | Retain the existing Wouter setup while it meets requirements |
| Frontend server state | TanStack Query |
| Forms | React Hook Form + Zod |
| Global UI state | Context for themes and interface settings, not as a replacement for server-state management |
| Animation | Framer Motion, respecting reduced-motion preferences |
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL + Drizzle ORM with versioned migrations |
| Scholarly search | Lexical and semantic search; pgvector where supported |
| Files | Private object storage, not binary files inside PostgreSQL |
| Communication | REST + WebSocket |
| Heavy processing | Background jobs with retries and status tracking |
| Specialized processing | Python when genuinely needed, not a mandatory separate service from the outset |
| Service contracts | OpenAPI and shared/generated types |

### 2.2 Architectural Approach

Start with a modular monolith: identity, content, study, recitation, assessments, assistant, referrals, messaging, teacher approval, and administration. Do not begin with distributed microservices without a demonstrated need.

Separate audio processing and book indexing from ordinary requests when they require long-running work or specialized resources. Put speech and language-model services behind replaceable provider interfaces rather than scattering provider calls throughout the frontend.

### 2.3 Mandatory Implementation Principles

- Enforce permissions, ownership, and level progression on the server.
- Never expose service secrets or API keys to the browser.
- Store file paths and metadata in the database, not file bytes.
- Follow the existing project’s service and artifact routing conventions. Do not hardcode localhost in browser code.
- Mutations must return real data and visibly update the interface, including after reload.
- Use database transactions and idempotency keys for sensitive actions such as assessment submission and teacher approval.
- Provide explicit loading, empty, and error states. Never replace an error with demonstration success data.

---

## 3. Visual Identity and User Experience

### 3.1 Visual Identity

| Role | Approved Value |
|---|---|
| Primary color | `#6D4C3D` |
| Secondary color | `#994703` |
| Tertiary color | `#4E3A00` |
| Neutral | `#FDF9F3` |
| Headlines | Kufam |
| Body text | Noto Naskh Arabic |
| Labels and UI | Cairo |

- Light theme: “Natural Parchment” — القرطاس الطبيعي.
- Dark theme: “Night Manuscripts” — المخطوطات الليلية.
- Use the official logo rather than an improvised text substitute when the asset is available.
- The reference website and video inspire composition and motion, not copied content.
- Do not use emojis.

### 3.2 Accessibility and Responsiveness

- Support mobile, tablet, and desktop layouts.
- Implement genuine RTL behavior, including correct treatment of numbers, citations, and mixed-direction text.
- Target WCAG 2.2 AA and verify it before claiming compliance.
- Support keyboard navigation, visible focus, meaningful control names, and dialog focus management.
- Do not communicate success or errors through color alone.
- Persist theme preference and respect reduced motion.
- Confirm destructive actions. Explain why an action is unavailable rather than showing an unexplained disabled button.

---

## 4. Roles and Accounts

### 4.1 Approved Roles

| Role | Access Boundary |
|---|---|
| Guest | Public pages and the informational landing assistant |
| Student | Their own learning data, assessments, conversations, and the public scholar directory |
| Teacher pending review | Their account, application, and documents; cannot receive student questions |
| Approved teacher | Their scholarly profile, conversations, referrals, and availability |
| Scholarly content moderator | Content, sources, and scientific review explicitly assigned to them |
| Administrator | Platform administration through explicit, audited permissions |

A content moderator does not automatically receive access to private teacher documents. A teacher cannot view another teacher’s conversations or all students’ data.

### 4.2 Identity and Authentication

- Use a reliable managed identity provider; do not build password storage from scratch.
- Require verified email and secure account recovery.
- Support passkeys where the selected provider permits.
- Require two-factor authentication for administrators and teachers; make it optional for students.
- Provide session/device visibility and session revocation.
- Rate-limit authentication attempts and protect against abuse.
- Check account status on the server for every sensitive operation.
- Selecting the actual identity provider and verifying its capabilities is an implementation prerequisite. Do not advertise features that the integration does not support.

### 4.3 Teacher Approval

Account creation → email verification and account security → profile and document submission → administrative review → approval, request for additional information, or rejection with a reason.

Uploading a document does not approve it. Teachers cannot assign their own verification badge. Newly updated documents remain under review until accepted.

---

## 5. Public Interfaces

### 5.1 Landing Page

Retain the content and interactions from the local landing specification, correcting any promises that conflict with first-release capabilities:

- Sticky header, logo, theme switching, and unified login.
- Links to About, Smart Simulator, Features, Tracks, Methodology, and FAQ.
- No level-assessment button in the navigation bar.
- Student and teacher registration buttons open the correct account context.
- The simulator is for scholarly texts and must not include Surah Al-Fatiha.
- Clearly label a demonstrative simulator as such. Do not present fake recording controls as a real service.
- Include platform features, the Hadith with its source and copy/share controls, tracks, methodology, FAQ, and student CTA.
- No certificate promises in track cards.
- Old wording about free or paid services does not create unapproved payment requirements.

### 5.2 About Page

Route `/about`; display “قريباً” (“Coming soon”) and a home-return button according to the current specification until additional content is approved.

### 5.3 Account Modal

A unified modal with student and teacher tabs and login/register modes. Successful authentication must reflect the real account and role, not merely close the modal.

### 5.4 Informational Assistant

Answer platform-information questions only, using the approved landing-page responses. For personalized questions, invite the visitor to sign in and provide a login action. This is not a general scholarly assistant for anonymous visitors.

---

## 6. Student Portal

The following routes are implementation guidance. They may be adapted to the existing routing structure without changing their functions.

| Page | Suggested Route | Purpose |
|---|---|---|
| Home | `/student` | Welcome, resume study, performance overview |
| Tracks | `/student/tracks` | Available learning tracks |
| Track details | `/student/tracks/:trackId` | Levels and their states |
| Study | `/student/study/:textId` | Source text, recitation, and commentary |
| Reviews | `/student/reviews` | Due and spaced reviews |
| Assessments | `/student/exams` | Eligibility, attempts, and results |
| Assessment attempt | `/student/exams/:attemptId` | Both sections, timing, and resumption |
| Scholars | `/student/scholars` | Specialties and availability |
| Scholar profile | `/student/scholars/:teacherId` | Public scholarly information and ijazat |
| Messages | `/student/messages` | Direct questions and referrals |
| Settings | `/student/settings` | Account, privacy, and notifications |

### 6.1 Home

Show a personal welcome, the last studied text and saved position, a resume action, memorization progress, recitation results, recurring word mistakes, due reviews, and the next assessment. Provide an honest new-student state rather than fabricated progress.

### 6.2 Initial Tracks and Content

| Track | Level | Text |
|---|---|---|
| Creed — العقيدة | Preparatory — التمهيدي | Nawaqid al-Islam — نواقض الإسلام |
| Creed — العقيدة | Level One — الأول | Al-Qawa‘id al-Arba‘ — القواعد الأربع |
| Hadith — الحديث | Preparatory — التمهيدي | The Forty Nawawi Hadith — الأربعون النووية |
| Tajwid and Qira’at — التجويد والقراءات | Preparatory — التمهيدي | Tuhfat al-Atfal — تحفة الأطفال |

- This is the only initially available catalog.
- Do not present additional levels or texts as published.
- Level states: available, locked, in progress, passed.
- The preparatory level is initially accessible. A subsequent level requires passing its predecessor.
- Students may directly attempt the assessment for an accessible level without completing its study. This does not provide access to the assessment of a later locked level.
- When no subsequent published level exists, show completion of the available content rather than inventing another level.

### 6.3 Study and Review

- Display the approved, vocalized source text and save the study position.
- Support word-level recitation comparison.
- Provide access to commentary, the scholarly assistant, and referrals.
- Save memorization mistakes and progress without requiring permanent audio storage.
- Schedule spaced reviews using actual performance; show and update review dates.
- Document and test the scheduling algorithm during implementation. Do not claim scientific diagnosis that the system does not provide.

### 6.4 Scholars and Messages

- Filter scholars by specialty and availability.
- Show scholarly information, approved ijazat, and authorized redacted public document copies.
- Start a question with an approved, available teacher. Recheck availability when sending, not only when displaying the card.
- Text-only conversations: no files, images, recordings, or video.
- Referrals include the studied text, student question, and why the assistant could not answer.
- Display a message after server confirmation. Provide explicit failure and retry handling without duplicates.

---

## 7. Audio Recitation and Feedback

### 7.1 What Is Assessed

Word correctness and sequence, substitutions, and omissions/skipped words. Diacritics and pronunciation quality are outside the first release.

Silence alone is not an omission. Confirm a skipped word when the student proceeds beyond it. Unclear audio must not become a confirmed memorization error.

### 7.2 Processing Flow

1. Select the approved text and passage.
2. Obtain microphone permission and check service connectivity.
3. Send numbered audio chunks.
4. Transcribe audio and align it against the reference text through an independent matching service.
5. Show provisional results, then confirm findings once stable.
6. Save performance summaries and progress; clean up audio according to retention policy.

### 7.3 Feedback

- Practice: immediately highlight an error once confirmed, with information beyond color alone.
- Allow uninterrupted continuation rather than mandatory stopping, then show a session summary.
- Provisional results may change and must not immediately become grades or permanent mistakes.
- Assessment: show recording and connectivity status without revealing answers or coaching corrections during the attempt.
- Failure: request repetition or show service unavailability. Never invent success or failure.

### 7.4 Speech Provider Selection

The initial evaluation candidate is OpenAI, based on documentation reviewed during the agreement:

- `gpt-live-transcribe` for live audio.
- `gpt-transcribe` for completed recordings.
- Comparison candidate: an ElevenLabs Scribe version supporting the required Arabic workflow at implementation time.

This is an initial evaluation choice, not proof of superior Arabic accuracy. Revalidate model names, availability, regions, and terms during implementation.

According to the reviewed documentation, the named live model does not provide word-level timestamps or confidence scores. Do not fabricate them. Implement word alignment within the platform and select an alternative if the results do not meet recitation requirements.

### 7.5 Speech Launch Condition

Compare providers using recordings authorized for this purpose. Include target vocabulary, varied speakers, background noise, pauses, and deliberate substitutions and omissions. Measure:

- Transcript accuracy and true-error detection.
- False positives, especially correct recitation marked as wrong.
- The model’s tendency to silently repair incorrect words.
- Feedback latency and transcript stability.
- Cost, availability, and retention terms.

Do not supply the full assessment answer as a transcription hint in a way that encourages the model to complete words the student did not say. Finalize the provider using documented measurements rather than marketing claims.

---

## 8. Assessments and Progression Rules

### 8.1 Approved Settings

| Setting | Value |
|---|---|
| Total questions | 30 |
| Written | 15 |
| Oral | 15 |
| Total duration | 30 minutes of active time |
| Question weight | 1 mark |
| Total marks | 30 |
| Passing score | At least 25/30 |
| Separate minimum per section | None |
| Retry after failure | 24 hours after the failed attempt ends |
| Studying the level first | Not required |
| Progression | Complete both sections and achieve the passing total |

“Passing both sections” means taking both components and achieving the approved overall total, not imposing unapproved separate section thresholds. Unanswered questions at time expiry score zero; not every response needs to be correct.

### 8.2 Question Construction

- Randomly select completion passages from a published, approved version of the current level’s texts.
- Oral: the student hears or sees an approved starting passage and recites the required continuation without seeing the answer.
- Written: the student completes text without needing diacritics.
- Freeze the question set, order, source version, and grading rules when the attempt is created.
- Do not rerandomize after reconnection or page reload.
- Validate the question pool even for short texts. Do not invent material to reach the required number.
- Keep answer keys on the server; do not send them to the browser during an attempt.

### 8.3 Grading

- Award one mark for an answer matching the required passage and zero otherwise. No fractional marks or negative marking without an approved policy change.
- Ignore diacritics, tatweel, and nonsemantic whitespace/punctuation differences in written responses.
- Do not accept a synonym in place of a memorized word; this is a textual memorization assessment.
- Do not erase meaningful letter differences through broad, unreviewed normalization.
- Grade oral responses using finalized transcription. Unevaluable audio is a technical condition requiring repetition/review, not an automatic zero due to service failure.
- A language model must not be the sole authority for a grade.
- Reveal results and mistake review after submission, not beforehand.

### 8.4 Attempt States

`created → in_progress → paused_connection → in_progress → submitted → grading → passed | failed`

Use `technical_review` where an issue prevents fair grading. Do not automatically treat a technical problem as an academic failure that imposes the retry waiting period.

### 8.5 Timing, Disconnection, and Resumption

- The server is authoritative for elapsed time, remaining time, and the current question.
- Save confirmed answers, question position, and periodic time checkpoints.
- Use server-side heartbeats and disconnect detection. Do not trust a client-supplied pause action or time value.
- On confirmed disconnection, freeze the attempt at the last trusted checkpoint, disable answering, and hide question content while paused.
- Reconnect to the same attempt, questions, position, and saved remaining time; do not grant a new duration.
- Restore a local draft when possible, but do not count an answer until the server confirms it. Clearly communicate loss of unconfirmed data.
- Number and acknowledge audio chunks. Do not grade an incomplete recording as complete.
- Prevent conflicting simultaneous active sessions for the same attempt.
- Duplicate requests or reconnects must not duplicate answers, time deductions, or marks.
- Log repeated disconnects for review; do not automatically interpret them as cheating.
- The actual cause of an internet disconnection cannot be proven absolutely. This is a recovery mechanism, not comprehensive exam proctoring.
- Automatically submit saved answers when 30 active minutes have elapsed.

### 8.6 Retry and Progression

- Calculate `retryAvailableAt` on the server as 24 hours after the failed attempt ends.
- Show the student the availability time and remaining wait.
- Do not create another attempt when a resumable attempt exists for that level.
- Record success and unlock the next level consistently in the database, safely handling repeated requests.
- Later policy edits must not silently alter ongoing attempts or historical results.

---

## 9. Scholarly Assistant and Sources

### 9.1 Knowledge Preparation

Use legally authorized sources with book, author, edition, volume, and page metadata. Review extracted text before indexing. Distinguish PDF file-page numbers from printed page numbers.

Associate every passage with a source version and approval status. Draft or withdrawn sources must not support new answers.

### 9.2 Answering Flow

1. Identify the question’s scope, studied text, and context.
2. Perform lexical and semantic search over approved sources only.
3. Retrieve sufficient passages linked to references.
4. Produce a bounded explanation or a clearly identified quotation grounded in those passages.
5. Verify that every citation exists and corresponds to its source text.
6. Answer, or abstain and offer a referral.

Do not claim that RAG eliminates hallucinations. Evaluate Arabic quality, source adherence, and abstention. Pin the chosen model version in configuration and update it only after evaluation.

### 9.3 Referrals

- Refer when sources do not cover the question, evidence is insufficient, or human guidance is needed.
- Show the student the context that will be shared with the teacher.
- Transfer the studied text, question, and referral reason without unnecessary private information.
- Select an approved, available teacher or show an honest waiting state; never invent availability.
- Students can ask teachers directly without first using the assistant.
- Treat source text and messages as untrusted data rather than system instructions to resist prompt injection.

---

## 10. Teacher Portal

| Page | Functions |
|---|---|
| Home | Pending questions, referrals, recent conversations, response activity |
| Questions and messages | Direct/referral filters, response status, question context, text replies |
| Scholarly profile | Biography, specialties, teachers, ijazat, and review status |
| Settings | Account and notifications |

### 10.1 Availability

- Provide a clear “Available for questions / Unavailable” control.
- Unavailable teachers do not receive new questions or referrals.
- They retain existing conversations and can reply.
- Follow-up in an existing conversation remains possible; do not open a new case inside it to bypass availability.
- Administrative suspension or approval withdrawal is distinct from voluntary unavailability and restricts permissions according to the administrative decision.

### 10.2 Questions

Use states such as Awaiting Reply and Answered. Changing a state does not delete conversation history. Search and filters must not reveal unauthorized conversations.

### 10.3 Boundaries

Teachers provide guidance and answers in this release. Do not add video-class dashboards, assignment management, certificate issuance, or permission to change student grades merely because the account is a teacher.

---

## 11. Administration Portal

### 11.1 Home

Show platform activity, learning metrics, review queues, delayed referrals, and significant service issues. Calculate statistics from real data.

### 11.2 Users

Search and filter by role and account status, display authorized details, and change status/permissions through explicit, audited actions.

### 11.3 Teacher Approval

Review profiles and original documents under restricted permissions, then approve, request more information, or reject with a reason. Record reviewer, time, and changes without placing sensitive document contents in general logs.

### 11.4 Tracks and Content

Support drafting, editing, review, publishing, and archiving of tracks, levels, texts, and ordering. Do not delete a version used by a historical assessment in a way that breaks result references.

### 11.5 Assessments

Manage passage-selection rules, policies, results, and technical reviews. Section 8 contains the binding defaults; coding agents must not arbitrarily change them.

### 11.6 Sources and Assistant

Approve and index commentaries, investigate answer/citation/referral issues, and withdraw defective sources from new answers.

### 11.7 Reports and Audit

Manage reports, record sensitive administrative actions, confirm destructive operations, and retain the reason, actor, and date.

---

## 12. Logical Data Model

These are functional entities, not mandatory literal table names.

| Domain | Entities and Relationships |
|---|---|
| Identity | User, roles/permissions, account status, identity-provider ID, preferences |
| Teacher | Scholarly profile, specialties, availability, approval application, documents, review decisions, redacted public copies |
| Content | Track → ordered levels → texts → approved versions → passages |
| Study | Track enrollment, progress, saved position, recitation session, word mistakes, scheduled review |
| Assessment | Versioned policy, attempt, frozen questions, answers, temporary recordings, time checkpoints, result |
| Knowledge | Book/edition, cited passages, approval status, semantic index |
| Assistant | Question, answer, citations, abstention decision, referral |
| Messaging | Conversation, authorized participants, direct/referral type, messages, question status |
| Operations | Notification, preferences, report, audit record, background job, deletion/export request |

### Data Invariants

- Progress and assessment passages reference a specific text version.
- Results retain the grading policy used.
- Clients cannot assign ownership, roles, grades, or approval status.
- Account deletion handles related records, files, and backups according to the published policy.
- Store timestamps consistently on the server and display them in the relevant time zone.
- Give messages, answers, and administrative operations identifiers that prevent duplicate processing.

---

## 13. Service Contracts and Events

Define contracts in OpenAPI before wiring the interface. Validate inputs and regenerate types after contract changes.

### 13.1 REST Domains

- Current account, preferences, and authorized sessions.
- Published tracks, levels, and source texts.
- Study progress, reviews, and recitation sessions.
- Assessment eligibility, attempt creation/resumption/saving/submission, and results.
- Public scholars and redacted profiles.
- Conversations, messages, and referrals.
- Teacher profile, documents, and availability.
- User, approval, content, source, policy, and report administration.
- Notifications and export/deletion requests.

### 13.2 Realtime Events

Semantic examples: session started, audio chunk, receipt acknowledgement, provisional/final transcript, confirmed word mistake, service status, assessment checkpoint, disconnect/resume, new message, and question-status update.

Authenticate every connection and verify session ownership. Number chunks, resist duplicates, and handle reconnection. Define audio/message size limits and timeouts during implementation.

### 13.3 Explicit Errors

Distinguish unauthenticated access, forbidden access, missing resources, attempt-state conflicts, expired time, retry cooldown, provider failure, and invalid inputs. Do not expose stack traces or secrets to users.

---

## 14. Privacy and Retention

### 14.1 Principles

Collect only necessary data, obtain clear microphone consent, explain processing purposes, and require separate consent for using data to improve models.

### 14.2 Approved Policy

| Data | Policy |
|---|---|
| Practice audio | Temporary processing; delete after processing by default, retaining performance results |
| Assessment audio | Retain for 30 days for review and appeals, then automatically delete |
| Original teacher documents | Private storage accessible only to authorized qualification reviewers |
| Public ijazat | Teacher-authorized redacted copies with sensitive information hidden |
| Backups | Daily, retained for 30 days, with restoration testing |
| Account export/deletion | Identity-verified request, tracked execution, and user notification |

- Explain assessment-audio retention before the attempt begins.
- Do not copy temporary audio into backups that silently extend retention.
- Explain how long deleted data may remain in backups. Reapply deletion records after restoration.
- Do not claim provider-side deletion beyond the provider’s actual capabilities and terms. Review audio/model provider retention and processing regions before launch.
- Specify remaining retention periods for messages, rejected teacher applications, and audit records in the launch privacy policy. Do not invent indefinite retention.
- Encrypt transit and storage, use short-lived signed links for private files, and never store signed links as permanent database references.

### 14.3 Legal Launch Condition

Determine operating jurisdiction, intended age groups, legal basis, required consent, and cross-border transfers. This document is not a legal compliance certification. Do not assume minors may register without guardian consent in every jurisdiction.

---

## 15. Security and Notifications

### 15.1 Security

- Check permissions for every request and event subscription.
- Prevent access to another user’s attempts, conversations, or documents by changing IDs.
- Validate uploaded files, types, and sizes and scan them before making them available to reviewers.
- Protect sessions; handle CSRF when using cookies, XSS, SQL injection, and request-rate abuse.
- Separate document-review permissions from content-management permissions.
- Do not place audio, documents, or private message contents in general operational logs.
- Audit administrative actions and protect records from ordinary modification.
- Treat prompts and sources as untrusted inputs; never execute instructions extracted from them.

### 15.2 Notifications

- In-app: replies, referrals, results, reviews, and approval states.
- Email: important and security-related events.
- User controls for learning and message notifications.
- Do not include private questions or document contents in email.
- No SMS or browser push in the first release.
- Send through background jobs with safe retries and deduplication.

---

## 16. Operations and Quality

- Monitor backend/provider errors, latency, and failed jobs.
- Separate development and production environments and data.
- Use reviewable database migrations and backups before sensitive changes.
- Automate expired-file cleanup and verify actual deletion.
- Monitor speech/model costs and usage limits without silent overruns.
- On provider failure, explain the issue and protect progress; do not substitute fabricated success.
- Provider failover during a session must preserve chunks and avoid duplicate results and must be tested before activation.
- Document required configuration without committing secrets.

---

## 17. Acceptance Criteria

### Accounts and Permissions

- Registration tabs select the intended role; new teachers cannot receive questions before approval.
- Students cannot access another student’s data; teachers cannot access unrelated conversations.
- Content moderators cannot read original ijazat without explicit authorization.
- Teachers and administrators must complete two-factor authentication before using privileged functions.

### Study and Tracks

- Display only the three tracks and four texts in the approved catalog.
- Restore the student’s study position after login/reload.
- Study completion alone does not unlock the next level.
- An accessible level’s assessment can be attempted without prior study.

### Recitation

- Technical evaluation distinguishes correct words, substitutions, and omissions.
- Pauses do not automatically become omissions.
- Practice displays stable errors immediately without forcing a stop.
- Do not reveal assessment answers during an attempt.
- Do not grade diacritic errors in the first release.

### Assessments

- Every attempt has 15 written and 15 oral questions.
- Total active time is 30 minutes and total marks are 30.
- 24/30 fails; 25/30 passes. There is no hidden separate section threshold.
- Correct written answers without diacritics are accepted.
- Block retry before 24 hours and allow it afterward.
- Reconnection restores questions, current position, and saved time without rerandomization.
- Reloading or changing device time does not grant additional time.
- Duplicate submission does not duplicate results or level unlocking.
- Time expiry submits saved answers and scores unanswered questions as zero.
- Audio service failure does not automatically fail the student without technical handling.

### Scholars and Messaging

- Unavailable teachers receive no new questions but retain existing conversations.
- Public profiles do not expose sensitive original documents.
- Sent text persists after server confirmation and reload.
- No attachments or calls are available.
- Referrals share their context and reason only with authorized participants.

### Assistant and Administration

- Citations refer to existing approved passages and sources.
- Questions lacking evidence result in abstention/referral, not fabricated references.
- Requests for additional qualification information are visible to the teacher; approval/rejection updates account status.
- Assessment-policy edits do not silently regrade historical attempts.
- Editing published content does not break historical assessment references.

### Privacy and Accessibility

- Practice and assessment audio cleanup follows policy.
- Public document copies are redacted and authorized.
- Export, deletion, and identity verification work.
- Verify keyboard navigation, mobile layouts, and dark mode.
- No living-creature icons or automatic-certificate promises appear.

---

## 18. Implementation Phases When Build Work Is Requested

1. **Audit the existing project:** distinguish actual and demonstrative functionality; align landing-page claims with capabilities.
2. **Foundation:** identity, permissions, database, approved content, and private storage.
3. **Early speech feasibility evaluation:** compare providers on the target texts before tying academic outcomes to them.
4. **Student portal:** study, progress, reviews, and scholar directory.
5. **Teacher and administration portals:** approval, availability, questions, messaging, and content management.
6. **Scholarly assistant:** prepare sources, retrieval, citations, abstention, and referrals.
7. **Assessments:** passage generation, grading, timing, resumption, and progression.
8. **Launch readiness:** privacy, deletion, backups, security, accessibility, and acceptance testing.

Independent work may proceed in parallel. Do not launch automatically graded oral assessments before validating the speech service, or a scholarly assistant before approving its sources.

---

## 19. Launch Decisions That Must Not Be Falsely Marked Complete

The product and its primary rules are approved. The following are implementation verification requirements, not permission to change scope:

- Demonstrate the chosen model’s availability and suitability for Arabic and the target texts, and pin its operational version.
- Select the identity provider and verify required security capabilities.
- Obtain approved, authorized versions of texts, commentaries, and recordings.
- Review privacy law, processing jurisdiction, and age groups.
- Calibrate speech quality and document acceptance standards with scholarly reviewers.
- Define remaining retention periods before launch.

Do not repeatedly ask the project owner about values already approved here. Ask only about a consequential new decision outside the delegated scope or a conflict that changes the outcome.

---

## 20. External Service References

These references were reviewed during the agreement. Services change, so verify them again before implementation:

- OpenAI transcription: https://developers.openai.com/api/docs/guides/transcription
- OpenAI realtime transcription: https://developers.openai.com/api/docs/guides/realtime-transcription
- ElevenLabs speech to text: https://elevenlabs.io/docs/overview/capabilities/speech-to-text

**End of specification — the approved requirements translated into English, not automatic authorization to begin implementation.**