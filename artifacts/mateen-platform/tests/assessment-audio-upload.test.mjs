import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createAssessmentAudioUpload } from '../src/lib/assessment-audio-upload.ts';

// Real HTTP failures exercise the client protocol without creating student
// grades, recording a person, or storing files in the application database.
async function fixture(t, failure) {
  const counts = { allocate: 0, put: 0, confirm: 0, cancel: 0 };
  const sequences = [];
  const uploadPaths = [];
  let allocation = null;
  let base;
  let clock = Date.now();
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/allocate') {
      counts.allocate++;
      sequences.push(JSON.parse(Buffer.concat(chunks)).sequence);
      allocation ??= { uploadUrl: `${base}/upload?key=${counts.allocate}`, expiresAt: new Date(clock + 10_000).toISOString() };
      if (failure === 'allocation' && counts.allocate === 1) return res.destroy();
      return res.end(JSON.stringify(allocation));
    }
    if (req.url.startsWith('/upload?')) {
      counts.put++;
      uploadPaths.push(req.url);
      if ((failure === 'put' || failure === 'expired') && counts.put === 1) {
        res.statusCode = 503;
        return res.end('{}');
      }
      assert.equal(Buffer.concat(chunks).toString(), 'synthetic private audio');
      return res.end('{}');
    }
    if (req.url === '/confirm') {
      counts.confirm++;
      sequences.push(JSON.parse(Buffer.concat(chunks)).sequence);
      if (failure === 'confirmation' && counts.confirm === 1) return res.destroy();
      return res.end(JSON.stringify({ acknowledged: failure !== 'no-ack' || counts.confirm > 1 }));
    }
    if (req.url === '/cancel') {
      counts.cancel++;
      allocation = null;
      return res.end('{}');
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const post = async (path, sequence) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify({ sequence }) });
    if (!response.ok) throw new Error('HTTP failure');
    return response.json();
  };
  const blob = new Blob(['synthetic private audio'], { type: 'audio/webm' });
  const operations = {
    blob, sequence: 7,
    allocate: (sequence) => post('/allocate', sequence),
    put: async (up, audio) => {
      const response = await fetch(up.uploadUrl, { method: 'PUT', body: audio });
      if (!response.ok) throw new Error('HTTP PUT failure');
    },
    confirm: (sequence) => post('/confirm', sequence),
    cancel: () => post('/cancel', 7),
    now: () => clock,
  };
  return { counts, sequences, uploadPaths, operations, advance: () => { clock += 10_001; } };
}

test('failed HTTP PUT retries the same allocation immediately', async (t) => {
  const f = await fixture(t, 'put');
  const flow = createAssessmentAudioUpload();
  await assert.rejects(flow.send(f.operations));
  assert.equal(flow.hasPending(), true);
  assert.equal((await flow.send(f.operations)).acknowledged, true);
  assert.deepEqual(f.counts, { allocate: 1, put: 2, confirm: 1, cancel: 0 });
  assert.equal(f.uploadPaths[0], f.uploadPaths[1]);
  assert.equal(flow.hasPending(), false);
});

test('lost confirmation acknowledgement retries confirmation, not allocation or PUT', async (t) => {
  const f = await fixture(t, 'confirmation');
  const flow = createAssessmentAudioUpload();
  await assert.rejects(flow.send(f.operations));
  assert.equal((await flow.send({ ...f.operations, sequence: 8 })).acknowledged, true);
  assert.deepEqual(f.counts, { allocate: 1, put: 1, confirm: 2, cancel: 0 });
  assert.deepEqual(f.sequences, [7, 7, 7]);
});

test('lost allocation response reuses the original sequence', async (t) => {
  const f = await fixture(t, 'allocation');
  const flow = createAssessmentAudioUpload();
  await assert.rejects(flow.send(f.operations));
  await flow.send({
    ...f.operations, sequence: 8,
    allocate: () => { throw new Error('A rerender must not change the original allocation metadata.'); },
  });
  assert.deepEqual(f.sequences, [7, 7, 7]);
  assert.deepEqual(f.counts, { allocate: 2, put: 1, confirm: 1, cancel: 0 });
});

test('a negative confirmation does not discard local recovery state', async (t) => {
  const f = await fixture(t, 'no-ack');
  const flow = createAssessmentAudioUpload();
  assert.equal((await flow.send(f.operations)).acknowledged, false);
  assert.equal(flow.hasPending(), true);
  await flow.send(f.operations);
  assert.deepEqual(f.counts, { allocate: 1, put: 1, confirm: 2, cancel: 0 });
});

test('expired failed PUT cancels old allocation before requesting another', async (t) => {
  const f = await fixture(t, 'expired');
  const flow = createAssessmentAudioUpload();
  await assert.rejects(flow.send(f.operations));
  f.advance();
  await flow.send(f.operations);
  assert.deepEqual(f.counts, { allocate: 2, put: 2, confirm: 1, cancel: 1 });
  assert.notEqual(f.uploadPaths[0], f.uploadPaths[1]);
});

test('concurrent sends share one in-flight HTTP operation', async (t) => {
  const f = await fixture(t);
  const flow = createAssessmentAudioUpload();
  const first = flow.send(f.operations);
  assert.equal(flow.send(f.operations), first);
  await first;
  assert.deepEqual(f.counts, { allocate: 1, put: 1, confirm: 1, cancel: 0 });
});

test('a replacement recording requires explicit cancellation of the old allocation', async (t) => {
  const f = await fixture(t, 'put');
  const flow = createAssessmentAudioUpload();
  await assert.rejects(flow.send(f.operations));
  await assert.rejects(flow.send({ ...f.operations, blob: new Blob(['different']) }), /ألغِ/);
  assert.equal(f.counts.allocate, 1);
  await f.operations.cancel();
  flow.reset();
  assert.equal(flow.hasPending(), false);
});