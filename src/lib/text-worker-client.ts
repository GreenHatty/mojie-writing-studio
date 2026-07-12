import { inspectText, type InspectTextOptions, type TextIssue } from './text-tools';

export type TextInspectionResult = {
  issues: TextIssue[];
  mode: 'worker' | 'inline';
};

const WORKER_THRESHOLD = 8_000;
const WORKER_TIMEOUT_MS = 8_000;

export async function inspectTextWithoutBlocking(
  text: string,
  options: InspectTextOptions = {}
): Promise<TextInspectionResult> {
  if (text.length < WORKER_THRESHOLD || typeof Worker === 'undefined') {
    return { issues: inspectText(text, options), mode: 'inline' };
  }

  return await new Promise<TextInspectionResult>((resolve) => {
    const worker = new Worker('/text-check-worker.js');
    const id = crypto.randomUUID();
    let settled = false;
    const finish = (result: TextInspectionResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };
    const fallback = () => finish({ issues: inspectText(text, options), mode: 'inline' });
    const timeout = window.setTimeout(fallback, WORKER_TIMEOUT_MS);
    worker.addEventListener('message', (event: MessageEvent<{ id?: string; issues?: TextIssue[]; error?: string }>) => {
      if (event.data?.id !== id) return;
      if (event.data.error || !Array.isArray(event.data.issues)) fallback();
      else finish({ issues: event.data.issues, mode: 'worker' });
    });
    worker.addEventListener('error', fallback, { once: true });
    worker.postMessage({ id, text, options });
  });
}
