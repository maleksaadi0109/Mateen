# Comprehensive Specification — Mateen Platform

**File:** `master-project-spec.en.md`
**Source:** `master-project-spec.md`
**Decision approval date:** 2026-09-22
**Status:** Approved specification for phased implementation; not a statement that the functions have been implemented.
**Product:** Mateen Platform — منصة مَتِين
**Product language:** Arabic, with an RTL direction.

## 0. How to Use This Document

This document is the development reference for the entire platform, including interfaces, server, data, artificial intelligence, and operations. Development teams and coding agents use it to avoid inventing product rules or changing approved decisions.

- Inspect the existing project before implementation; reuse what is suitable and do not rebuild it from scratch by default, except for the landing page, which must be built from scratch (see 5.1).
- Creating this document does not authorize implementing the application or automatically continuing earlier interface mockups.
- Do not confuse a demonstrative interface with production functionality. Do not present simulated AI results, messages, or approvals as real.
- When older requirements conflict with this document, the newer decisions here take precedence, especially the limits on recitation, assessments, and privacy.
- There is no approved ready-made landing page that serves as a design source. The development agent must build the landing page from scratch: highly attractive, highly professional, in an Arabic style, and consistent with the approved identity. Do not copy wording from the inspirational website, and do not make promises that exceed first-release capabilities.
- Do not add payments, video classes, or certificate issuance merely because they are common on other platforms.
- Items designated as a “launch condition” must not be bypassed using test data or silent assumptions.

### Local References

- Brand-identity image: `attached_assets/Design_System_1790090535602.png`.
- Official logo: `attached_assets/MateeeeeeeeenLOGO_1790090010886.png`.
- Existing interface: `artifacts/mateen-platform`; its existing landing page is not a design reference, and the landing page must be built from scratch according to 5.1.
- Existing project server: `artifacts/api-server`.
- Any mockups in `artifacts/mockup-sandbox`, if present, are not approved production portals.

---

## 1. Product Vision and Scope

Mateen is an interactive educational platform for memorizing, reciting, and understanding Islamic scholarly texts and didactic poems. It connects students with approved texts, verified commentaries, and trustworthy human guidance.

### 1.1 In Scope

- Studying scholarly texts; in the first release, only “The Forty Hadith of al-Nawawi” (الأربعون النووية) is available (Hadith track — preparatory level). All other proposed tracks, levels, and texts appear closed with a “Coming soon” label (see 6.2).
- Word-level recitation and memorization verification.
- Spaced review and analysis of progress and mistakes.
- Oral and written level assessments.
- A scholarly assistant restricted to approved sources.
- Referral of complex questions or questions outside the sources by the scholarly assistant to approved teachers through text messages. Students do not ask teachers directly.
- Reviewing teachers’ qualifications and ijazat before allowing them to receive referrals.

### 1.2 Mandatory Constraints

- The platform does not include memorizing the Qur’an itself; the Tajwid and Qira’at track is for scholarly poems such as Tuhfat al-Atfal (تحفة الأطفال).
- Do not use images or icons of people, animals, or living beings, including default account images and human-shaped icons.
- Do not promise students automatic certificates.
- Do not advertise diacritic or pronunciation correction as available in the first release.
- The assistant must not issue its own fatwas or be described as infallible.
- Do not display success figures, approvals, or statistics that are not based on actual data.

### 1.3 Outside the First Release

Assessment of diacritics, shaddah, sukun, elongations, and articulation points; audio and video calls; class and assignment management; conversation attachments; issuance of student certificates; SMS and browser notifications; and commerce and subscriptions not specified in this agreement.

---

## 2. Technology and Architecture

### 2.1 Approved Choices

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS, RTL, Mateen identity |
| Routing | Retain the existing Wouter as long as it meets requirements |
| Frontend server data | TanStack Query |
| Forms | React Hook Form + Zod |
| Global state | Context for theme and interface settings, not as a replacement for server-data state |
| Animation | Framer Motion, respecting reduced motion |
| Server | Node.js + TypeScript + Express |
| Database | PostgreSQL + Drizzle ORM and versioned migrations |
| Scholarly search | Lexical and semantic search; pgvector where supported by the environment |
| Files | Private object storage, not binary files inside PostgreSQL |
| Communication | REST + WebSocket |
| Heavy operations | Background jobs with retries and status tracking |
| Specialized processing | Python when genuinely needed, not a mandatory service from the outset |
| Service contract definitions | OpenAPI and shared/generated types |

### 2.2 Architecture Approach

A unified application divided into logically independent modules: identity, content, study, recitation, assessments, assistant, referrals, messaging, teacher approval, and administration. Do not start with a distributed microservices system without a demonstrated need.

