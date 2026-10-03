---
name: Python CPU package sources
description: Managed Python installation quirks encountered while setting up local Arabic speech recognition.
---

Keep the PyTorch CPU package index scoped to PyTorch, rather than all packages that depend on it.

**Why:** The managed Python installer injected hundreds of CPU-index source mappings, including Transformers. The CPU index offered older Transformers releases than PyPI, causing a false “no solution found” for a version that was available on PyPI. This was an index-selection problem, not a package-security block.

**How to apply:** Inspect source mappings after installing Python speech libraries. Keep a Linux-marked CPU source for PyTorch and resolve unrelated packages from their normal index. Preserve the managed Python environment rather than creating a second environment.

The managed installer expects existing package-source mappings to be arrays.

**Why:** Preconfiguring a scalar PyTorch source made its append operation fail, after it had already written many unrelated source mappings.

**How to apply:** Use an array-form source mapping, and inspect dependency-file changes even when a package-install operation reports failure. Do not keep unrelated generated mappings just because the install eventually succeeded.