---
name: Node UI test runtime
description: Non-obvious initialization and shutdown behavior in bundled React/Radix regression tests.
---

Initialize a test DOM before importing browser-sensitive dependencies, not merely before mounting React. Bundlers can hoist imports even when the source uses a dynamic import.

**Why:** Radix can snapshot browser availability at module evaluation. A late DOM produces missing portals without an application defect.

**How to apply:** Preload the DOM for bundled Node UI tests that exercise real Radix dialogs.

Avoid finite React Query garbage-collection timers in short-lived Node test harnesses.

**Why:** Clearing a QueryClient after successful assertions can still leave timers from removed mutation observers alive, causing the runner to time out despite passing tests.

**How to apply:** Set test-only query and mutation garbage-collection times to Infinity and unmount/clear explicitly. Do not change application cache policy to resolve a test-process shutdown problem.