Separate audio processing and book indexing from ordinary requests when they require long-running tasks or specialized resources. Put speech and model services behind replaceable provider interfaces rather than scattering calls throughout the frontend.

### 2.3 Mandatory Implementation Principles

- Apply permissions, ownership, and level-transition validation on the server.
- Secrets and service keys must not reach the browser.
- The database stores file paths and metadata, not binary contents.
- Use the existing project’s routing conventions for service URLs and interface paths; do not hardcode localhost in browser code.
- Mutating requests must return actual data, and their results must be reflected in the interface and after reloading.
- Use database transactions and idempotency keys for sensitive events such as assessment submission and teacher approval.
- Services must provide clear loading, empty, and failure states; do not replace errors with demonstration success data.

---

## 3. Identity and User Experience

### 3.1 Visual Identity

| Role | Approved Value |
|---|---|
| Primary color | `#6D4C3D` |
| Secondary color | `#994703` |
| Third color | `#4E3A00` |
| Neutral | `#FDF9F3` |
| Headings | Kufam |
| Body text | Noto Naskh Arabic |
| Labels and controls | Cairo |

- The light theme is “Natural Parchment” (القرطاس الطبيعي), and the dark theme is “Night Manuscripts” (المخطوطات الليلية). The theme-switching button appears after login, within the dashboards for students, teachers, moderators, and the site administrator. The landing page uses the light “Natural Parchment” theme, as it is a professional landing page intended to attract users.
- Use the official logo; do not substitute an improvised text logo when the official logo is available.
- Do not use emoji.

### 3.2 Accessibility and Responsiveness

- Interfaces must suit mobile, tablet, and desktop.
- Implement genuine RTL direction, with correct handling of numbers, references, and mixed-direction text.
- Target WCAG 2.2 AA and verify it before claiming compliance.
- Support keyboard navigation, a clear focus indicator, meaningful button names, and dialog focus management.
- Do not communicate error or success through color alone.
- Save the theme preference and respect reduced motion.
- Destructive buttons require confirmation. Explain why an action cannot be performed instead of showing an unexplained disabled button.

---

## 4. Roles and Accounts

### 4.1 Approved Roles

| Role | Access Boundaries |
|---|---|
| Guest | Public pages and the informational assistant |
| Student | Their own learning data, assessments, conversations, and the public scholar directory |
| Teacher under review | Their account, application, and documents; cannot receive student-question referrals |
| Approved teacher | Their scholarly profile, conversations, referrals, and availability status |
| Scholarly content moderator | Content, sources, and scholarly review specifically authorized for them |
| Administrator | Platform administration under explicit, recorded permissions |

A content moderator does not automatically have permission to read private teacher documents. A teacher cannot see another teacher’s conversations or all student data.

### 4.2 Identity and Authentication

- Use a trusted managed identity provider; do not build local password storage from scratch.
- Verified email and secure account recovery.
- Support passkeys where available from the selected provider.
- Two-step verification is mandatory for administrators and teachers, and optional for students.
- Show sessions/devices and provide the ability to terminate them.
- Rate-limit attempts and protect against abuse.
- Verify account status on the server for every sensitive operation.
- Selecting the actual identity provider and confirming that its features are available is an implementation prerequisite; the interface must not claim to provide a feature that the integration does not support.

### 4.3 Teacher Approval

Create an account → verify and secure the email → submit the profile and documents → administrative review → approve, request additional information, or reject with a reason.

Uploading a document is not the same as approving it. A teacher cannot change their own approval badge, and newly updated documents remain under review until the administration accepts them.

---

## 5. Public Interfaces

### 5.1 Landing Page

Build the landing page from scratch; no previous landing page or landing-page specification is to be used as its design source. It must be highly attractive and highly professional, in an Arabic style, and consistent with the identity approved in 3.1: colors `#6D4C3D`, `#994703`, `#4E3A00`, and `#FDF9F3`; Kufam for headings, Noto Naskh Arabic for body text, and Cairo for labels and controls; and the light “Natural Parchment” theme. It must not include promises that exceed first-release capabilities. It includes:

