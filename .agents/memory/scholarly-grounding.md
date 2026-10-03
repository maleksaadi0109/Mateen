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

The user identified Muhammad ibn Salih al-Uthaymeen as the intended commentator for the Forty Nawawi Hadith source, then selected https://shamela.ws/book/21812 as the commentary reference.

**Why:** This identifies the desired scholarly reference; it does not establish that an unattributed third-party dataset contains his commentary.

**How to apply:** Use the user-selected Shamela reference rather than assume the earlier unattributed GitHub dataset contains his commentary. Keep attribution, scientific approval, and reuse clearance as separate checks.

The user explicitly accepted a private administrative NVIDIA generation experiment while postponing scientific evaluation.

**Why:** They wanted to try real generation and continue development without waiting for source review; the accepted alternative was private unreviewed drafts, not publication to students.

**How to apply:** Keep experimental generation separate from scholarly approval and student launch readiness. Do not interpret permission for the private experiment as permission to record passing scientific results.

NVIDIA transport timeouts can be transient even when configuration is valid.

**Why:** Repeated deadline expirations were followed by a successful fast response without replacing the credential or model. Neither configuration presence nor a failed request alone establishes provider availability or Arabic quality.

**How to apply:** Distinguish missing configuration, transport failure and scientific suitability. Use bounded retries for diagnostic generation; do not switch providers, change credentials, or score scientific quality from a timeout.