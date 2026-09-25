---
name: Presentation font validation
description: Verify rendered PDF fonts rather than trusting installed font files.
---
Verify the font names used in the exported PDF, not merely that requested font files exist.

**Why:** The workspace's default font discovery can omit local fonts even when the font files are valid. Office export can silently substitute fonts, changing Arabic wrapping and visual hierarchy.

**How to apply:** Ensure the office renderer can discover the intended fonts, inspect exported PDF font metadata, then visually check the actual rendered slides for wrapping and overflow.