- A sticky header, logo, and unified login.
- Links to About the Platform, the Smart Simulator, Features, Tracks, Methodology, and Frequently Asked Questions.
- No level-assessment button in the navigation bar.
- Student or teacher registration opens the correct context.
- The simulator is for scholarly texts and shows samples only from texts currently available on the platform; it must not show or assume samples from outside the platform.
- In the first release, simulator samples must be from “The Forty Hadith of al-Nawawi” (الأربعون النووية) only.
- If the simulator is demonstrative, label it clearly; do not show fake audio-recording buttons as a real service.
- Platform features, a Hadith and its source with copy and share controls, tracks, methodology, FAQ, and a student CTA.
- No certificate promises in track cards.
- Track cards show the Hadith track as available with “The Forty Hadith of al-Nawawi” (الأربعون النووية); all other tracks and texts are closed and labeled “Coming soon.”
- The page must not promise that users can ask teachers directly; access to a teacher is by referral from the scholarly assistant.
- Claims about free or paid services in old text do not create unapproved payment requirements.

### 5.2 About the Platform Page

Route `/about`; the following content is displayed with a professional design in an Arabic style:

**“About the Platform”**

**About the Mateen Platform**

**Platform Overview**

**“Mateen”**

It is an integrated intelligent learning environment dedicated to serving Islamic scholarly texts and didactic poems. We combine the latest audio-processing and artificial-intelligence technologies with an approved scholarly methodology to give students of knowledge an interactive experience that makes it easier to memorize scholarly texts, master their wording, and understand their meanings with high accuracy and reliability.

**Vision and Mission**

**Our Vision**

For the “Mateen” platform to become the world’s leading digital reference environment for facilitating mastery and understanding of scholarly texts, and a pioneering model for employing artificial intelligence grounded in scholarly integrity and human oversight.

**Our Mission**

To empower students of Islamic knowledge and educational institutions with advanced technological tools that combine accurate audio processing of scholarly texts, exclusive documentation from verified references, and intelligent referrals from the scholarly assistant to approved teachers and scholars.

**Core Values:**

**Authenticity and Authority:**

Exclusive reliance on approved and verified commentary books, with the source and page included in every answer.

**Scholarly Integrity:**

Complete abstention from issuing fatwas or speculation, and adherence to the bounds of scholarly texts and their Islamic legal principles.

**Responsible Innovation:**

Harnessing artificial intelligence and audio-processing technologies to serve the content without compromising its dignity and rigor.

**Human Partnership:**

Belief that technology is an aid, not a replacement for an approved scholar and teacher.

**The Platform’s Pillars (What Do We Offer?)**

1. **Intelligent Audio Recitation:**

   A segment-based processing engine that listens to the student’s recitation and level of memorization of the text, and immediately detects omissions, additions, and ordering errors.

2. **Documented Scholarly Assistant (RAG):**

   An answer engine limited to approved commentary books, providing precise answers supported by book titles and page numbers.

3. **Scholars’ Bridge:**

   An intelligent referral system that connects students with approved teachers and specialists when advanced evaluation is needed or questions fall outside the sources.

**Scholarly Safeguards and Integrity**

We place scholarly integrity at the forefront of our priorities through strict technical governance rules:

**No Fatwas or Independent Legal Reasoning:**

The assistant’s role is limited to explaining the wording of scholarly texts based only on the registered commentary books.

**Recitation Limited to Scholarly Texts:**

The audio-correction engine is limited to scholarly texts and didactic poems, and does not handle the Noble Qur’anic text.

**Referral to Specialists:**

Any inquiry outside the scope of approved references is automatically referred to the portal for approved scholars.

**Validation and Field Impact**

Mateen was not built as a theoretical idea; it began with a field study that included

**61 respondents**

from students of Islamic knowledge at the Islamic University of Madinah and students of Islamic universities in Libya:

**78.7%**

confirmed that clearly documenting the original source was their foremost condition for trust.

**63.9%**

agreed that the “scholarly assistant integrated with scholar referral” model was the ideal and most suitable solution for their learning journey.

**Call to Action**

**Begin your journey to mastering scholarly texts today**

[ Try live recitation ] — [ Explore available texts ]

### 5.3 Account Modal

A unified modal with student and teacher tabs, and a switch between login and account creation. Success must be tied to the account data and its actual role, not merely to closing the modal.

### 5.4 Informational Assistant

Answers questions about the platform only, according to the platform information approved in this document. For personalized questions, it invites the user to log in and provides an option to open the login modal. It does not act as a general scholarly assistant for visitors.

---

## 6. Student Portal

The following routes are suggested implementation organization and may be adapted to the project’s conventions without changing their functions.

| Page | Suggested Route | Purpose |
|---|---|---|
| Home | `/student` | Welcome, follow-up, and performance summary |
| Tracks | `/student/tracks` | Available tracks |
| Track details | `/student/tracks/:trackId` | Levels and their status |
| Study | `/student/study/:textId` | Text, recitation, and commentaries |
| Reviews | `/student/reviews` | Due and spaced reviews |
| Assessments | `/student/exams` | Eligibility, attempts, and results |
| Assessment attempt | `/student/exams/:attemptId` | Both sections, time, and resumption |
| Scholars | `/student/scholars` | Specialties and availability |
| Scholar profile | `/student/scholars/:teacherId` | Public information and ijazat |
| Messages | `/student/messages` | Conversations referred from the scholarly assistant to teachers |
| Settings | `/student/settings` | Account, privacy, and notifications |

