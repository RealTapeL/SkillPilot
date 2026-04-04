import { describe, it, expect, beforeAll } from 'vitest';
import { Fingerprinter, ConflictDetector } from '@realtapel/skillpilot-core';
import { LocalEmbedProvider } from '@realtapel/skillpilot-core';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Fingerprinter', () => {
  let fingerprinter: Fingerprinter;

  beforeAll(async () => {
    const embed = new LocalEmbedProvider();
    await embed.initialize();
    fingerprinter = new Fingerprinter(embed);
  });

  it('should fingerprint a skill from SKILL.md', async () => {
    const skillPath = path.join(__dirname, '../fixtures/mock-skills/github');
    const fp = await fingerprinter.fingerprint(skillPath);

    expect(fp.id).toBe('github');
    expect(fp.name).toBe('github');
    expect(fp.description).toContain('GitHub');
    expect(fp.keywords).toContain('github');
    expect(fp.sideEffects).toBe('write-remote');
    expect(fp.priority).toBe(8);
    expect(fp.manualTriggers).toContain('open a PR');
    expect(fp.semanticVector).toBeDefined();
    expect(fp.semanticVector.length).toBeGreaterThan(0);
  });

  it('should extract keywords from multiple skills', async () => {
    const skillPaths = [
      path.join(__dirname, '../fixtures/mock-skills/github'),
      path.join(__dirname, '../fixtures/mock-skills/slack'),
      path.join(__dirname, '../fixtures/mock-skills/file-read')
    ];

    const fingerprints = await fingerprinter.fingerprintBatch(skillPaths);

    expect(fingerprints).toHaveLength(3);
    expect(fingerprints[0].name).toBe('github');
    expect(fingerprints[1].name).toBe('slack');
    expect(fingerprints[2].name).toBe('file-read');
  });
});

describe('ConflictDetector', () => {
  it('should detect similar skills as conflicts', async () => {
    const embed = new LocalEmbedProvider();
    await embed.initialize();
    
    // Create two very similar fingerprints
    const fingerprints = [
      {
        id: 'skill-a',
        name: 'skill-a',
        description: 'A test skill for sending messages',
        semanticVector: await embed.embed('send message notification'),
        intentPatterns: [],
        keywords: ['message', 'send'],
        sideEffects: 'write-remote' as const,
        preconditions: { env: [], bins: [] },
        conflictScore: 0,
        manualTriggers: [],
        priority: 5,
        feedbackWeight: 1,
        sourcePath: '/test/a',
        contentHash: 'hash-a',
        indexedAt: Date.now()
      },
      {
        id: 'skill-b',
        name: 'skill-b',
        description: 'Another skill for sending notifications',
        semanticVector: await embed.embed('send notification message'),
        intentPatterns: [],
        keywords: ['notification', 'send'],
        sideEffects: 'write-remote' as const,
        preconditions: { env: [], bins: [] },
        conflictScore: 0,
        manualTriggers: [],
        priority: 5,
        feedbackWeight: 1,
        sourcePath: '/test/b',
        contentHash: 'hash-b',
        indexedAt: Date.now()
      },
      {
        id: 'skill-c',
        name: 'skill-c',
        description: 'A completely different skill for reading files',
        semanticVector: await embed.embed('read file content'),
        intentPatterns: [],
        keywords: ['read', 'file'],
        sideEffects: 'read-only' as const,
        preconditions: { env: [], bins: [] },
        conflictScore: 0,
        manualTriggers: [],
        priority: 5,
        feedbackWeight: 1,
        sourcePath: '/test/c',
        contentHash: 'hash-c',
        indexedAt: Date.now()
      }
    ];

    const detector = new ConflictDetector(0.8);
    const result = detector.detectConflicts(fingerprints);

    // skill-a and skill-b should be in the same conflict group
    expect(result[0].conflictGroup).toBeDefined();
    expect(result[1].conflictGroup).toBeDefined();
    expect(result[0].conflictGroup).toBe(result[1].conflictGroup);

    // skill-c should not be in a conflict group
    expect(result[2].conflictGroup).toBeUndefined();
  });
});
