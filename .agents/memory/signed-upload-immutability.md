---
name: Signed upload immutability
description: Confirmation must commit validated private media, not leave assessment evidence behind a reusable upload link.
---

A signed PUT URL remains reusable until expiry. A completed upload or closed
student form does not make the uploaded object immutable.

**Why:** A reviewer could otherwise receive different, unvalidated bytes from
those accepted before an assessment was submitted. This can bypass duration and
size validation as well as the promise that submitted evidence cannot change.

**How to apply:** Commit the validated bytes to a separate private object that
was never exposed through a signed PUT URL. Reserve and track its path before
writing so cancellation or a process crash cannot create an untracked object.
Keep original upload paths and superseded deletion obligations tracked until
their upload links expire; a one-time delete does not prevent a later replay.
Do not silently treat legacy mutable uploads as frozen evidence.

Keep cleanup obligations independent of replaceable answer rows, and fence
cleanup against late writers rather than relying on process-local cancellation.

**Why:** Database transactions cannot undo cloud writes. A crash, row replacement,
or failed delete can otherwise strand private bytes; a late writer can also
recreate an object after an apparently successful deletion.

**How to apply:** Commit the reservation before writing, claim a durable write
lease immediately before the external write, and retain cleanup obligations
until writers have settled or their conservative lease has expired. Do not
discard an obligation on a deletion error. Validate entity paths against the
storage resolver's canonical names, not an assumed visible private-directory
prefix: a root-relative entity can still resolve inside private storage.