### 6.1 Home

Welcome the student; show the last text and saved position, a continue button, memorization progress, recitation results, frequently mistaken words, due reviews, and the next assessment. Show a new student’s starting state without fabricating progress.

### 6.2 Tracks and Initial Content

| Track | Level | Text | First-Release Status |
|---|---|---|---|
| Creed | Preparatory | Nullifiers of Islam (نواقض الإسلام) | Coming soon |
| Creed | Level One | The Four Principles (القواعد الأربع) | Coming soon |
| Hadith | Preparatory | The Forty Hadith of al-Nawawi (الأربعون النووية) | Available |
| Tajwid and Qira’at | Preparatory | Tuhfat al-Atfal (تحفة الأطفال) | Coming soon |

- This is the only initial content catalog. All texts and tracks are closed and labeled “Coming soon,” and nobody can access them, except for the Hadith track and the text “The Forty Hadith of al-Nawawi” (الأربعون النووية), which will be the only text available at the platform’s first launch.
- Do not add later levels or other texts as if they were published.
- Level statuses: available, locked, in progress, passed, Coming soon (unpublished and inaccessible).
- The preparatory level is available initially; the next level requires passing the preceding level. In the first release, only the preparatory level in the Hadith track is opened. Anything labeled “Coming soon” cannot be opened by passing another level and cannot be studied or assessed until published.
- A student may directly take the assessment for an available level without completing its study; this does not unlock the assessment for a later locked level.
- If no subsequent level has been published, show completion of the available content rather than inventing a new level.

### 6.3 Study and Review

- The approved text, with diacritics, for reading, with the stopping position saved.
- Word-level recitation and comparison.
- Access to commentary, the scholarly assistant, and referrals when needed.
- Save memorization mistakes and progress without requiring audio storage.
- Schedule spaced reviews based on actual performance, show the review date, and update it after the review is completed.
- Document the scheduling algorithm during implementation and make it testable; do not claim a scientific diagnosis that does not exist.

### 6.4 Scholars and Messages

- Filter scholars by specialty and availability.
- Show scholarly information, approved ijazat, and authorized redacted display copies.
- The scholar directory and profiles are for information only; a student cannot start a question to a teacher from them.
- A conversation with a teacher can be created only through a referral from the scholarly assistant. Verify the teacher’s approval and availability when creating the referral, not only when displaying the card.
- Text-only conversations; no files, images, recordings, or video.
- The referral carries the text being studied, the student’s question, and the reason the assistant could not answer.
- A message appears in the conversation only after server confirmation; show sending failures and allow retries without duplication.

---

## 7. Audio Recitation and Feedback

### 7.1 What Is Assessed

Word correctness and order, substitutions, and skipped/omitted words. Diacritics and pronunciation quality are not assessed in the first release.

Silence alone does not count as an omission; confirm a skipped word only after the student moves on to the next word. Unclear audio must not be turned into a confirmed memorization error.

### 7.2 Workflow

1. Select the approved text and passage.
2. Obtain microphone permission and check service connectivity.
3. Send audio in numbered chunks.
4. Transcribe the audio and match it against the text in an independent service.
5. Show incremental results, then finalize the judgment once it has stabilized.
6. Save the performance summary and progress, and clean up the audio according to the retention policy.

### 7.3 Feedback

- During practice: immediately highlight a confirmed error, using a description that does not rely on color alone.
- The student continues without being forced to stop, then sees a summary after the session.
- Provisional results may be updated and must not immediately become grades or a final mistake record.
- During an assessment: show recording and connection status without revealing answers or providing corrective coaching during the attempt.
- If unavailable: ask the student to repeat the passage or show that the service is unavailable; do not show fabricated success or failure.

### 7.4 Speech Provider Selection

Initial evaluation candidate: OpenAI, according to the documentation reviewed during the agreement:

- `gpt-live-transcribe` for live audio.
- `gpt-transcribe` for completed recordings.
- Alternative for comparison: an ElevenLabs Scribe version that supports the use case and Arabic at implementation time.

This is an initial evaluation choice, not proof that it is best for Arabic. Recheck model names, availability, regions, and terms at implementation time.

