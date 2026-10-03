/**
 * One consented sample, one provider call. This produces an experimental
 * transcript, never a student grade or a claim of recognition accuracy.
 *
 * From the workspace root:
 * pnpm --filter @workspace/scripts exec node src/transcribe-recitation-sample.mjs \
 *   --audio ../../attached_assets/sample.mp3 --consent-confirmed
 *
 * Requires OPENAI_API_KEY in Replit Secrets. Never pass a key on the command line.
 */
import OpenAI, { toFile } from 'openai';
import { parseArgs } from 'node:util';
import { readFile, realpath, stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 10 * 1024 * 1024;
const MODEL = 'gpt-4o-mini-transcribe';
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputDir = resolve(workspaceRoot, 'deliverables/recitation');

async function main() {
  const { values } = parseArgs({
    options: {
      audio: { type: 'string' },
      'consent-confirmed': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!values.audio || !values['consent-confirmed']) {
    throw new Error('Provide --audio and --consent-confirmed only after permission for external transcription testing is confirmed.');
  }
  const allowedDirectory = await realpath(resolve(workspaceRoot, 'attached_assets'));
  const audioPath = await realpath(resolve(values.audio));
  if (!audioPath.startsWith(`${allowedDirectory}${sep}`)) {
    throw new Error('The sample must be a local file inside attached_assets.');
  }
  const metadata = await stat(audioPath);
  if (!metadata.isFile() || metadata.size < 12 || metadata.size > MAX_BYTES) {
    throw new Error('The audio must be a nonempty file of at most 10 MiB.');
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is missing. Configure it through Replit Secrets, not chat or command-line arguments.');
  const bytes = await readFile(audioPath);
  if (bytes.length > MAX_BYTES) throw new Error('The file exceeded the size limit while reading.');
  const isMp3 = bytes.subarray(0, 3).toString('ascii') === 'ID3' ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (!isMp3) throw new Error('This experiment accepts MP3 samples only; the file signature does not match.');

  const client = new OpenAI({ apiKey: key, timeout: 60000, maxRetries: 0 });
  const start = performance.now();
  const response = await client.audio.transcriptions.create({
    file: await toFile(bytes, 'consented-recitation-sample.mp3', { type: 'audio/mpeg' }),
    model: MODEL,
    language: 'ar',
    // Deliberately no canonical answer prompt, to avoid encouraging completion.
    response_format: 'json',
  });
  const elapsedMs = Math.round(performance.now() - start);
  if (typeof response.text !== 'string' || !response.text.trim() || response.text.length > 20000) {
    throw new Error('The provider returned no usable transcript. No assessment result was generated.');
  }
  const evidence = {
    kind: 'experimental_transcription_only',
    recordedAt: new Date().toISOString(),
    consent: {
      operatorConfirmed: true,
      purpose: 'External speech-recognition testing only; no public redistribution permission inferred.',
    },
    provider: 'OpenAI',
    model: MODEL,
    settings: { language: 'ar', canonicalAnswerHintSent: false, maxRetries: 0 },
    sampleSha256: createHash('sha256').update(bytes).digest('hex'),
    sampleBytes: bytes.length,
    elapsedMs,
    transcript: response.text,
    independentlyReviewedGroundTruth: null,
    wordErrorRate: null,
    studentScore: null,
    releaseApproved: false,
    limitations: [
      'One recording is not provider calibration.',
      'No independently reviewed verbatim transcript is available.',
      'Substitution/omission samples, diverse readers, noise and interruption cases remain necessary.',
      'An experimental transcript does not authorize grading, progression or scheduled reviews.',
    ],
  };
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `openai-sample-${evidence.sampleSha256.slice(0, 12)}-${Date.now()}.json`);
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: 'transcribed_not_graded', model: MODEL, elapsedMs, outputPath }));
}

main().catch((error) => {
  // Do not log provider error payloads, authorization headers, or secret values.
  if (error instanceof OpenAI.APIError) {
    console.error(`Transcription request failed (HTTP ${error.status ?? 'unknown'}). No result or grade was generated.`);
  } else {
    console.error(error instanceof Error ? error.message : 'The transcription experiment failed.');
  }
  process.exitCode = 1;
});