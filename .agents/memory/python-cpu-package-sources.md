---
name: Python CPU package sources
description: Managed Python installation quirks encountered while setting up local Arabic speech recognition.
---

Keep the PyTorch CPU package index scoped to PyTorch, rather than all packages that depend on it.

**Why:** The managed Python installer injected hundreds of CPU-index source mappings, including Transformers. The CPU index offered older Transformers releases than PyPI, causing a false “no solution found” for a version that was available on PyPI. This was an index-selection problem, not a package-security block.

**How to apply:** Inspect source mappings after installing Python speech libraries. Keep a Linux-marked CPU source for PyTorch and resolve unrelated packages from their normal index. Preserve the managed Python environment rather than creating a second environment.

An explicit PyPI source for Transformers does not prevent the publishing installer from injecting an additional CPU source.

**Why:** Publishing first reported a Transformers release unavailable despite its presence on PyPI. After an explicit PyPI mapping was added, a subsequent publishing log showed the installer appending a Linux-only CPU mapping to it, causing a multi-source TOML error. The appended mapping was absent from the workspace. The explicit PyPI workaround was withdrawn.

**How to apply:** Diagnose the publishing-side rewrite rather than repeating explicit-source changes or downgrading Transformers blindly. Keep automatic package discovery separate from the explicit, locked Python installation during the API build (operating instructions are in `replit.md`). Verify discovery as well as resolution: local `uv lock` success alone does not exercise the publishing installer. Do not remove Python speech dependencies merely to make publishing pass.

The managed installer expects existing package-source mappings to be arrays.

**Why:** Preconfiguring a scalar PyTorch source made its append operation fail, after it had already written many unrelated source mappings.

**How to apply:** Use an array-form source mapping, and inspect dependency-file changes even when a package-install operation reports failure. Do not keep unrelated generated mappings just because the install eventually succeeded.