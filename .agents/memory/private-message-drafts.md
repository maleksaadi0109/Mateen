---
name: Private message drafts
description: Privacy tradeoff for unsent student and teacher messages.
---

Message draft recovery is deliberately limited to the current browser tab and login session. Do not silently extend it to long-lived browser storage or server-side synchronization.

**Why:** Referral messages may contain sensitive personal questions. Recovery after navigation/reload is useful, but leaving private text on shared devices after logout or account switching is not an acceptable tradeoff.

**How to apply:** Keep the retention limits visible beside the composer. If future work needs recovery after logout or across devices, make that a separate consent, retention, and access-control decision; unsent drafts must never become published messages.