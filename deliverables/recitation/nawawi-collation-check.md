# Nawawi saved-source collation — evidence note

**Finding.** The raw-page text is present: `attached_assets/turath-nawawi-source.json` contains 70 saved Turath responses (viewer pages 12–81; printed pages 46–115). The platform JSON and attached comparison JSON each contain 42 numbered records. A read-only comparison of all platform titles, hadith text, and attached attributions against the corresponding complete saved page spans found **40 exact records and two source-only differences**. No platform-only unmatched text was found. This establishes the saved-page collation result only; it does not approve the extraction.

## Reproduce

From the repository root:

```sh
python3 scripts/src/check-nawawi-collation.py
```

The script reads the three JSON files and writes detailed record results, unmatched spans, and direct saved-page API citations to stdout. It exits `0` if all 42 records match, `1` if any differ, and `2` for unusable/missing inputs. **Exit 1 is expected for the currently observed two differences.** It makes no network requests and changes no input files.

## Per-record evidence

Printed page numbers are those embedded in the Turath book metadata; viewer page numbers are API page IDs and are not interchangeable. Links below use Turath viewer-page URLs. The script prints each saved API-page URL for all pages in every span.

| # | Printed page(s) | Viewer page(s) | Result |
|---:|---:|---:|---|
| 1 | 46–47 | [12–13](https://app.turath.io/book/12836?page=12) | Exact |
| 2 | 48–51 | [14–17](https://app.turath.io/book/12836?page=14) | Exact |
| 3 | 52 | [18](https://app.turath.io/book/12836?page=18) | Exact |
| 4 | 53–54 | [19–20](https://app.turath.io/book/12836?page=19) | Exact |
| 5 | 55 | [21](https://app.turath.io/book/12836?page=21) | Exact |
| 6 | 56–57 | [22–23](https://app.turath.io/book/12836?page=22) | Exact |
| 7 | 58 | [24](https://app.turath.io/book/12836?page=24) | Exact |
| 8 | 59 | [25](https://app.turath.io/book/12836?page=25) | Exact |
| 9 | 60 | [26](https://app.turath.io/book/12836?page=26) | Exact |
| 10 | 61–62 | [27–28](https://app.turath.io/book/12836?page=27) | Exact |
| 11 | 63 | [29](https://app.turath.io/book/12836?page=29) | Exact |
| 12 | 64 | [30](https://app.turath.io/book/12836?page=30) | Exact |
| 13 | 65 | [31](https://app.turath.io/book/12836?page=31) | Exact |
| 14 | 66 | [32](https://app.turath.io/book/12836?page=32) | Exact |
| 15 | 67 | [33](https://app.turath.io/book/12836?page=33) | Exact |
| 16 | 68 | [34](https://app.turath.io/book/12836?page=34) | Exact |
| 17 | 69 | [35](https://app.turath.io/book/12836?page=35) | Exact |
| 18 | 70 | [36](https://app.turath.io/book/12836?page=36) | Exact |
| 19 | 71–72 | [37–38](https://app.turath.io/book/12836?page=37) | Exact |
| 20 | 73 | [39](https://app.turath.io/book/12836?page=39) | Exact |
| 21 | 74 | [40](https://app.turath.io/book/12836?page=40) | Exact |
| 22 | 75–76 | [41–42](https://app.turath.io/book/12836?page=41) | **Source-only span** |
| 23 | 77–78 | [43–44](https://app.turath.io/book/12836?page=43) | Exact |
| 24 | 79–82 | [45–48](https://app.turath.io/book/12836?page=45) | Exact |
| 25 | 83–84 | [49–50](https://app.turath.io/book/12836?page=49) | Exact |
| 26 | 85–86 | [51–52](https://app.turath.io/book/12836?page=51) | Exact |
| 27 | 87–88 | [53–54](https://app.turath.io/book/12836?page=53) | Exact |
| 28 | 89–90 | [55–56](https://app.turath.io/book/12836?page=55) | Exact |
| 29 | 91–93 | [57–59](https://app.turath.io/book/12836?page=57) | Exact |
| 30 | 94–95 | [60–61](https://app.turath.io/book/12836?page=60) | Exact |
| 31 | 96 | [62](https://app.turath.io/book/12836?page=62) | Exact |
| 32 | 97–98 | [63–64](https://app.turath.io/book/12836?page=63) | Exact |
| 33 | 99 | [65](https://app.turath.io/book/12836?page=65) | Exact |
| 34 | 100 | [66](https://app.turath.io/book/12836?page=66) | Exact |
| 35 | 101–102 | [67–68](https://app.turath.io/book/12836?page=67) | Exact |
| 36 | 103–104 | [69–70](https://app.turath.io/book/12836?page=69) | Exact |
| 37 | 105–107 | [71–73](https://app.turath.io/book/12836?page=71) | **Source-only span** |
| 38 | 108–109 | [74–75](https://app.turath.io/book/12836?page=74) | Exact |
| 39 | 110 | [76](https://app.turath.io/book/12836?page=76) | Exact |
| 40 | 111–112 | [77–78](https://app.turath.io/book/12836?page=77) | Exact |
| 41 | 113 | [79](https://app.turath.io/book/12836?page=79) | Exact |
| 42 | 114–115 | [80–81](https://app.turath.io/book/12836?page=80) | Exact |

### Unmatched material and editorial boundary

- **Hadith 22, printed pp. 75–76 / viewer pp. 41–42:** the source-only wording is `ومعنى حرمت الحرام: اجتنبته، ومعنى أحللت الحلال: فعلته معتقدًا حله.` This is explanatory gloss following the hadith and attribution, present in the saved original-page span but absent from the platform record.
- **Hadith 37, printed pp. 105–107 / viewer pp. 71–73:** after the hadith and attribution, the saved pages continue with commentary beginning `فانظر يا أخي وفقنا الله وإياك إلى عظيم لطف الله تعالى، وتأمل هذه الألفاظ...` and extending through the remaining commentary on viewer pages 72–73. It is absent from the platform record.

These are source-only page-area additions, not platform-only text. They flag editorial/commentary material within the numbered-entry page ranges and require an editor to decide extraction boundaries; the script does not silently treat the additions as hadith text or silently discard the warning.

## Method and limits

The standard-library script assigns every saved printed page from each hadith's printed start through the page before the next hadith start, so multi-page text and attributions are included. It checks the title span separately. It removes HTML markup, decodes HTML entities, and collapses whitespace runs only. It does **not** normalize Arabic spelling, diacritics, punctuation, or wording. A sequence diff reports unmatched source-only and platform-only spans. Direct page response URLs, printed-page references, viewer IDs, and the supplied Turath viewer URL are retained as distinct citation systems.

This is a deterministic comparison of the saved JSON snapshot, not a verification against a live site, scan, or independent edition. It cannot determine whether all source-page content was saved, adjudicate textual variants or editorial boundaries, or establish specialist approval. Review of the original does not itself approve this platform extraction. No legal reuse permission is established here; public access is not a license.