According to the reviewed documentation, the mentioned real-time model does not provide word-level timestamps or confidence scores; these must not be fabricated. Implement word matching within the platform and select an alternative if the results do not meet recitation requirements.

### 7.5 Audio Launch Condition

Compare providers using recordings authorized for use, including text vocabulary, diverse speakers, noise and pauses, and deliberate omissions and substitutions. Measure:

- Text accuracy and detection of actual errors.
- False errors, especially marking a correct response as wrong.
- The model’s tendency to automatically repair an incorrect word.
- Time to deliver feedback and transcription stability.
- Cost, service availability, and retention terms.

Do not pass the complete assessment answer as a hint to the model in a way that encourages it to complete what the student did not say. Confirm the provider decision based on measured results before launch, not on marketing claims.

---

## 8. Assessments and Progression Rules

### 8.1 Approved Settings

| Item | Value |
|---|---|
| Number of questions | 30 |
| Written | 15 |
| Oral | 15 |
| Total duration | 30 minutes of active time |
| Question weight | 1 mark |
| Total | 30 |
| Passing | 25/30 or more |
| Separate minimum for each section | None |
| Retake after failure | After 24 hours from the end of the failed attempt |
| Study the level before the assessment | Not required |
| Progression | Complete both sections and achieve a passing score |

“Passing both sections” means completing both components within the assessment and achieving the approved total; it does not mean a separate passing requirement that has not been approved. Unanswered questions when time expires score zero; not all answers need to be correct.

### 8.2 Question Construction

- Randomly select completion passages from a published, approved version of texts at the same level.
- Oral: the student hears/sees an approved beginning and completes the required continuation aloud without being shown the answer.
- Written: the student completes text in writing without being required to add diacritics.
- Freeze the question set, order, text version, and grading rules when the attempt is created.
- Do not randomize again after reconnection or page refresh.
- Validate the question pool for short texts too; do not invent material to reach the required number.
- Keep the reference answers on the server; do not send them to the browser during the attempt.

### 8.3 Grading

- Award one mark for an answer matching the required passage and zero otherwise; no fractional marks or negative marking without an approved policy change.
- Ignore diacritics, tatweel, and nonsemantic differences in spacing and punctuation in written responses.
- Do not accept a synonym in place of a word; this is a textual memorization assessment.
- Do not erase meaningful letter differences through broad, unreviewed normalization.
- Compare oral responses against the final transcription. Audio that cannot be evaluated is a technical condition requiring repetition/review, not an automatic zero caused by a service failure.
- A language model must not be the sole authority for the grade: “Rely on a deterministic text-matching engine (Deterministic Matching Engine) to calculate the final score (0 or 1), with the language model (LLM) limited to phrasing feedback and explaining mistakes, without participating in the pass/fail decision.”
- Show results and mistake review after the assessment is submitted, not before.

### 8.4 Attempt States

`created → in_progress → paused_connection → in_progress → submitted → grading → passed | failed`

`technical_review` may be used when a problem prevents fair grading. Do not automatically treat a technical failure as an academic failure that imposes the waiting period.

### 8.5 Timing, Disconnection, and Resumption

- The server is the source of truth for elapsed time, remaining time, and question status.
- Save confirmed answers, the question position, and periodic time checkpoints.
- Use server-side heartbeats and disconnection detection; the server must not trust a client “pause” button or client-supplied time.
- On a confirmed disconnection: freeze the attempt at the last trusted checkpoint, disable answers, and hide question content while paused.
- After reconnection: restore the same attempt, questions, current question, and saved time; do not grant a new duration.
- Restore a local draft where possible, but do not count an answer without server confirmation. Clearly explain any loss of data that was not confirmed as saved.
- Number audio chunks and acknowledge receipt; do not grade a truncated recording as complete.
- Prevent conflicting simultaneous active sessions for the same attempt.
- Duplicate submissions or reconnects must not duplicate answers, time deductions, or marks.
- Log repeated disconnections for review; do not automatically interpret them as cheating.
- The actual cause of an internet disconnection cannot be proven absolutely. This is a recovery mechanism, not a comprehensive exam-proctoring system.
- Automatically submit saved answers when 30 active minutes have elapsed.

### 8.6 Retake and Progression

- Calculate `retryAvailableAt` on the server, 24 hours after the failed attempt ends.
- Show the student the availability time and remaining wait.
- Do not start a new attempt if the student has a resumable attempt for the same level.
- Record a pass and unlock the next level consistently in the database, safely handling repeated requests.
- Later changes to the assessment policy must not silently alter ongoing attempts or historical results.

---

## 9. Scholarly Assistant and Sources

### 9.1 Knowledge Preparation

