// These are synthetic lifecycle tests, NOT evidence of speech-recognition accuracy.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RecitationRecorderController, MAX_RECORDING_BYTES, MAX_RECORDING_SECONDS } from '../src/lib/recitation-recorder.ts';

function fixture(options = {}) {
  let time = 0;
  let timer = null;
  let stoppedTracks = 0;
  const revoked = [];
  const blobs = [];
  const track = { stop() { stoppedTracks++; }, onended: null };
  const stream = { getTracks: () => [track] };
  const recorder = {
    state: 'inactive', mimeType: 'audio/webm',
    ondataavailable: null, onstop: null, onerror: null,
    start() { this.state = 'recording'; },
    stop() {
      this.state = 'inactive';
      const callback = this.onstop;
      queueMicrotask(() => callback?.());
    },
  };
  const controller = new RecitationRecorderController({
    supported: true,
    getUserMedia: async () => stream,
    createRecorder: () => recorder,
    createUrl: (blob) => { blobs.push(blob); return `blob:test-${blobs.length}`; },
    revokeUrl: (url) => revoked.push(url),
    now: () => time,
    setInterval: (callback) => { timer = callback; return 1; },
    clearInterval: () => { timer = null; },
    ...options,
  });
  return {
    controller, recorder, stream, track, revoked, blobs,
    tracksStopped: () => stoppedTracks,
    chunk: (size = 10) => recorder.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) }),
    tick: (seconds) => { time = seconds * 1000; timer?.(); },
  };
}

test('record, stop, play, and discard revoke audio and close the microphone', async () => {
  const f = fixture();
  await f.controller.start();
  assert.equal(f.controller.getSnapshot().status, 'recording');
  f.chunk();
  f.tick(2);
  f.controller.stop();
  assert.equal(f.controller.getSnapshot().status, 'stopping');
  assert.ok(f.tracksStopped() > 0, 'stop closes capture immediately');
  await Promise.resolve();
  assert.equal(f.controller.getSnapshot().status, 'ready');
  assert.equal(f.controller.getSnapshot().seconds, 2);
  assert.equal(f.blobs[0].size, 10);
  f.controller.discard();
  assert.deepEqual(f.revoked, ['blob:test-1']);
  assert.equal(f.controller.getSnapshot().audioUrl, null);
});

test('a late permission grant after cancellation closes tracks and never starts capture', async () => {
  let grant;
  const f = fixture({ getUserMedia: () => new Promise((resolve) => { grant = resolve; }) });
  const start = f.controller.start();
  assert.equal(f.controller.getSnapshot().status, 'requesting');
  f.controller.discard();
  grant(f.stream);
  await start;
  assert.equal(f.controller.getSnapshot().status, 'idle');
  assert.equal(f.recorder.state, 'inactive');
  assert.equal(f.tracksStopped(), 1);
});

test('a late permission failure cannot overwrite a newer state', async () => {
  let reject;
  const f = fixture({ getUserMedia: () => new Promise((_, fail) => { reject = fail; }) });
  const start = f.controller.start();
  f.controller.discard();
  reject(new Error('cancelled permission'));
  await start;
  assert.equal(f.controller.getSnapshot().status, 'idle');
});

test('denied permission gives an explicit error without opening the microphone', async () => {
  const error = new Error('denied');
  error.name = 'NotAllowedError';
  const f = fixture({ getUserMedia: async () => { throw error; } });
  await f.controller.start();
  assert.equal(f.controller.getSnapshot().status, 'error');
  assert.match(f.controller.getSnapshot().error, /لم يُسمح/);
  assert.equal(f.tracksStopped(), 0);
});

test('unsupported browsers fail explicitly', async () => {
  const f = fixture({ supported: false });
  await f.controller.start();
  assert.equal(f.controller.getSnapshot().status, 'error');
  assert.equal(f.controller.getSnapshot().supported, false);
});

test('the recording duration limit stops automatically', async () => {
  const f = fixture();
  await f.controller.start();
  f.chunk();
  f.tick(MAX_RECORDING_SECONDS);
  await Promise.resolve();
  assert.equal(f.controller.getSnapshot().status, 'ready');
  assert.equal(f.controller.getSnapshot().seconds, MAX_RECORDING_SECONDS);
  assert.ok(f.tracksStopped() > 0);
});

test('an oversized recording is discarded, not offered for playback', async () => {
  const f = fixture();
  await f.controller.start();
  f.chunk(MAX_RECORDING_BYTES + 1);
  await Promise.resolve();
  assert.equal(f.controller.getSnapshot().status, 'error');
  assert.equal(f.blobs.length, 0);
  assert.equal(f.controller.getSnapshot().audioUrl, null);
  assert.ok(f.tracksStopped() > 0);
});

test('missing audio data produces a technical error, never a grade', async () => {
  const f = fixture();
  await f.controller.start();
  f.controller.stop();
  await Promise.resolve();
  assert.equal(f.controller.getSnapshot().status, 'error');
  assert.equal(f.blobs.length, 0);
});

test('microphone disconnection discards incomplete audio', async () => {
  const f = fixture();
  await f.controller.start();
  f.chunk();
  f.track.onended();
  await Promise.resolve();
  assert.equal(f.controller.getSnapshot().status, 'error');
  assert.equal(f.blobs.length, 0);
  assert.ok(f.tracksStopped() > 0);
});

test('navigation discard prevents an already queued stop from recreating audio', async () => {
  const f = fixture();
  await f.controller.start();
  f.chunk();
  f.controller.stop();
  f.controller.discard();
  await Promise.resolve();
  assert.equal(f.controller.getSnapshot().status, 'idle');
  assert.equal(f.blobs.length, 0);
});

test('concurrent start clicks never request a second microphone stream', async () => {
  let requests = 0;
  let grant;
  const f = fixture({ getUserMedia: () => { requests++; return new Promise((resolve) => { grant = resolve; }); } });
  const start = f.controller.start();
  await f.controller.start();
  assert.equal(requests, 1);
  grant(f.stream);
  await start;
  f.controller.discard();
});
test('ready snapshot exposes the Blob; discard clears it and revokes the URL', async () => {
  const f = fixture();
  await f.controller.start();
  f.chunk(7);
  f.tick(1);
  f.controller.stop();
  await Promise.resolve();
  const s = f.controller.getSnapshot();
  assert.ok(s.blob instanceof Blob);
  assert.equal(s.blob.size, 7);
  f.controller.discard();
  assert.equal(f.controller.getSnapshot().blob, null);
  assert.deepEqual(f.revoked, ['blob:test-1']);
});

test('blob is never exposed while recording or after an error', async () => {
  const f = fixture();
  await f.controller.start();
  assert.equal(f.controller.getSnapshot().blob, null);
  f.chunk(MAX_RECORDING_BYTES + 1);
  assert.equal(f.controller.getSnapshot().status, 'error');
  assert.equal(f.controller.getSnapshot().blob, null);
});
