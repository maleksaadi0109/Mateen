# Student recitation browser verification

Date: 2026-10-03

## Scope and result

Passed the ordinary authenticated student journey at
`/student/study/nawawi?h=1`. Supported Clerk programmatic sign-in and normal
student onboarding succeeded. No authorization overrides, guard bypasses,
database permission changes, auth/API mocks, or application changes were used.

## Observations

| Check | Observed result |
| --- | --- |
| Reading-first layout | Full collection loaded: 42 hadiths, 32 digital pages; text visible before starting. |
| Responsive widths | 390, 768, and 1440px had no horizontal overflow. Client widths were 375, 753, and 1425px with the browser scrollbar. Navigator, selector, and start control were reachable. |
| Consent | Initially unchecked, confirmation disabled, recognition not created. Cancel returned to reading without starting recognition. Explicit agreement enabled starting. |
| Pause/resume | Revealed 20 words of a 90-word page; pause retained progress, and resume continued at that position. |
| Automatic continuation | Loaded text fed through the deterministic recognizer crossed hadith 1 to 2 and page 1 to 2. Page 2 revealed its next 10 words without mismatch or observed skipped/reset position. |
| Return to reading | Stopped the recognition instance and removed listening controls. |
| Manual navigation | Next/previous changed pages 2 → 3 → 2; choosing hadith 3 moved to page 4 with its starting segment visible. |
| Persistence | Observed two progress PUTs containing only `currentHadith`, `completedIds`, and `bookmarkedIds`, consistent with manual reading-position navigation, plus two progress GETs. No transcript/audio/grade fields appeared. |
| Browser storage | Three local-storage keys and empty session storage; scanned keys/values did not match transcript/audio/grade/score/recitation terms. Raw values were not retained. |

## Evidence

Browser-managed screenshot references:

- 390px: `o6w56d`
- 768px: `0k2j47`
- 1440px: `gxr8em`
- Unchecked consent: `oo9usf`
- Automatic page/hadith continuation: `1uk2y5`
- Manual hadith selection: `7i2d13`

## Limits

Only SpeechRecognition was replaced with a deterministic browser-only fake,
using words from the actual loaded book. This verifies interaction behavior,
not microphone operation, speech-service privacy, or Arabic recognition accuracy.
Responsive desktop-browser viewports are not physical-device certification.
Persistence findings cover the observed journey and storage inspection, not a
database-wide audit. The text retained its pending scientific-review notice;
this test does not establish scholarly approval or reviewer authorization.

No credentials, identity details, session material, or raw storage values are
included in this report.