Use legally authorized sources, with book, author, edition, volume, and page metadata, and review extracted text before indexing. Distinguish PDF file page numbers from printed page numbers.

Associate every passage with a source version and approval status. Draft or withdrawn sources must not support new answers.

### 9.2 Answering Workflow

1. Identify the scope of the question, the text being studied, and the context.
2. Perform lexical and semantic searches over approved sources only.
3. Retrieve sufficient passages linked to references.
4. Produce a bounded explanation or a clearly identified quotation grounded in those passages.
5. Verify that every citation exists and corresponds to the source text.
6. Answer, or abstain and offer a referral.

Do not claim that RAG completely prevents hallucinations. Evaluate Arabic quality, adherence to sources, and abstention. Pin the selected model version in configuration and update it only after evaluation.

### 9.3 Referrals

- Refer when the question falls outside the sources, evidence is insufficient, or human guidance is needed.
- Show the student the context that will be shared with the teacher.
- Transfer the text being studied, the question, and the reason for referral without copying unnecessary private information.
- Select an approved, available teacher, or show an honest wait-for-availability state if none is available; do not fabricate teacher availability.
- Students cannot ask teachers directly; the scholarly assistant is the sole entry point for student questions and refers complex questions or questions outside the sources to a teacher. This preserves the role of artificial intelligence and prevents the platform from becoming a conventional messaging platform.
- Treat source text and messages as untrusted data with respect to system instructions, to prevent prompt injection.

---

## 10. Teacher Portal

| Page | Functions |
|---|---|
| Home | Pending referrals, recent conversations, response activity |
| Referrals and messages | Filter referrals by response status, view question context and referral reason, send text replies |
| Scholarly profile | Biography, specialties, teachers, ijazat, and review status |
| Settings | Account and notifications |

### 10.1 Availability

- Clear control: Available for referrals / Unavailable.
- Unavailable teachers do not receive new referrals.
- They retain existing conversations and can reply to them.
- Follow-ups in an existing conversation are allowed; do not create a new case within it to bypass availability.
- Administrative suspension or withdrawal of approval is distinct from unavailability; it restricts permissions according to the administrative decision.

### 10.2 Referrals

Use statuses such as Awaiting Reply and Answered. Changing a status does not delete the conversation history. Search and filters must not reveal unauthorized conversations.

### 10.3 Boundaries

In this release, the teacher provides guidance and answers. Do not add video-class dashboards, assignment management, certificate issuance, or permission to change student grades merely because the account belongs to a teacher.

---

## 11. Administration Portal

### 11.1 Home

Show platform activity, learning metrics, items awaiting review, delayed referrals, and significant service failures. Calculate statistics from actual data.

### 11.2 Users

Search and filter by roles and account statuses, display authorized details, and change status/permissions through explicit, recorded actions.

### 11.3 Teacher Approval

Review profiles and original documents under restricted permissions, then approve, request additional information, or reject with a reason. Record who reviewed, when, and what changed, without placing sensitive document contents in general logs.

### 11.4 Tracks and Content

Support drafting, editing, review, publishing, and archiving tracks, levels, texts, and their order. Do not delete a version used in a historical assessment in a way that breaks result references.

### 11.5 Assessments

Manage passage-generation rules, policies, results, and technical reviews. The binding defaults are in Section 8; coding agents must not change them arbitrarily.

### 11.6 Sources and Assistant

Approve and index commentaries, monitor problems with answers, citations, and referrals, and disable a defective source for new answers.

### 11.7 Reports and Audit

Manage reports, record sensitive administrative decisions, confirm destructive operations, and show the reason, actor, and date.

---

## 12. Logical Data Model

These are functional entities, not mandatory literal table names.

| Domain | Entities and Relationships |
|---|---|
| Identity | User, roles and permissions, account status, identity-provider ID, preferences |
| Teacher | Scholarly profile, specialties, availability, approval application, documents, review decisions, redacted public copy |
| Content | Track → ordered levels → texts → approved versions → passages |
| Study | Student enrollment in a track, progress, saved position, recitation session, word mistakes, scheduled review |
| Assessment | Versioned policy, attempt, questions frozen for the attempt, answers, temporary recordings, time checkpoints, result |
| Knowledge | Book/edition, cited passages, approval status, semantic index |
| Assistant | Question, answer, citations, abstention decision, referral |
| Messaging | Conversation, authorized participants, assistant-referral source, messages, inquiry status |
| Operations | Notification, preferences, report, audit record, background job, deletion/export request |

### Data Invariants

