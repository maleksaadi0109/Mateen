---
name: Scholarly grounding boundaries
description: Why citation validation alone is insufficient for religious explanations.
---

Checking that a citation and quotation exist does not establish that generated explanatory prose is supported. For the initial scholarly assistant, prefer an answer composed from verified exact source quotations rather than publish unconstrained model prose.

**Why:** The product explicitly forbids unsupported religious answers. A model can cite a genuine passage while adding an unrelated ruling; a valid citation would not catch that.

**How to apply:** Keep source identity, rights review, printed-page metadata and source-version eligibility separate from answer grounding. Expand beyond extractive answers only after evaluating a claim-level grounding check on representative Arabic questions and adversarial requests.

Treat model-written abstention reasons as generated content too, not as automatically safe explanations. Use fixed, non-religious refusal wording unless the explanation itself has been grounded.

**Why:** An output marked “abstain” can still smuggle an unsupported ruling through its reason field; validating only the main answer misses that path.

The user selected their own NVIDIA API access for the scholarly assistant instead of the proposed managed OpenAI connection or Gemini.

**Why:** This was an explicit provider choice, not permission to substitute another billed provider when NVIDIA is unavailable.

**How to apply:** Preserve NVIDIA as the intended provider unless the user changes it. Report connection failures explicitly; never silently route its requests to another provider or bypass source evaluation.