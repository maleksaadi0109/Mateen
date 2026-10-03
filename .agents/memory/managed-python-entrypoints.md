---
name: Managed Python entrypoints
description: Preserve the managed interpreter entrypoint when launching isolated Python workers.
---

Use the managed interpreter entrypoint itself when launching a worker; do not
resolve its symlink into the underlying Nix interpreter binary first.

**Why:** A validation subprocess with a stripped environment failed through the
resolved underlying binary but succeeded through the managed entrypoint. The
entrypoint preserves discovery of the workspace-installed Python packages.

**How to apply:** Validate that the configured entrypoint exists and is
executable, but keep its configured path in the subprocess arguments. Resolve
untrusted data-file paths for containment checks independently.