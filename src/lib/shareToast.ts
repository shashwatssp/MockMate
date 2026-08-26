import toast from 'react-hot-toast';

/**
 * Clipboard helper with a legacy fallback (execCommand) for older browsers /
 * webviews where the async Clipboard API is unavailable or rejected.
 * Returns true when the text landed on the clipboard.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  } catch {
    return false;
  }
}

/**
 * Post-create share flow: copies the student join link to the clipboard and
 * confirms via toast. If the clipboard is blocked, the full link is kept
 * visible inside the toast so it can still be read out / copied by hand.
 */
export async function shareTestLink(testKey: string): Promise<void> {
  const testLink = `${window.location.origin}/${testKey}`;
  const copied = await copyTextToClipboard(testLink);
  if (copied) {
    toast.success(
      `Test created! Join code ${testKey} — share link copied to your clipboard.`,
      { duration: 6000 },
    );
  } else {
    toast.success(
      `Test created! Share this link (${testKey}): ${testLink}`,
      { duration: 10000 },
    );
  }
}

/** Uniform success toast (replaces informational window.alert calls). */
export function notifySuccess(message: string, durationMs = 5000): void {
  toast.success(message, { duration: durationMs });
}

/** Uniform error toast (replaces blocking window.alert calls). */
export function notifyError(message: string, durationMs = 5000): void {
  toast.error(message, { duration: durationMs });
}
