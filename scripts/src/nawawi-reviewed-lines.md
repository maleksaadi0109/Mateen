# Manual scan alignment

`nawawi-reviewed-lines.json` transcribes the supplied Dar al-Salam scan, not the
Turath assessment edition. Coordinates are native pixels. Each record contains
the printed heading and sanad followed by the selected primary report.
Attribution, footnotes and alternative reports are not practice tokens.

Each line is `[page, top, height, cells, descendingXEdges]`. Pipe-separated
cells are visual words. Honorifics and joined vocatives have multiple spoken
tokens in a single cell; the existing renderer waits for all of them before
revealing that cell. Qur'an reference labels and ornaments have no tokens.

1. Edit the manual lines against the private original page images.
2. Run `python scripts/src/apply-nawawi-reviewed-lines.py`.
3. Inspect **every** generated `review-<hadith>-<sheet>.png` under
   `.agents/outputs/nawawi`, including each word and passage boundaries.
4. Only after correcting and inspecting crops, run the same command with
   `--apply`. It verifies the PDF/page hashes, preserves the assessment reference
   and private image object paths, and updates corrections and runtime mapping.
5. Run the API `test:recitation-pages` check.

The proof sheets are local restricted-source derivatives, not public assets.
Neither this visual inspection nor the `visually-checked` flag confers scholarly
approval. Image access remains authenticated under the existing permission.
Technical gaps remain distinct from learner errors.