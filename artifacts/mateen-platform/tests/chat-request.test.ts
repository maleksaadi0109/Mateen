import assert from 'node:assert/strict';
import { it } from 'node:test';
import { boundedChatRequest } from '../src/lib/chat-request';

it('returns successful replies and propagates provider errors', async () => {
  assert.equal(await boundedChatRequest(async () => 'إجابة', 50), 'إجابة');
  const error = new Error('unavailable');
  await assert.rejects(boundedChatRequest(async () => { throw error; }, 50), error);
});

it('ends waiting even when token acquisition or transport never resolves, without resending', async () => {
  let signal: AbortSignal | undefined;
  let calls = 0;
  await assert.rejects(boundedChatRequest((s) => {
    signal = s;
    calls++;
    return new Promise<never>(() => {});
  }, 10), { name: 'TimeoutError' });
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
  assert.equal(await boundedChatRequest(async () => 'رد لاحق', 50), 'رد لاحق');
});

it('a late response cannot replace the expired request result', async () => {
  let finish!: (value: string) => void;
  const pending = boundedChatRequest(() => new Promise<string>((resolve) => { finish = resolve; }), 10);
  await assert.rejects(pending, { name: 'TimeoutError' });
  finish('رد متأخر');
  await assert.rejects(pending, { name: 'TimeoutError' });
});