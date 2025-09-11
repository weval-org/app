import { StreamingParser } from './streaming-parser';

describe('StreamingParser', () => {
  it('should parse a complete USER_RESPONSE chunk correctly', () => {
    const parser = new StreamingParser();
    const chunk = '<USER_RESPONSE>Hello, user!</USER_RESPONSE>';
    const result = parser.ingest(chunk);
    expect(result.visibleContent).toBe('Hello, user!');
  });

  it('should parse a complete SYSTEM_INSTRUCTIONS chunk correctly', () => {
    const parser = new StreamingParser();
    const chunk = '<SYSTEM_INSTRUCTIONS>{"command":"NO_OP"}</SYSTEM_INSTRUCTIONS>';
    const result = parser.ingest(chunk);
    expect(result.systemInstructions).toEqual({ command: 'NO_OP' });
  });

  it('should handle a stream with both USER_RESPONSE and SYSTEM_INSTRUCTIONS', () => {
    const parser = new StreamingParser();
    const chunk = '<USER_RESPONSE>Thinking...</USER_RESPONSE><SYSTEM_INSTRUCTIONS>{"command":"CREATE_OUTLINE", "payload": {"summary":"test"}}</SYSTEM_INSTRUCTIONS>';
    const result = parser.ingest(chunk);
    expect(result.visibleContent).toBe('Thinking...');
    expect(result.systemInstructions).toEqual({ command: 'CREATE_OUTLINE', payload: { summary: 'test' } });
  });

  it('should handle streaming chunks for USER_RESPONSE', () => {
    const parser = new StreamingParser();
    parser.ingest('<USER_RESPONSE>Hel');
    parser.ingest('lo, ');
    const finalResult = parser.ingest('user!</USER_RESPONSE>');
    expect(finalResult.visibleContent).toBe('Hello, user!');
  });

  it('should handle streaming chunks for SYSTEM_INSTRUCTIONS', () => {
    const parser = new StreamingParser();
    parser.ingest('<SYSTEM_INSTRUCTIONS>{"com');
    parser.ingest('mand":"NO_OP"}</SYSTEM_INSTRUCTIONS>');
    const result = parser.finalize();
    expect(result.systemInstructions).toEqual({ command: 'NO_OP' });
  });

  it('should set an error for malformed JSON in SYSTEM_INSTRUCTIONS', () => {
    const parser = new StreamingParser();
    const chunk = '<SYSTEM_INSTRUCTIONS>{"command":</SYSTEM_INSTRUCTIONS>';
    const result = parser.ingest(chunk);
    expect(result.systemInstructions).toBeNull();
    expect(result.streamError).not.toBeNull();
  });

  it('should ignore content outside of recognized tags', () => {
    const parser = new StreamingParser();
    const chunk = 'Some ignored text <USER_RESPONSE>Visible</USER_RESPONSE> more ignored text.';
    parser.ingest(chunk);
    const result = parser.finalize();
    expect(result.visibleContent).toBe('Visible');
  });

  it('should accumulate content from multiple USER_RESPONSE blocks', () => {
    const parser = new StreamingParser();
    parser.ingest('<USER_RESPONSE>Part 1.</USER_RESPONSE>');
    parser.ingest('<USER_RESPONSE> Part 2.</USER_RESPONSE>');
    const result = parser.finalize();
    expect(result.visibleContent).toBe('Part 1. Part 2.');
  });
  
  it('should extract CTAs from within a USER_RESPONSE block', () => {
    const parser = new StreamingParser();
    const chunk = '<USER_RESPONSE>Click here: <cta>Action 1</cta> or <cta>Action 2</cta></USER_RESPONSE>';
    const result = parser.ingest(chunk);
    
    // The parser now extracts CTAs and also adds the clean text to visibleContent
    expect(result.ctas).toEqual(['Action 1', 'Action 2']);
    // The visible content should now be clean of the tags
    expect(result.visibleContent).toBe('Click here: Action 1 or Action 2');
  });
});
