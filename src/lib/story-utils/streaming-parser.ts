import { ControlSignal, CONTROL_PATTERNS } from './control-signals';

export type ParsedStreamResult = {
  visibleContent: string;
  systemInstructions: object | null;
  streamError: string | null;
};

export class StreamingParser {
  private buffer = '';
  private result: ParsedStreamResult = {
    visibleContent: '',
    systemInstructions: null,
    streamError: null,
  };

  private readonly controlTags: string[];
  private hasSeenTags = false; // Track if we've parsed any tags

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
    // Check for incomplete USER_RESPONSE tag and extract its content
    const incompleteUserResponse = this.buffer.match(/<USER_RESPONSE>([\s\S]*)/i);
    if (incompleteUserResponse && incompleteUserResponse[1]) {
      console.warn(`[StreamingParser] Stream ended with incomplete USER_RESPONSE tag, extracting content...`);
      this.result.visibleContent += incompleteUserResponse[1];
      this.buffer = '';
    }

    // Check for incomplete SYSTEM_INSTRUCTIONS tag and extract its content
    const incompleteSystemInstructions = this.buffer.match(/<SYSTEM_INSTRUCTIONS>([\s\S]*)/i);
    if (incompleteSystemInstructions && incompleteSystemInstructions[1]) {
      console.warn(`[StreamingParser] Stream ended with incomplete SYSTEM_INSTRUCTIONS tag, attempting to parse...`);
      try {
        this.result.systemInstructions = JSON.parse(incompleteSystemInstructions[1]);
        this.buffer = '';
      } catch (e) {
        console.error('[StreamingParser] Failed to parse incomplete system instructions:', incompleteSystemInstructions[1], e);
      }
    }

    // If there's remaining buffer content without any control tags, treat it as visible content
    // ONLY if we've never seen any tags (model completely ignored instructions)
    if (this.buffer.trim() && !this.hasSeenTags) {
      // Check if the buffer looks like it might contain control tags (opening tags without closing)
      const hasPartialTag = /<(USER_RESPONSE|SYSTEM_INSTRUCTIONS|STREAM_ERROR)/i.test(this.buffer);

      if (!hasPartialTag) {
        // This is plain text without tags from a model that ignored instructions
        console.warn(`[StreamingParser] No tags seen, treating untagged content as visible: "${this.buffer.slice(0, 100)}..."`);
        this.result.visibleContent += this.buffer;
        this.buffer = '';
      }
    }

    // If we have seen tags, any remaining buffer is ignored (text outside tags)
    if (this.buffer.trim() && this.hasSeenTags) {
      console.warn(`[StreamingParser] Ignoring text outside tags: "${this.buffer.slice(0, 100)}..."`);
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
    this.hasSeenTags = true; // Mark that we've seen at least one tag

    switch (tag as ControlSignal) {
      case 'USER_RESPONSE':
        this.result.visibleContent += content;
        break;

      case 'SYSTEM_INSTRUCTIONS':
        try {
          this.result.systemInstructions = JSON.parse(content);
        } catch (e) {
          console.error('[StreamingParser] Failed to parse system instructions JSON:', content, e);
          this.result.streamError = 'Failed to parse system instructions.';
        }
        break;

      case 'STREAM_ERROR':
        this.result.streamError = content;
        break;
    }
  }
}
