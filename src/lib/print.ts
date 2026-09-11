/**
 * Print helper for the report pages.
 *
 * Waits for fonts to be ready and for two paint frames before invoking the
 * browser print dialog. This avoids printing a half-rendered page, which is a
 * common cause of an empty/corrupt "Save as PDF" file.
 */
export function printPage(): void {
  if (typeof window === 'undefined') return;

  const run = () => window.print();

  const paintAndPrint = () => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(run));
    } else {
      setTimeout(run, 0);
    }
  };

  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready && typeof fonts.ready.then === 'function') {
    fonts.ready.then(paintAndPrint).catch(paintAndPrint);
  } else {
    paintAndPrint();
  }
}
