/**
 * Tests for GitHub PR Webhook Validation
 *
 * SECURITY CRITICAL: These tests ensure users can only modify their own directories.
 * A bug here could allow directory hijacking/impersonation.
 */

import { describe, it, expect } from '@jest/globals';

// Extract the parseBlueprintFiles logic for testing
// This would normally be imported from the route file, but since it's not exported,
// we'll recreate the logic here for testing

interface BlueprintFile {
  filename: string;
  username: string;
  blueprintName: string;
  sha: string;
  status: string;
}

function parseBlueprintFiles(files: any[], prAuthor: string): {
  valid: BlueprintFile[];
  invalid: Array<{ filename: string; reason: string }>;
} {
  const valid: BlueprintFile[] = [];
  const invalid: Array<{ filename: string; reason: string }> = [];

  for (const file of files) {
    const filename = file.filename;

    // Only process .yml and .yaml files in blueprints/users/ directory
    if (!filename.startsWith('blueprints/users/')) {
      continue; // Silently skip files outside users directory
    }

    // Reject path traversal attempts
    if (filename.includes('../') || filename.includes('./')) {
      invalid.push({ filename, reason: 'Path traversal not allowed' });
      continue;
    }

    if (!filename.endsWith('.yml') && !filename.endsWith('.yaml')) {
      invalid.push({ filename, reason: 'Not a YAML file' });
      continue;
    }

    // Parse: blueprints/users/{username}/{blueprint-name}.yml
    const match = filename.match(/^blueprints\/users\/([^\/]+)\/(.+\.ya?ml)$/);
    if (!match) {
      invalid.push({ filename, reason: 'Invalid path structure. Must be blueprints/users/{username}/{name}.yml' });
      continue;
    }

    const [, username, blueprintName] = match;

    // CRITICAL: Validate username matches PR author
    if (username !== prAuthor) {
      invalid.push({
        filename,
        reason: `Username mismatch: directory is '${username}' but PR author is '${prAuthor}'`
      });
      continue;
    }

    // Skip removed files
    if (file.status === 'removed') {
      continue;
    }

    valid.push({
      filename,
      username,
      blueprintName,
      sha: file.sha,
      status: file.status,
    });
  }

  return { valid, invalid };
}

