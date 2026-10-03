---
name: Scholarly grounding boundaries
description: Why citation validation alone is insufficient for religious explanations.
---

Checking that a citation and quotation exist does not establish that generated explanatory prose is supported. For answers presented as scientifically verified, prefer verified exact source quotations rather than unconstrained model prose.

**Why:** The product explicitly forbids unsupported religious answers. A model can cite a genuine passage while adding an unrelated ruling; a valid citation would not catch that.

**How to apply:** For answers advertised as scientifically verified, keep source identity, rights review, printed-page metadata and source-version eligibility separate from answer grounding. Expand that verified mode beyond extractive answers only after evaluating a claim-level grounding check on representative Arabic questions and adversarial requests. This does not block the separately authorized unreviewed study-answer mode.

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

The user subsequently requested student-visible AI study answers even while source approval and scientific evaluation remain incomplete.

**Why:** The user explicitly wanted the assistant to answer instead of displaying the readiness refusal for ordinary study questions.

**How to apply:** Allow newly generated general educational answers with an explicit persistent unverified warning and no fabricated citation metadata. This newer instruction changes the student-answer gate, not scientific approval, personal-fatwa boundaries, or access to existing private administrator drafts. Verified answers still require the separate source and evaluation checks.

The user explicitly rejected reference-excerpt answers and detailed source displays in the student assistant, asking for AI-generated explanations of the actual question instead.

**Why:** They repeated that they wanted generated explanations after receiving bibliographic excerpt blocks rather than an explanation.

**How to apply:** Generate a direct educational explanation for student questions, using book and passage identity internally. Do not substitute reference-only output or show source/page/edition lists by default. Keep a concise automated/unreviewed warning and preserve private administrator experiments and scientific review requirements separately.

Resolve an explicitly numbered matn entry from the study text before asking the model to explain it, even in unverified-answer mode.

**Why:** A live model response confidently identified the wrong hadith as the first Nawawi hadith when no reference text was supplied. A warning about unverified answers does not prevent this identity error.

The same problem occurred with the first principle of الأصول الثلاثة when the model received only the selected book title. A book title alone is not enough to ensure the model knows the book's structure.

**How to apply:** Supply the selected entry as reference data, keep its review status explicit, and never substitute the model's recollection for known passage identity. For additional books, establish at least their basic topic structure from an actual reference rather than assume a selector alone improves answer accuracy.

Student-facing explanations must use Arabic throughout, including hadith terminology, without English words or asterisk formatting.

**Why:** The user repeated the Arabic-only requirement after receiving an explanation containing “motives”, and explicitly rejected asterisks around headings.

**How to apply:** Use plain Arabic paragraphs and headings, not Markdown emphasis or star bullets. Enforce the language boundary on generated text rather than relying on the prompt alone. Language clarity does not replace commentary grounding or scientific review.

Hadith explanation requests should receive an in-depth, accessible lesson by default, not just a short meaning and one example.

**Why:** The user explicitly asked for deeper generated explanations after receiving the short intentions-hadith answer.

**How to apply:** Explain important terms and phrases, their relationships, lessons, practical examples and misunderstandings. Depth should add reasoning, not repetition. Preserve Arabic-only plain text, no source lists by default, the unreviewed warning and personal-fatwa boundaries. Honor an explicit request for a shorter answer.

For Nawawi explanations, the user chose short source excerpts with their references rather than model-written simplified explanations.

**Why:** Unrestricted answers were unclear and insufficiently grounded; the user explicitly selected direct excerpts after comparing both approaches.

**How to apply:** Preserve the distinction between the commentator's actual words, electronic-transcription verification, and platform scientific approval. Never substitute generated prose when the requested excerpt cannot be retrieved, or infer full-book reuse clearance from this choice. The user explicitly rejected mandatory hadith numbers: identify an entry from its wording or recognized title when possible, and clarify ambiguity instead of guessing.

NVIDIA transport timeouts can be transient even when configuration is valid.

**Why:** Repeated deadline expirations were followed by a successful fast response without replacing the credential or model. Neither configuration presence nor a failed request alone establishes provider availability or Arabic quality.

**How to apply:** Distinguish missing configuration, transport failure and scientific suitability. Use bounded retries for diagnostic generation; do not switch providers, change credentials, or score scientific quality from a timeout.