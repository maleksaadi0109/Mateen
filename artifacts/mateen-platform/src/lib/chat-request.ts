// Bound the entire operation, including obtaining an auth token. A fetch-only
// deadline cannot release the composer if a step before fetch stops responding.
export async function boundedChatRequest<T>(
  send: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 70_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('Chat response deadline exceeded', 'TimeoutError');
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => send(controller.signal)), deadline]);
  } finally {
    clearTimeout(timer);
  }
}