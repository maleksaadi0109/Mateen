#!/usr/bin/env python3
"""Read-only comparison of platform Nawawi records with saved Turath page text."""

from __future__ import annotations

import argparse
import difflib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PLATFORM = ROOT / "artifacts/api-server/src/data/nawawi.json"
DEFAULT_SOURCE = ROOT / "attached_assets/turath-nawawi-source.json"
DEFAULT_COMPANION = ROOT / "attached_assets/nawawi-hadiths.json"


class TextExtractor(HTMLParser):
    """Strip markup while separating title spans from the page body."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_depth = 0
        self.titles: list[str] = []
        self.title_parts: list[str] = []
        self.body_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "span" and dict(attrs).get("data-type") == "title":
            self.title_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "span" and self.title_depth:
            self.title_depth -= 1
            if not self.title_depth:
                self.titles.append("".join(self.title_parts))
                self.title_parts = []

    def handle_data(self, data: str) -> None:
        if self.title_depth:
            self.title_parts.append(data)
        else:
            self.body_parts.append(data)

    def handle_entityref(self, name: str) -> None:
        self.handle_data(html.unescape(f"&{name};"))

    def handle_charref(self, name: str) -> None:
        self.handle_data(html.unescape(f"&#{name};"))


def normalized(text: str) -> str:
    """Normalize whitespace only; spelling, punctuation, and Arabic marks remain."""
    return " ".join(text.split())


def page_text(raw: str) -> tuple[str, list[str]]:
    parser = TextExtractor()
    parser.feed(raw)
    parser.close()
    return normalized("".join(parser.body_parts)), [
        normalized(title) for title in parser.titles
    ]


def load_json(path: Path):
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def unmatched(platform_text: str, source_text: str) -> list[tuple[str, str]]:
    matcher = difflib.SequenceMatcher(a=platform_text, b=source_text, autojunk=False)
    differences = []
    for tag, a_start, a_end, b_start, b_end in matcher.get_opcodes():
        if tag == "equal":
            continue
        if a_start != a_end:
            differences.append(("platform-only", platform_text[a_start:a_end]))
        if b_start != b_end:
            differences.append(("source-only", source_text[b_start:b_end]))
    return differences


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Compare all platform hadith titles/text with the locally saved Turath "
            "page responses. Reads inputs only; prints evidence to stdout."
        )
    )
    parser.add_argument("--platform", type=Path, default=DEFAULT_PLATFORM)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--companion", type=Path, default=DEFAULT_COMPANION)
    args = parser.parse_args()

    try:
        platform_records = load_json(args.platform)
        source = load_json(args.source)
        companion_records = load_json(args.companion)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read collation input: {exc}", file=sys.stderr)
        return 2

    if not isinstance(source, dict) or not isinstance(source.get("pages"), list):
        print(
            "NO RAW PAGE TEXT: source JSON has no pages array; "
            "a fidelity comparison cannot be made.",
            file=sys.stderr,
        )
        return 2

    raw_pages: dict[int, dict] = {}
    printed_by_viewer: dict[int, int] = {}
    for page in source["pages"]:
        response = page.get("response", {})
        raw_text = response.get("text")
        try:
            meta = json.loads(response.get("meta", "{}"))
            printed_page = int(meta["page"])
            viewer_page = int(page["pg"])
        except (TypeError, ValueError, KeyError, json.JSONDecodeError):
            continue
        if isinstance(raw_text, str):
            raw_pages[printed_page] = {
                "viewer_page": viewer_page,
                "url": page.get("url", ""),
                "raw_text": raw_text,
            }
            printed_by_viewer[viewer_page] = printed_page
    if not raw_pages:
        print(
            "NO RAW SOURCE TEXT: the source JSON has no saved page response text; "
            "a fidelity comparison cannot be made.",
            file=sys.stderr,
        )
        return 2

    indexed_viewer_starts = source.get("indexes", {}).get("numbers", {})
    records_by_number = {}
    for record in platform_records:
        number = record.get("number")
        if number in records_by_number:
            print(f"ERROR: duplicate platform hadith number {number}.", file=sys.stderr)
            return 2
        records_by_number[number] = record
    numbers = sorted(records_by_number)
    if numbers != list(range(1, 43)):
        print(
            "ERROR: expected exactly platform hadith numbers 1–42; "
            f"found {numbers!r}.",
            file=sys.stderr,
        )
        return 2

    companion_numbers = sorted(
        record.get("number") for record in companion_records
        if isinstance(record, dict) and isinstance(record.get("number"), int)
    )
    companion_match = companion_numbers == list(range(1, 43))
    print("# Nawawi collation check")
    print(f"Platform records: {len(platform_records)} (numbers 1–42)")
    print(f"Attached companion records: {len(companion_records)}; contiguous 1–42: {companion_match}")
    print(f"Saved source page texts: {len(raw_pages)}")
    print(
        f"Source citation: {source.get('source', {}).get('requestedUrl', 'not recorded')}; "
        f"book {source.get('book', {}).get('id', 'unknown')} "
        f"({source.get('book', {}).get('name', 'unknown')})"
    )
    print(
        "Normalization: HTML markup/entities removed/decoded; title spans compared "
        "separately; Unicode spelling, Arabic diacritics, punctuation, and wording "
        "preserved; whitespace runs collapsed to one space."
    )

    ordered_starts: dict[int, int] = {}
    for number in numbers:
        try:
            ordered_starts[number] = int(records_by_number[number]["sourcePage"])
            indexed_viewer_page = int(indexed_viewer_starts[str(number)])
        except (KeyError, TypeError, ValueError):
            print(
                f"ERROR: record/index has no page citation for hadith {number}.",
                file=sys.stderr,
            )
            return 2
        if printed_by_viewer.get(indexed_viewer_page) != ordered_starts[number]:
            print(
                f"ERROR: page citation mismatch for hadith {number}: "
                "record printed page does not agree with its indexed raw source page.",
                file=sys.stderr,
            )
            return 2
    total_exact = 0
    source_only_count = 0
    platform_only_count = 0
    print("\n## Record evidence")
    for number in numbers:
        record = records_by_number[number]
        start_page = ordered_starts[number]
        end_page = (
            ordered_starts[number + 1] - 1
            if number < 42
            else max(raw_pages, default=start_page)
        )
        selected = [
            (printed, raw_pages[printed])
            for printed in range(start_page, end_page + 1)
            if printed in raw_pages
        ]
        if selected:
            viewer_pages = [str(page["viewer_page"]) for _, page in selected]
            api_pages = [page["url"] for _, page in selected]
            citation = (
                f"printed pp. {start_page}–{end_page}; viewer pg. "
                f"{viewer_pages[0]}–{viewer_pages[-1]}; saved page citations: "
                + ", ".join(api_pages)
            )
        else:
            citation = ""
        missing = [
            page for page in range(start_page, end_page + 1)
            if page not in raw_pages
        ]
        source_body_parts = []
        source_titles = []
        for _, page in selected:
            body, titles = page_text(page["raw_text"])
            source_body_parts.append(body)
            source_titles.extend(titles)
        source_body = normalized(" ".join(source_body_parts))
        source_title = normalized(" ".join(source_titles))
        platform_body = normalized(str(record.get("text", "")))
        platform_title = normalized(str(record.get("title", "")))
        title_ok = platform_title == source_title
        body_ok = platform_body == source_body
        record_ok = title_ok and body_ok and not missing and bool(selected)
        if record_ok:
            total_exact += 1
        page_range = f"{start_page}–{end_page}"
        print(
            f"\n### {number}. {record.get('title', '(untitled)')} — "
            f"{'EXACT after stated normalization' if record_ok else 'DIFFERENCE / INCOMPLETE'}"
        )
        print(f"- Source pages: printed pp. {page_range}; {citation or 'no matching saved page citation'}")
        print(f"- Title: {'match' if title_ok else 'DIFF'}")
        print(f"- Body + attributions across all assigned pages: {'match' if body_ok else 'DIFF'}")
        if missing:
            print(f"- Missing saved printed pages: {', '.join(map(str, missing))}")
        differences = unmatched(platform_body, source_body)
        for kind, text in differences:
            if kind == "source-only":
                source_only_count += 1
            else:
                platform_only_count += 1
            print(f"- Unmatched {kind} span: {text!r}")
        if not title_ok:
            print(
                "- Unmatched title: "
                f"platform={platform_title!r}; source={source_title!r}"
            )
        if record.get("sourcePage") != start_page:
            print(
                f"- Citation warning: record sourcePage={record.get('sourcePage')!r}, "
                f"source index starts at printed page {start_page}."
            )
        if record.get("sourceUrl"):
            expected_viewer = selected[0][1]["viewer_page"] if selected else None
            if expected_viewer is not None and f"page={expected_viewer}" not in record["sourceUrl"]:
                print(f"- Citation warning: record sourceUrl differs from saved viewer pg. {expected_viewer}.")
        if not body_ok:
            print(
                "- Review flag: source-only material may reflect editorial material, "
                "an extraction-boundary issue, or another discrepancy; this script "
                "does not classify it."
            )

    print("\n## Summary")
    print(
        f"Exact records: {total_exact}/42; records with differences or missing pages: "
        f"{42 - total_exact}/42."
    )
    print(
        f"Unmatched spans: {platform_only_count} platform-only, "
        f"{source_only_count} source-only."
    )
    if source_only_count:
        print(
            "Source-only spans are flagged for editorial-contamination review; "
            "their presence is not a finding that they are editorial."
        )
    print(
        "This is a deterministic text comparison of saved files, not human "
        "scholarly review, proof of completeness beyond these saved responses, "
        "or a rights/permission determination."
    )
    return 0 if total_exact == 42 else 1


if __name__ == "__main__":
    raise SystemExit(main())