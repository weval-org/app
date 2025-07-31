import { jest } from '@jest/globals';
import {
  validatePrompts,
  validateRoleAlternation,
  resolveModelCollections,
} from './run-config';
import { ComparisonConfig } from '../types/cli_types';
import fs from 'fs/promises';

// Mock the fs/promises module
jest.mock('fs/promises');
const mockedFs = jest.mocked(fs);

// Mock logger to prevent console output during tests and to spy on its methods
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('run-config validation logic', () => {
  beforeEach(() => {
    // Clear mock history before each test
    jest.clearAllMocks();
  });

  describe('validateRoleAlternation', () => {
    it('should not throw for valid, alternating roles', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'How are you?' },
      ];
      expect(() => validateRoleAlternation(messages, 'p1')).not.toThrow();
    });

    it('should throw for two consecutive user messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'Hi' },
      ];
      expect(() => validateRoleAlternation(messages, 'p1')).toThrow(
        "Prompt ID 'p1', message 1: Invalid sequence. Two 'user' messages in a row.",
      );
    });

    it('should throw for two consecutive assistant messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'assistant', content: 'How are you?' },
      ];
      expect(() => validateRoleAlternation(messages, 'p1')).toThrow(
        "Prompt ID 'p1', message 2: Invalid sequence. Two 'assistant' messages in a row.",
      );
    });

    it('should ignore system messages for role alternation checks', () => {
      const messages = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello' },
        { role: 'system', content: 'Another system message' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'How are you?' },
      ];
      expect(() => validateRoleAlternation(messages, 'p1')).not.toThrow();
    });
  });

  describe('validatePrompts', () => {
    it('should convert a valid promptText to a messages array', () => {
      const prompts: ComparisonConfig['prompts'] = [
        { id: 'p1', promptText: 'This is a test' },
      ];
      validatePrompts(prompts, mockLogger as any);
      expect(prompts[0].messages).toEqual([{ role: 'user', content: 'This is a test' }]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Prompt ID 'p1' uses 'promptText'. Converting to 'messages' format for internal processing.",
      );
    });

    it('should pass for a valid messages array', () => {
      const prompts: ComparisonConfig['prompts'] = [
        {
          id: 'p1',
          messages: [{ role: 'user', content: 'Valid message' }],
        },
      ];
      expect(() => validatePrompts(prompts, mockLogger as any)).not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Prompt ID 'p1' uses 'messages' format with 1 messages. Validation passed.",
      );
    });

    it('should throw if a prompt has both promptText and messages', () => {
      const prompts: ComparisonConfig['prompts'] = [
        {
          id: 'p1',
          promptText: 'Some text',
          messages: [{ role: 'user', content: 'A message' }],
        },
      ];
      expect(() => validatePrompts(prompts, mockLogger as any)).toThrow(
        "Prompt ID 'p1' cannot have both 'promptText' and 'messages' defined. Please use 'messages' for multi-turn or 'promptText' for single-turn.",
      );
    });

    it('should throw if a prompt has neither promptText nor messages', () => {
      const prompts: ComparisonConfig['prompts'] = [{ id: 'p1' }];
      expect(() => validatePrompts(prompts, mockLogger as any)).toThrow(
        "Prompt ID 'p1' must have either a valid 'promptText' or a non-empty 'messages' array.",
      );
    });
    
    it('should throw if messages array is empty', () => {
        const prompts: ComparisonConfig['prompts'] = [{ id: 'p1', messages: [] }];
        expect(() => validatePrompts(prompts, mockLogger as any)).toThrow(
          "Prompt ID 'p1' must have either a valid 'promptText' or a non-empty 'messages' array.",
        );
      });

    it('should throw if the first message role is assistant', () => {
      const prompts: ComparisonConfig['prompts'] = [
        {
          id: 'p1',
          messages: [{ role: 'assistant', content: 'I speak first' }],
        },
      ];
      expect(() => validatePrompts(prompts, mockLogger as any)).toThrow(
        "Prompt ID 'p1': First message role cannot be 'assistant'. Must be 'user' or 'system'.",
      );
    });

    it('should throw if the last message role is not user', () => {
      const prompts: ComparisonConfig['prompts'] = [
        {
          id: 'p1',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
          ],
        },
      ];
      expect(() => validatePrompts(prompts, mockLogger as any)).toThrow(
        "Prompt ID 'p1': Last message role in the input sequence must be 'user'. Found 'assistant'.",
      );
    });

    it('should throw for an invalid role in messages', () => {
      const prompts: ComparisonConfig['prompts'] = [
        {
          id: 'p1',
          messages: [{ role: 'invalid-role', content: 'A message' }, { role: 'user', content: '...' }] as any,
        },
      ];
      expect(() => validatePrompts(prompts, mockLogger as any)).toThrow(
        "Prompt ID 'p1', message 0: Invalid role 'invalid-role'. Must be 'user', 'assistant', or 'system'.",
      );
    });

    it('should throw for empty content in a message', () => {
      const prompts: ComparisonConfig['prompts'] = [
        {
          id: 'p1',
          messages: [{ role: 'user', content: '  ' }],
        },
      ];
      expect(() => validatePrompts(prompts, mockLogger as any)).toThrow(
        "Prompt ID 'p1', message 0 (role 'user'): Content cannot be empty.",
      );
    });
  });

  describe('resolveModelCollections', () => {
    it('should return literal models when no collections path is provided', async () => {
      const models = ['openai:gpt-4o-mini', 'anthropic:claude-3-haiku-20240307'];
      const result = await resolveModelCollections(models, undefined, mockLogger as any);
      expect(result).toEqual(models);
    });

    it('should resolve a collection placeholder from a file', async () => {
      const models = ['TEST_COLLECTION'];
      const collectionsRepoPath = '/fake/repo';
      const collectionContent = JSON.stringify(['google:gemini-1.5-flash-latest']);
      
      mockedFs.readFile.mockResolvedValue(collectionContent);

      const result = await resolveModelCollections(models, collectionsRepoPath, mockLogger as any);
      
      expect(mockedFs.readFile).toHaveBeenCalledWith('/fake/repo/models/TEST_COLLECTION.json', 'utf-8');
      expect(result).toEqual(['google:gemini-1.5-flash-latest']);
    });

    it('should handle a mix of literal models and collection placeholders', async () => {
        const models = ['openai:gpt-4o-mini', 'TEST_COLLECTION'];
        const collectionsRepoPath = '/fake/repo';
        const collectionContent = JSON.stringify(['google:gemini-1.5-flash-latest']);
        
        mockedFs.readFile.mockResolvedValue(collectionContent);
  
        const result = await resolveModelCollections(models, collectionsRepoPath, mockLogger as any);
        
        expect(result).toEqual(['openai:gpt-4o-mini', 'google:gemini-1.5-flash-latest']);
      });

    it('should throw an error if a collection file is not found', async () => {
        const models = ['MISSING_COLLECTION'];
        const collectionsRepoPath = '/fake/repo';
        
        const error = new Error('File not found') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockedFs.readFile.mockRejectedValue(error);
  
        await expect(resolveModelCollections(models, collectionsRepoPath, mockLogger as any)).rejects.toThrow(
            "Model collection file not found for placeholder 'MISSING_COLLECTION' at expected path: /fake/repo/models/MISSING_COLLECTION.json"
        );
      });

      it('should throw an error for malformed collection JSON', async () => {
        const models = ['BAD_COLLECTION'];
        const collectionsRepoPath = '/fake/repo';
        const collectionContent = '{"model": "not-an-array"}'; // Invalid format
        
        mockedFs.readFile.mockResolvedValue(collectionContent);
  
        await expect(resolveModelCollections(models, collectionsRepoPath, mockLogger as any)).rejects.toThrow(
            "Invalid format for local model collection 'BAD_COLLECTION' at /fake/repo/models/BAD_COLLECTION.json. Expected a JSON array of strings."
        );
      });

      it('should deduplicate models from multiple collections and literals', async () => {
        const models = ['openai:gpt-4o-mini', 'COLLECTION_A', 'COLLECTION_B'];
        const collectionsRepoPath = '/fake/repo';
        
        const collectionA = JSON.stringify(['openai:gpt-4o-mini', 'google:gemini-1.5-flash-latest']);
        const collectionB = JSON.stringify(['anthropic:claude-3-haiku-20240307', 'google:gemini-1.5-flash-latest']);
        
        mockedFs.readFile
            .mockResolvedValueOnce(collectionA)
            .mockResolvedValueOnce(collectionB);
  
        const result = await resolveModelCollections(models, collectionsRepoPath, mockLogger as any);
  
        expect(result).toEqual(['openai:gpt-4o-mini', 'google:gemini-1.5-flash-latest', 'anthropic:claude-3-haiku-20240307']);
      });
  });
}); 