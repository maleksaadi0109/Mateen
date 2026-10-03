# Assessment operations

## Grading boundaries

The first release offers only the introductory Nawawi assessment. Students may
attempt it without marking the reading material as studied. The policy is
30 questions, 15 written and 15 oral, one point per question, 30 active minutes,
and a passing total of at least 25. There is no separate passing threshold for
either part.

Written responses are matched deterministically. An oral response must be
reviewed by a separately authorized reviewer who listens to the complete
recording, checks the reference, and enters what was actually heard. The server,
not the reviewer, computes the numerical score from that transcript. An
unscorable recording is a technical case, not an educational zero.

Experimental speech recognition is not used to grant points, advance a level,
or create a confirmed mistake. Pronunciation and diacritics are not graded.
The imported source remains disclosed as pending comprehensive scientific
review; selecting source boundaries or granting a reviewer does not establish
licensing or approval of the entire edition.

## Authorizing reviewers

An ordinary teacher profile does not authorize assessment review. Neither a
public profile field nor a browser-supplied role can create a reviewer grant.
The operator must choose an existing Clerk identity explicitly.

Run the command against the intended configured database and Clerk tenant:

```sh
ASSESSMENT_REVIEWER_OPERATOR_LABEL=ops-console \
  pnpm --filter @workspace/api-server run assessment-reviewer \
  grant user_CLERK_ID --confirm
```

Replace the placeholder with the exact identity selected by the operator.
Use `revoke` in place of `grant` to revoke access. Do not automatically assign
review rights to the first user, all teachers, or accounts created by tests.
Reviewers cannot adjudicate their own attempts.

The review portal is `/admin/assessments`. New oral submissions have no final
score until the required oral decisions are complete. Plan reviewer coverage
and response times before inviting real students to take oral assessments.

## Coverage responsibility and response target

The launch response target is **48 hours from server submission time**, not
exam start or the time a reviewer opens it. This is an operational target, not
a guarantee or an automatic grading deadline. Each explicitly enabled reviewer
accepts responsibility for the shared queue of other students' submissions.
The operator who executes the grant owns coverage planning: confirm the
reviewer's agreement and availability, designate a primary and backup before
inviting real students, check the queue at least daily, and arrange replacement
coverage for absence or overdue work. The operator label records who changed
access, not proof of a staffed shift.

The coverage check discloses only whether another enabled reviewer exists.
A new exam is rejected with 503 before any attempt is created when none exists,
including when the only reviewer is the student. Existing attempts may resume
and submit; pending results and experimental practice are unaffected.
An enabled grant is the operator's coverage commitment, not evidence that the
reviewer is online. Revoke unavailable reviewers rather than leaving unstaffed
grants enabled. Teacher profiles and public roles never establish coverage.

The portal lists the oldest submissions first, their target review dates, and
an overdue marker. Overdue submissions remain pending with no final score:
they must not become zeros, failures, or new cooldowns. Missing or unscorable
recordings remain technical cases. There are no automatic reminder messages
yet; the operator's daily check is required.

Revocation is checked on every protected review request and again inside the
decision transaction. Decisions committed before revocation remain immutable;
no new decision may be saved after revocation commits. Revocation works even
for a deleted Clerk identity; granting always verifies identity existence.
Audio already downloaded cannot be recalled; reviewers must not retain copies.

No real identity is selected or granted as part of implementation. Before
launch, the operator must supply the exact existing Clerk identity and execute
the confirmed grant above against the intended environment. Confirm portal
access for that account, new exam admission for a different student, and that
revocation removes portal/audio/decision access and blocks new exams if it
removes the last independent reviewer. Reviewers never review their own attempts.

## Time and retries

The server owns the active timer, checkpoints, question position, and single-tab
lease. A confirmed disconnection freezes the last trusted checkpoint; resuming
does not select new questions or grant another 30 minutes. Local drafts are not
answers until the server acknowledges them.

The 24-hour failed-attempt retry period is measured from server submission time,
not from a delayed human review. A technical case does not impose an educational
cooldown. Passing completes the available content; it does not publish or unlock
forthcoming courses.

## Audio and retention

Exam audio is private, bounded to 10 MiB and 60 seconds, and retained for at most
the recorded 30-day expiry. Confirmation must freeze the independently decoded
bytes into a private object that was never exposed through a signed upload URL.
The temporary upload key must remain tracked for cleanup until its signed URL
has expired, including deletion retries.

Students can delete their own audio before or after grading. Deleting an
unreviewed recording creates a technical case; deleting an already graded
recording does not rewrite its result. Final references, policy snapshots,
grades, and review provenance remain immutable.

The API runs retention cleanup; an operator can also run:

```sh
pnpm --filter @workspace/api-server run assessment-retention-cleanup
```

The cleanup operation must not report successful deletion while private bytes
still require a retry.

Frozen-write reservations are committed before any object write. An independent
cleanup ledger survives cancellation, answer replacement, and process failure;
cleanup cannot release it while a write lease may still produce private bytes.
Failed deletes remain retry obligations. Cancelling an incomplete upload removes
it from the question immediately but tracks its temporary key through signed-link
expiry and skew, since a still-valid PUT link can recreate that temporary object.

The exam client retains the upload phase and original sequence until acknowledgement:
a failed PUT retries the same allocation, and a lost confirmation response retries
only confirmation. A new local recording first cancels any previous pending upload.

## Scheduled reviews

Only confirmed submitted mistakes create scheduled reviews. Unanswered
questions receive zero under the exam policy but are not observed word mistakes.
The first review is due in one day. A verified correct written completion
advances the interval to 3, 7, 14, and then 30 days; an incorrect completion
resets it to one day. Replayed mutation identifiers must not advance it twice.
Bookmarks and self-reported study markers remain a separate reading list.