- Progress and assessment passages refer to a specific text version.
- Results retain the grading policy applied to them.
- Clients cannot assign record ownership, roles, grades, or approval status.
- Account deletion handles related records, files, and backups according to the published policy.
- Store times consistently on the server and display them in the relevant time zone.
- Messages, answers, and administrative operations have identifiers that prevent duplicate processing.

---

## 13. Service Contracts and Events

Define contracts in OpenAPI before connecting the interface, validate inputs, and regenerate types when contracts change.

### 13.1 REST Domains

- Current account, preferences, and authorized sessions.
- Published tracks, levels, and texts.
- Study progress, reviews, and recitation sessions.
- Assessment eligibility, attempt creation/resumption/saving/submission, and results.
- Public scholars and redacted profiles.
- Conversations, messages, and referrals.
- Teacher profile, documents, and availability.
- Administration of users, approvals, content, sources, policies, and reports.
- Notifications and export/deletion requests.

### 13.2 Realtime Events

Semantic examples: session started, audio chunk, receipt acknowledgment, provisional/final transcription, confirmed word mistake, service status, assessment checkpoint, disconnection/resumption, new message, and question-status change.

Authenticate every connection and verify session ownership. Number chunks, prevent duplicates, and handle reconnection. Define audio/message size limits and timeouts during implementation.

### 13.3 Explicit Errors

Distinguish unauthenticated access, forbidden access, missing resources, attempt-state conflicts, time expiration, assessment-retry cooldown, provider failure, and invalid inputs. Do not expose stack traces or secrets to users.

---

## 14. Privacy and Retention

### 14.1 Principles

Collect the minimum necessary data, obtain clear microphone consent, explain the purpose of processing, and do not use data to improve models without separate consent.

### 14.2 Approved Policy

| Data | Policy |
|---|---|
| Practice audio | Temporary processing; delete after processing by default while retaining performance results |
| Assessment audio | Retain for 30 days for review and appeal, then delete automatically |
| Original teacher documents | Private storage, accessible only to approval reviewers |
| Public-profile ijazat | Teacher-authorized redacted copy for publication, with sensitive information hidden |
| Backups | Daily, retained for 30 days, with restoration testing |
| Account export/deletion | Identity-verified request, execution tracking, and notification to the requester |

- Explain the assessment-audio policy before the assessment starts.
- Do not copy temporary audio files into backups that extend retention without disclosure.
- Tell the user how long deleted data remains in backups; after restoring a backup, reapply deletion records.
- Do not claim that data has been deleted from a provider except in accordance with its actual capabilities and terms. Review the retention requirements of the audio and model providers and their processing regions before launch.
- Set detailed retention periods for messages, documents from rejected approval applications, and audit logs in the legal launch policy; the developer must not invent permanent retention periods.
- Encrypt data in transit and at rest, use short-lived signed file URLs, and do not store permanent signed URLs in the database.

### 14.3 Legal Launch Condition

Determine the operating country, age groups, legal basis, required consents, and cross-border data transfers. This document is not a legal-compliance certificate. Do not assume that accepting minors without guardian consent is permitted in every country.

---

## 15. Security and Notifications

### 15.1 Security

- Check permissions on every request and every event subscription.
- Prevent access to another user’s attempts, conversations, and documents by changing an identifier.
- Validate uploaded files, their type and size, and scan them before making them available to a reviewer.
- Protect sessions and use CSRF protection with cookies, as well as protection against XSS, SQL injection, and request-rate abuse.
- Separate document-review permissions from content-administration permissions.
- Do not log audio, documents, or private message text in general operational logs.
- Record administrative operations and protect the log from ordinary modification.
- Treat prompts and sources as untrusted inputs; do not execute instructions extracted from them.

### 15.2 Notifications

- In-platform: replies, referrals, results, reviews, and approval statuses.
- Email for important and security-related events.
- User control over learning and message notifications.
- Do not put private question content or documents in email.
- No SMS or browser notifications in the first release.
- Send notifications through background jobs, with safe retries that do not produce duplicate messages.

---

## 16. Operations and Quality

- Monitor server errors, speech providers, response time, and job failures.
- Separate development and production environments and their data.
- Use reviewable database migrations and take a backup before sensitive changes.
- Provide automatic cleanup jobs for expired files, and test that deletion actually occurred.
- Monitor audio and model costs and usage limits without silent overages.
- When a provider fails, show its status and protect student progress; do not change grading to fabricated success.
- Switching to an alternative provider during a session must not lose chunks or duplicate results, and must be tested before use.
- Document required settings without putting secrets in the repository.

---

## 17. Acceptance Criteria

### Accounts and Permissions

