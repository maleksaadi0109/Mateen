import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tabSessionId, nextSequence, questionsVisible, loadDraft, saveDraft, clearDraft, mutationIdFor } from '../src/lib/assessment.ts';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('session UUID is stable within a tab and distinct across tabs', () => {
  let n = 0; const uuid = () => `id-${++n}`;
  const a = mem(), b = mem();
  assert.equal(tabSessionId(a, uuid), tabSessionId(a, uuid));
  assert.notEqual(tabSessionId(a, uuid), tabSessionId(b, uuid));
});
test('sequence follows the server acknowledgement', () => {
  assert.equal(nextSequence({ answerSequence: 0 }), 1);
  assert.equal(nextSequence({ answerSequence: 4 }), 5);
});
test('retries reuse the mutation id; edits get a new one', () => {
  let n = 0; const uuid = () => `m-${++n}`; const c = new Map();
  assert.equal(mutationIdFor(c, 1, 'x', uuid), mutationIdFor(c, 1, 'x', uuid));
  assert.notEqual(mutationIdFor(c, 1, 'x', uuid), mutationIdFor(c, 1, 'y', uuid));
  assert.notEqual(mutationIdFor(c, 1, 'x', uuid), mutationIdFor(c, 2, 'x', uuid));
});
test('draft restores local text over server text and clears after ack', () => {
  const s = mem();
  assert.equal(loadDraft(s, 'a', 'q', 'server'), 'server');
  assert.equal(loadDraft(s, 'a', 'q', null), '');
  saveDraft(s, 'a', 'q', 'local');
  assert.equal(loadDraft(s, 'a', 'q', 'server'), 'local');
  clearDraft(s, 'a', 'q');
  assert.equal(loadDraft(s, 'a', 'q', 'server'), 'server');
});
test('questions hidden when disconnected, paused, offline or not in progress', () => {
  assert.equal(questionsVisible('in_progress', false, true), true);
  assert.equal(questionsVisible('in_progress', true, true), false);
  assert.equal(questionsVisible('in_progress', false, false), false);
  assert.equal(questionsVisible('paused_connection', false, true), false);
  assert.equal(questionsVisible('submitted', false, true), false);
});

import { claimAssessmentStorage } from '../src/lib/assessment.ts';
const full = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
test('account switch and sign-out purge drafts and lease', () => {
  const l = full(), s = full();
  claimAssessmentStorage('u1', l, s);
  saveDraft(l, 'a', 'q', 'secret'); tabSessionId(s, () => 'lease');
  claimAssessmentStorage('u1', l, s);
  assert.equal(loadDraft(l, 'a', 'q', null), 'secret');
  claimAssessmentStorage('u2', l, s);
  assert.equal(loadDraft(l, 'a', 'q', null), '');
  assert.equal(s.getItem('mateen:exam-session'), null);
  saveDraft(l, 'a', 'q', 'x'); claimAssessmentStorage(null, l, s);
  assert.equal(loadDraft(l, 'a', 'q', null), '');
});

import { sessionRequest } from '../src/lib/assessment.ts';
test('session header helper carries the tab lease id', () => {
  assert.deepEqual(sessionRequest('lease-1'), { headers: { 'X-Assessment-Session': 'lease-1' } });
});

import { clampCursor, resolveCursor } from '../src/lib/assessment.ts';
test('cursor is zero-based, clamped 0..29, and local wins over stale server', () => {
  assert.equal(clampCursor(-3, 30), 0);
  assert.equal(clampCursor(99, 30), 29);
  assert.equal(resolveCursor(null, undefined, 30), 0);
  assert.equal(resolveCursor(null, 7, 30), 7);
  assert.equal(resolveCursor(12, 3, 30), 12);
  assert.equal(resolveCursor(0, 20, 30), 0);
});
