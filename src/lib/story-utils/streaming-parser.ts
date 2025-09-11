import { ControlSignal, CONTROL_PATTERNS } from './control-signals';

export type ParsedStreamResult = {
  visibleContent: string;
  ctas: string[];
  systemInstructions: object | null;
  streamError: string | null;
};

export class StreamingParser {
  private buffer = '';
  private result: ParsedStreamResult = {
    visibleContent: '',
    ctas: [],
    systemInstructions: null,
    streamError: null,
  };

  private readonly controlTags: string[];

  constructor() {
    this.controlTags = Object.keys(CONTROL_PATTERNS);
  }

  // Ingest a new chunk from the stream
  public ingest(chunk: string): ParsedStreamResult {
    this.buffer += chunk;
    this.processBuffer();
    return { ...this.result };
  }

  // Finalize and get the complete result
  public finalize(): ParsedStreamResult {
    // Unlike before, we don't flush the buffer to visibleContent.
    // Any remaining buffer content is considered unprocessed/malformed.
    if (this.buffer.trim()) {
        console.warn(`[StreamingParser] Finalizing with non-empty buffer: "${this.buffer}"`);
    }
    return { ...this.result };
  }

  // Process the buffer to extract tags and content
  private processBuffer() {
    let loop = true;
    while (loop) {
      const match = this.findNextTag(this.buffer);
      if (!match) {
        loop = false;
        continue;
      }

      const { tag, content, endIndex } = match;

      // The old parser added text *between* tags to visibleContent.
      // The new parser only adds content from *within* a USER_RESPONSE tag.
      // So, we just process the tag and then slice the buffer.
      this.processTag(tag, content);
      
      this.buffer = this.buffer.substring(endIndex);
    }
  }

  // Find the next valid control tag in the buffer
  private findNextTag(text: string) {
    let firstMatch = null;

    for (const tagName of this.controlTags) {
        const pattern = CONTROL_PATTERNS[tagName as ControlSignal];
        // Create a fresh regex to avoid state issues with /g flag
        const regex = new RegExp(pattern.source, pattern.flags.replace('g', ''));
        const match = text.match(regex);
        
        if (match && (firstMatch === null || match.index! < firstMatch.startIndex)) {
            firstMatch = {
                tag: tagName,
                content: match[1] || '', // The captured group
                startIndex: match.index!,
                endIndex: match.index! + match[0].length,
            };
        }
    }
    return firstMatch;
  }
  
  // Handle the logic for a matched tag
  private processTag(tag: string, content: string) {
    switch (tag as ControlSignal) {
      case 'USER_RESPONSE':
        this.processUserResponse(content);
        break;

      case 'SYSTEM_INSTRUCTIONS':
        try {
          this.result.systemInstructions = JSON.parse(content);
        } catch (e) {
          console.error('[StreamingParser] Failed to parse system instructions JSON:', content, e);
          this.result.streamError = 'Failed to parse system instructions.';
        }
        break;
      
      case 'CTA':
        if (content.trim()) {
          this.result.ctas.push(content.trim());
        }
        break;
    }
  }

  // Special handler for USER_RESPONSE to process nested tags like CTAs
  private processUserResponse(content: string) {
    let lastIndex = 0;
    // Ensure we create a new RegExp object to reset its state for each call
    const ctaPattern = new RegExp(CONTROL_PATTERNS.CTA.source, CONTROL_PATTERNS.CTA.flags);
    let match;

    while ((match = ctaPattern.exec(content)) !== null) {
      // Add the text between the last match and this one
      this.result.visibleContent += content.substring(lastIndex, match.index);
      
      const ctaText = match[1] || '';
      if (ctaText.trim()) {
        this.result.ctas.push(ctaText.trim());
      }
      
      // Add the clean CTA text to the visible content
      this.result.visibleContent += ctaText;

      lastIndex = ctaPattern.lastIndex;
    }

    // Add any remaining text after the last match
    if (lastIndex < content.length) {
      this.result.visibleContent += content.substring(lastIndex);
    }
  }
}