- The registration tab determines the requested role, and a new teacher cannot receive referrals before approval.
- A student cannot access another student’s data, and a teacher cannot access a conversation that is not theirs.
- A content moderator cannot read original ijazat documents without permission.
- Two-step verification is enforced for teachers and administrators before they use their permissions.

### Study and Tracks

- Only “The Forty Hadith of al-Nawawi” (الأربعون النووية) is opened. The other tracks and texts appear in the table with a “Coming soon” label and cannot be accessed, studied, or assessed; the server rejects such access as well.
- The student returns to their saved position after logging in or refreshing.
- Completing study alone does not open the next level.
- The assessment for an available level can be taken without prior study.

### Recitation

- The technical test distinguishes correct words, substitutions, and skipped words.
- A pause does not automatically become an omission.
- Practice immediately shows a stable error and does not force the student to stop.
- Assessment answers are not revealed during the attempt.
- Diacritic errors are not counted in the first release.

### Assessments

- Each attempt consists of 15 written and 15 oral questions.
- Total active time is 30 minutes, and the total score is 30.
- 24/30 is a fail and 25/30 is a pass; there is no hidden additional minimum for either section.
- A correct written answer without diacritics is accepted.
- Retaking after failure is prohibited until 24 hours have elapsed and is allowed afterward.
- Reconnection restores the same questions, current question, and saved time; it does not randomize again.
- Refreshing the page or a difference in the device clock does not grant extra time.
- Repeated submission does not duplicate the result or level unlock.
- When time expires, saved answers are submitted and unanswered questions score zero.
- A speech-service failure does not cause automatic failure without technical handling.

### Scholars and Messaging

- A student can start a conversation with a teacher only through a referral from the scholarly assistant; the server rejects any other attempt.
- An unavailable teacher does not receive a new referral and retains existing conversations.
- The public profile does not reveal sensitive original documents.
- Sent text appears after it is saved and remains after reloading.
- Attachments and calls are not available.
- A referral transfers the question context and its reason only to the authorized party.

### Assistant and Administration

- A citation points to an existing, approved passage and source.
- A question without supporting evidence leads to abstention/referral, not an invented source.
- A request for additional information during approval is shown to the teacher, and acceptance/rejection is reflected in the account status.
- Changing an assessment policy does not silently regrade past attempts.
- Editing published content does not break references in historical assessments.

### Privacy and Accessibility

- Practice and assessment audio cleanup conforms to the policy.
- Public copies of documents are redacted and authorized for publication.
- Export, deletion, and identity verification are usable.
- Keyboard navigation, mobile layout, and dark theme are tested.
- There are no icons depicting living beings or promises of automatic certificates.

---

## 18. Implementation Phases When Build Is Requested

1. **Current-state audit:** Identify what is real and demonstrative, and build the landing page from scratch according to the approved identity and first-release capabilities.
2. **Foundation:** Identity, permissions, database, approved content, and private storage.
3. **Early audio feasibility proof:** Compare services on the scholarly texts before tying academic success to them.
4. **Student portal:** Study, progress, reviews, and scholar directory.
5. **Teacher and administration:** Approval, availability, referrals, messaging, and content management.
6. **Scholarly assistant:** Prepare sources, retrieval, citations, abstention, and referrals.
7. **Assessments:** Passage generation, grading, timing, resumption, and progression.
8. **Launch readiness:** Privacy, deletion, backups, security, accessibility, and acceptance testing.

Work may proceed in parallel where it does not conflict, but do not launch automatically graded oral assessments before validating the speech service, or a scholarly assistant before approving its sources.

---

## 19. Launch Decisions Whose Completion Must Not Be Falsified

The product and its main rules have been approved. The following implementation verification steps remain; they are not grounds for changing scope:

- Prove the selected model’s availability and performance with Arabic and scholarly texts, and identify the production version.
- Select an identity provider and verify that it supports the required security features.
- Obtain approved copies, authorized for use, of the scholarly texts, commentaries, and recordings.
- Review legal privacy requirements, the processing country, and age groups.
- Calibrate audio quality and document the acceptance criterion with the scholarly team.
- Determine the remaining retention periods in the privacy policy before launch.

There is no need to ask the project owner again about values approved here. Ask only when a significant new decision cannot be resolved within the authorization, or when a conflict would change the outcome.

---

## 20. External Service References

These references were reviewed during the agreement; services change, so review them again before implementation:

- OpenAI transcription: https://developers.openai.com/api/docs/guides/transcription
- OpenAI realtime transcription: https://developers.openai.com/api/docs/guides/realtime-transcription
- ElevenLabs speech to text: https://elevenlabs.io/docs/overview/capabilities/speech-to-text

**End of document — the source of truth for approved decisions, not automatic authorization to begin implementation.**