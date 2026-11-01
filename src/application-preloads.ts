/** Route code must not compete with the first-visit welcome for bandwidth. */
export function deferApplicationPreloads(html: string): string {
  return html.replaceAll(
    '<link rel="modulepreload"',
    '<link rel="pkspot-modulepreload"',
  );
}

/** Restore Angular's hints immediately before importing the full application. */
export function restoreApplicationPreloads(): void {
  document.querySelectorAll<HTMLLinkElement>('link[rel="pkspot-modulepreload"]')
    .forEach(link => { link.rel = "modulepreload"; });
}
