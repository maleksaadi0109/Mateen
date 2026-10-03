---
name: Managed storage permissions
description: Private object readiness must not depend on bucket metadata access.
---

The managed storage credentials in this workspace allow private object upload, read and deletion, but bucket metadata requests return 403.

**Why:** A benign private-file round trip succeeded, unauthenticated reading was denied, and deletion succeeded while the bucket metadata check failed. Requiring bucket metadata falsely disabled a working service.

**How to apply:** Verify the operations the application uses on its configured private prefix. Do not require bucket-level metadata permission solely to decide whether private file handling is available.