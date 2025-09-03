import { buildDeckXml, parseResponsesXml, validateResponses } from '../consumer-deck';

describe('consumer-deck utilities', () => {
  const config: any = {
    id: 'cfg',
    prompts: [
      { id: 'p1', messages: [{ role: 'user', content: 'Hi' }] },
      { id: 'p2', messages: [{ role: 'user', content: 'Bye' }] },
    ],
  };

  it('buildDeckXml inserts global <system> when provided', () => {
    const xml = buildDeckXml(config, { systemPrompt: 'be bold' });
    expect(xml).toContain('<system>be bold</system>');
    expect(xml).toContain('<prompt id="p1">');
    expect(xml).toContain('<prompt id="p2">');
  });

  it('parseResponsesXml extracts id→text map', () => {
    const resp = `<responses>\n  <response id="p1">A</response>\n  <response id="p2">B</response>\n</responses>`;
    const map = parseResponsesXml(resp);
    expect(map.get('p1')).toBe('A');
    expect(map.get('p2')).toBe('B');
  });

  it('validateResponses finds missing and extra ids', () => {
    const resp = `<responses>\n  <response id="p1">A</response>\n  <response id="px">X</response>\n</responses>`;
    const map = parseResponsesXml(resp);
    const v = validateResponses(['p1', 'p2'], map);
    expect(v.ok).toBe(false);
    expect(v.missing).toEqual(['p2']);
    expect(v.extra).toEqual(['px']);
  });
});


