import { toast } from '../ui/Toast.tsx';

/** Copies text; falls back to a hidden textarea when the Clipboard API is blocked. Always tells the person what happened. */
export async function copyText(text: string, okMessage = 'Copied'): Promise<boolean> {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  if (ok) toast.success(okMessage); else toast.error('Could not copy. Select the text and copy it manually.');
  return ok;
}

/** Absolute URL for an in-app hash link such as '#/p/<id>/list?task=<id>'. */
export function absoluteLink(hash: string): string {
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/** Opens an in-app hash link in a new browser tab (the signed-in session is shared through localStorage). */
export function openInNewTab(hash: string): void {
  const w = window.open(absoluteLink(hash), '_blank', 'noopener,noreferrer');
  if (!w) toast.info('Your browser blocked the new tab. Allow pop-ups for this site.');
}
