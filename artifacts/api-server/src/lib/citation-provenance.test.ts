import assert from "node:assert/strict";
import { test } from "node:test";
import { currentCitationStates, publicReferenceUrl } from "./citation-provenance";

test("public references reject storage, private evidence, credentials, arbitrary URLs and signed queries", () => {
  for (const bad of [undefined, "", "javascript:alert(1)", "/api/private", "https://localhost/private",
    "https://aljam3.com.evil.test/ar/3190/7673/5", "https://x:secret@aljam3.com/ar/3190/7673/5",
    "https://aljam3.com/ar/3190/7673/5?token=secret", "https://turath.io/book/1?page=5&signature=secret",
    "https://storage.googleapis.com/private/image", "https://turath.io/book/0"]) {
    assert.equal(publicReferenceUrl(bad), null);
  }
  assert.equal(publicReferenceUrl("https://aljam3.com/ar/3190/7673/5"), "https://aljam3.com/ar/3190/7673/5");
  assert.equal(publicReferenceUrl("https://turath.io/book/1?page=5"), "https://turath.io/book/1?page=5");
});

test("current status compares only documented versions without modifying historical snapshots", () => {
  const citations = [{ sourceId: "s", sourceVersion: "v1" }];
  const snapshot = JSON.stringify(citations);
  assert.equal(currentCitationStates(citations, [{ id: "s", status: "withdrawn", version: "v1" }])[0].state, "withdrawn");
  assert.equal(currentCitationStates(citations, [{ id: "s", status: "indexed", version: "v2" }])[0].versionChanged, true);
  assert.equal(currentCitationStates([{ sourceId: "s" }], [{ id: "s", status: "indexed", version: "v1" }])[0].versionChanged, null);
  assert.equal(currentCitationStates(citations, [])[0].state, "unavailable");
  assert.equal(JSON.stringify(citations), snapshot);
});
