import { findRepeatedPhrases, inspectText, type InspectTextOptions, type RepeatedPhrase, type RepeatedPhraseOptions, type TextIssue } from './text-tools';

export type TextInspectionResult = {
  issues: TextIssue[];
  repeatedPhrases: RepeatedPhrase[];
  mode: 'worker' | 'inline';
};

const WORKER_THRESHOLD = 8_000;
const WORKER_TIMEOUT_MS = 8_000;

function inlineRepeatedPhrases(text: string, options: RepeatedPhraseOptions): RepeatedPhrase[] {
  return findRepeatedPhrases(text.slice(0, WORKER_THRESHOLD), { ...options, maximumLength: Math.min(options.maximumLength ?? 12, 12) });
}

export async function inspectTextWithoutBlocking(
  text: string,
  options: InspectTextOptions = {},
  repeatedOptions: RepeatedPhraseOptions = {}
): Promise<TextInspectionResult> {
  if (text.length < WORKER_THRESHOLD || typeof Worker === 'undefined') {
    return { issues: inspectText(text, options), repeatedPhrases: inlineRepeatedPhrases(text, repeatedOptions), mode: 'inline' };
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
    const fallback = () => finish({ issues: inspectText(text, options), repeatedPhrases: inlineRepeatedPhrases(text, repeatedOptions), mode: 'inline' });
    const timeout = window.setTimeout(fallback, WORKER_TIMEOUT_MS);
    worker.addEventListener('message', (event: MessageEvent<{ id?: string; issues?: TextIssue[]; repeatedPhrases?: RepeatedPhrase[]; error?: string }>) => {
      if (event.data?.id !== id) return;
      if (event.data.error || !Array.isArray(event.data.issues) || !Array.isArray(event.data.repeatedPhrases)) fallback();
      else finish({ issues: event.data.issues, repeatedPhrases: event.data.repeatedPhrases, mode: 'worker' });
    });
    worker.addEventListener('error', fallback, { once: true });
    worker.postMessage({ id, text, options, repeatedOptions });
  });
}
