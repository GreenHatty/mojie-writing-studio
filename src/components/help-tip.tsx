'use client';

export function HelpTip({ text, label = '功能说明' }: { text: string; label?: string }) {
  return (
    <span aria-label={`查看${label}`} className="help-tip" data-tooltip={text} role="note" tabIndex={0} title={text}>
      <span aria-hidden="true">?</span>
    </span>
  );
}
