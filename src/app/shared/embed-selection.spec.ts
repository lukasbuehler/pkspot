import { describe, expect, it } from 'vitest';
import { embedSelectionQuery, parseEmbedReferences } from './embed-selection';
describe('public embed selections', () => {
  it('round trips bounded references without allowing paths or arbitrary URLs', () => {
    const refs = [{ kind: 'spot' as const, id: 'spot-123' }, { kind: 'community' as const, id: 'zuerich' }];
    expect(parseEmbedReferences(new URLSearchParams(embedSelectionQuery(refs)).get('refs'))).toEqual(refs);
    expect(parseEmbedReferences(JSON.stringify([{ kind:'spot',id:'../../private'}]))).toEqual([]);
    expect(parseEmbedReferences(JSON.stringify(Array(11).fill(refs[0])))).toEqual([]);
    expect(parseEmbedReferences('{')).toEqual([]);
  });
  it('deduplicates by kind and ID',()=>{
    expect(parseEmbedReferences('[{"kind":"spot","id":"x"},{"kind":"spot","id":"x"},{"kind":"event","id":"x"}]')).toHaveLength(2);
  });
});