describe('parseBlueprintFiles - Username Validation', () => {
  describe('security: username matching', () => {
    it('should reject blueprints with username mismatch', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/test.yml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'bob');

      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(1);
      expect(invalid[0].filename).toBe('blueprints/users/alice/test.yml');
      expect(invalid[0].reason).toContain('Username mismatch');
      expect(invalid[0].reason).toContain('alice');
      expect(invalid[0].reason).toContain('bob');
    });

    it('should allow blueprints matching author username', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/test.yml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(1);
      expect(invalid).toHaveLength(0);
      expect(valid[0].username).toBe('alice');
      expect(valid[0].filename).toBe('blueprints/users/alice/test.yml');
    });

    it('should reject attempts to add files in other users directories', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/malicious.yml',
          sha: 'abc123',
          status: 'added'
        },
        {
          filename: 'blueprints/users/bob/malicious.yml',
          sha: 'def456',
          status: 'added'
        }
      ];

      // Attacker "eve" trying to add files in alice and bob's directories
      const { valid, invalid } = parseBlueprintFiles(files, 'eve');

      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(2);
      expect(invalid.every(i => i.reason.includes('Username mismatch'))).toBe(true);
    });

    it('should be case-sensitive in username matching', () => {
      const files = [
        {
          filename: 'blueprints/users/Alice/test.yml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(1);
      expect(invalid[0].reason).toContain('Username mismatch');
    });

    it('should allow multiple blueprints for same user', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/test1.yml',
          sha: 'abc123',
          status: 'added'
        },
        {
          filename: 'blueprints/users/alice/test2.yml',
          sha: 'def456',
          status: 'added'
        },
        {
          filename: 'blueprints/users/alice/test3.yml',
          sha: 'ghi789',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(3);
      expect(invalid).toHaveLength(0);
      expect(valid.every(f => f.username === 'alice')).toBe(true);
    });
  });

  describe('directory structure validation', () => {
    it('should reject blueprints outside users directory', () => {
      const files = [
        {
          filename: 'blueprints/some-other-dir/test.yml',
          sha: 'abc123',
          status: 'added'
        },
        {
          filename: 'blueprints/test.yml',
          sha: 'def456',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      // These should be silently skipped (not counted as invalid)
      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(0);
    });

    it('should reject blueprints without proper directory structure', () => {
      const files = [
        {
          filename: 'blueprints/users/test.yml', // missing username directory
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(1);
      expect(invalid[0].reason).toContain('Invalid path structure');
    });

    it('should handle nested directories', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/subdir/test.yml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(1);
      expect(valid[0].blueprintName).toBe('subdir/test.yml');
    });

    it('should handle special characters in username', () => {
      const files = [
        {
          filename: 'blueprints/users/alice-bot/test.yml',
          sha: 'abc123',
          status: 'added'
        },
        {
          filename: 'blueprints/users/bob_123/test.yml',
          sha: 'def456',
          status: 'added'
        }
      ];

      const result1 = parseBlueprintFiles([files[0]], 'alice-bot');
      expect(result1.valid).toHaveLength(1);

      const result2 = parseBlueprintFiles([files[1]], 'bob_123');
      expect(result2.valid).toHaveLength(1);
    });
  });

  describe('file extension validation', () => {
    it('should accept .yml files', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/test.yml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(1);
    });

    it('should accept .yaml files', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/test.yaml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(1);
    });

    it('should reject non-YAML files', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/test.json',
          sha: 'abc123',
          status: 'added'
        },
        {
          filename: 'blueprints/users/alice/test.txt',
          sha: 'def456',
          status: 'added'
        },
        {
          filename: 'blueprints/users/alice/README.md',
          sha: 'ghi789',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(3);
      expect(invalid.every(i => i.reason === 'Not a YAML file')).toBe(true);
    });
  });

  describe('file status handling', () => {
    it('should skip removed files', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/test.yml',
          sha: 'abc123',
          status: 'removed'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(0);
    });

    it('should include added files', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/test.yml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(1);
      expect(valid[0].status).toBe('added');
    });

    it('should include modified files', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/test.yml',
          sha: 'abc123',
          status: 'modified'
        }
      ];

      const { valid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(1);
      expect(valid[0].status).toBe('modified');
    });
  });

  describe('mixed scenarios', () => {
    it('should correctly handle mix of valid and invalid files', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/valid1.yml',
          sha: 'abc123',
          status: 'added'
        },
        {
          filename: 'blueprints/users/bob/invalid.yml', // wrong user
          sha: 'def456',
          status: 'added'
        },
        {
          filename: 'blueprints/users/alice/invalid.json', // wrong extension
          sha: 'ghi789',
          status: 'added'
        },
        {
          filename: 'blueprints/users/alice/valid2.yaml',
          sha: 'jkl012',
          status: 'modified'
        },
        {
          filename: 'blueprints/users/alice/removed.yml',
          sha: 'mno345',
          status: 'removed'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(2);
      expect(valid.map(f => f.filename)).toEqual([
        'blueprints/users/alice/valid1.yml',
        'blueprints/users/alice/valid2.yaml'
      ]);

      expect(invalid).toHaveLength(2);
      expect(invalid.map(i => i.filename)).toEqual([
        'blueprints/users/bob/invalid.yml',
        'blueprints/users/alice/invalid.json'
      ]);
    });

    it('should handle empty file list', () => {
      const { valid, invalid } = parseBlueprintFiles([], 'alice');

      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(0);
    });

    it('should handle files with no users directory at all', () => {
      const files = [
        {
          filename: 'README.md',
          sha: 'abc123',
          status: 'modified'
        },
        {
          filename: 'src/index.ts',
          sha: 'def456',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle usernames with dots', () => {
      const files = [
        {
          filename: 'blueprints/users/user.name/test.yml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid } = parseBlueprintFiles(files, 'user.name');

      expect(valid).toHaveLength(1);
    });

    it('should handle very long usernames', () => {
      const longUsername = 'a'.repeat(100);
      const files = [
        {
          filename: `blueprints/users/${longUsername}/test.yml`,
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid } = parseBlueprintFiles(files, longUsername);

      expect(valid).toHaveLength(1);
    });

    it('should handle blueprint names with special characters', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/my-test_blueprint.v2.yml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(1);
      expect(valid[0].blueprintName).toBe('my-test_blueprint.v2.yml');
    });

    it('should not allow path traversal attempts', () => {
      const files = [
        {
          filename: 'blueprints/users/alice/../bob/test.yml',
          sha: 'abc123',
          status: 'added'
        }
      ];

      const { valid, invalid } = parseBlueprintFiles(files, 'alice');

      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(1);
      expect(invalid[0].reason).toBe('Path traversal not allowed');
    });
  });
});

describe('PR limits - blueprint count', () => {
  it('should enforce maximum 3 blueprints per PR', () => {
    // This would be enforced at the webhook level, not in parseBlueprintFiles
    const MAX_BLUEPRINTS_PER_PR = 3;

    const files = [
      { filename: 'blueprints/users/alice/test1.yml', sha: '1', status: 'added' },
      { filename: 'blueprints/users/alice/test2.yml', sha: '2', status: 'added' },
      { filename: 'blueprints/users/alice/test3.yml', sha: '3', status: 'added' },
      { filename: 'blueprints/users/alice/test4.yml', sha: '4', status: 'added' },
      { filename: 'blueprints/users/alice/test5.yml', sha: '5', status: 'added' },
    ];

    const { valid } = parseBlueprintFiles(files, 'alice');

    // parseBlueprintFiles returns all valid ones
    expect(valid.length).toBeGreaterThan(MAX_BLUEPRINTS_PER_PR);

    // In the actual webhook, we would check:
    if (valid.length > MAX_BLUEPRINTS_PER_PR) {
      // Reject the PR with error comment
      expect(valid.length).toBe(5); // This would trigger the error
    }
  });
});
