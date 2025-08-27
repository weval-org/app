export type Role = 'system' | 'user' | 'assistant';

export interface TrieNode {
  id: string;
  role: Role;
  text: string;
  blueprintSources?: string[];
  modelBases?: string[];
  children: TrieNode[];
}

export function normalizeText(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function nodeKey(role: Role, text: string): string {
  return `${role}::${normalizeText(text)}`;
}

export function createNode(role: Role, text: string): TrieNode {
  return {
    id: `${role}:${Math.random().toString(36).slice(2, 10)}`,
    role,
    text,
    children: [],
  };
}

export function insertPath(root: TrieNode, messages: Array<{ role: Role; content: string }>, sourcePromptId?: string) {
  let cursor = root;
  for (const m of messages) {
    const key = nodeKey(m.role, m.content);
    let child = cursor.children.find((c) => nodeKey(c.role, c.text) === key);
    if (!child) {
      child = createNode(m.role, m.content);
      cursor.children.push(child);
    }
    if (sourcePromptId) {
      child.blueprintSources = Array.from(new Set([...(child.blueprintSources || []), sourcePromptId]));
    }
    cursor = child;
  }
}

export function attachAssistantForks(
  root: TrieNode,
  parentPath: Array<{ role: Role; content: string }>,
  assistantTexts: Array<{ text: string; baseModel: string }>,
  sourcePromptId: string
) {
  let cursor = root;
  for (const m of parentPath) {
    const key = nodeKey(m.role, m.content);
    const child = cursor.children.find((c) => nodeKey(c.role, c.text) === key);
    if (!child) return;
    cursor = child;
  }
  for (const a of assistantTexts) {
    const key = nodeKey('assistant', a.text);
    let child = cursor.children.find((c) => nodeKey(c.role, c.text) === key);
    if (!child) {
      child = createNode('assistant', a.text);
      cursor.children.push(child);
    }
    child.blueprintSources = Array.from(new Set([...(child.blueprintSources || []), sourcePromptId]));
    child.modelBases = Array.from(new Set([...(child.modelBases || []), a.baseModel]));
  }
}


