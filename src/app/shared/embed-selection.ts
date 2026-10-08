export interface EmbedReference {
  kind: 'spot' | 'event' | 'community';
  /** Community references use the public slug; other references use record IDs. */
  id: string;
}

export function parseEmbedReferences(value: string | null): EmbedReference[] {
  if (!value || value.length > 4000) return [];
  try {
    const items: unknown = JSON.parse(value);
    if (!Array.isArray(items) || items.length > 10) return [];
    const valid = items.filter((item): item is EmbedReference =>
      item !== null && typeof item === 'object' &&
      ['spot', 'event', 'community'].includes(item.kind) &&
      typeof item.id === 'string' && /^[\w:.-]{1,160}$/.test(item.id));
    if (valid.length !== items.length) return [];
    return [...new Map(valid.map(item => [`${item.kind}:${item.id}`, item])).values()];
  } catch { return []; }
}

export function embedSelectionQuery(items: EmbedReference[], showMap = true): string {
  return new URLSearchParams({ refs: JSON.stringify(items), showMap: String(showMap) }).toString();
}
