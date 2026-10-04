---
name: Private PDF preview reliability
description: Why credential previews render locally using compatibility entrypoints rather than native browser PDF plug-ins.
---

Private credential previews should render pages locally with a compatible PDF.js entry and matching worker, not depend on an iframe's native PDF plug-in.

**Why:** A genuinely uploaded and security-checked test certificate showed a blank native viewer. The modern PDF.js entry then failed on newer Map/WeakMap built-ins absent in the supported verification browser despite passing type checks and builds. Compatibility entrypoints include the needed polyfills.

**How to apply:** Keep both renderer and worker local and compatibility-matched; load the parser only when opening a document, bound raster memory and revoke private blob URLs when closing. Confirm an actual painted page, not merely a nonzero canvas or successful download. A malware-clean file does not establish credential authenticity.