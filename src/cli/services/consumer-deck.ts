import type { ComparisonConfig } from '@/cli/types/cli_types';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildDeckXml(config: ComparisonConfig, opts?: { systemPrompt?: string | null }): string {
  const header = [
    '<deck>',
    opts && Object.prototype.hasOwnProperty.call(opts, 'systemPrompt') ? `  <system>${opts.systemPrompt ? escapeXml(String(opts.systemPrompt)) : ''}</system>` : undefined,
    '  <rules>',
    '    Output ONLY one <responses> block containing <response id="...">...</response> per <prompt>.',
    '    Do not add any text before or after the <responses> block.',
    '    Treat each <prompt> independently. Do not carry information across prompts.',
    '    Return the final assistant answer only. No prefaces or explanations.',
    '  </rules>'
  ].filter(Boolean).join('\n');

  const body = (config.prompts || []).map(p => {
    const messages = (p.messages || []).map(m => {
      const role = escapeXml(String(m.role));
      const content = m.content === null || m.content === undefined ? '' : escapeXml(String(m.content));
      return `      <message>\n        <role>${role}</role>\n        <content>${content}</content>\n      </message>`;
    }).join('\n');
    const system = (p as any).system ? `\n    <system>${escapeXml(String((p as any).system))}</system>` : '';
    return [
      `  <prompt id="${escapeXml(p.id)}">`,
      system,
      '    <messages>',
      messages,
      '    </messages>',
      '  </prompt>'
    ].join('\n');
  }).join('\n');

  const footer = '</deck>';
  return `${header}\n${body}\n${footer}\n`;
}

export function parseResponsesXml(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml) return map;
  // Tolerant single-pass parsing using regex; IDs must be unique.
  const responsesBlockMatch = xml.match(/<responses[\s\S]*?>[\s\S]*<\/responses>/i);
  const block = responsesBlockMatch ? responsesBlockMatch[0] : xml;
  const re = /<response\s+id="([^"]+)">([\s\S]*?)<\/response>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const id = m[1].trim();
    const content = m[2].trim();
    map.set(id, content);
  }
  return map;
}

export function validateResponses(expectedIds: string[], found: Map<string, string>): { ok: boolean; missing: string[]; extra: string[] } {
  const expected = new Set(expectedIds);
  const missing: string[] = [];
  expectedIds.forEach(id => { if (!found.has(id)) missing.push(id); });
  const extra: string[] = [];
  Array.from(found.keys()).forEach(id => { if (!expected.has(id)) extra.push(id); });
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}


