/**
 * ConflictResolver Unit Tests
 * 
 * Tests for conflict detection and resolution logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictResolver } from '@realtapel/skillpilot-core';
import type { SkillFingerprint } from '@realtapel/skillpilot-core';

// Mock SkillIndex
const mockIndex = {
  getAll: () => [],
  close: () => {}
} as any;

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver(mockIndex);
  });

  describe('resolve', () => {
    it('should return skill as-is if no conflict group', async () => {
      const skill = createMockSkill({
        id: 'github',
        name: 'github',
        conflictGroup: undefined
      });

      const result = await resolver.resolve(skill, 'create issue', [skill]);

      expect(result.skill.id).toBe('github');
      expect(result.conflictResolved).toBe(false);
      expect(result.confidence).toBe(1.0);
    });

    it('should handle errors gracefully', async () => {
      const skill = createMockSkill({
        id: 'github',
        name: 'github'
      });

      // Pass null as allSkills to trigger error handling
      const result = await resolver.resolve(skill, 'test', null as any);

      // Should return safe fallback
      expect(result.skill.id).toBe('github');
      expect(result.confidence).toBe(0.5);
      expect(result.conflictResolved).toBe(false);
    });
  });
});

describe('Context Signal Scoring', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver(mockIndex);
  });

  it('should prefer skills with matching context signals', async () => {
    const github = createMockSkill({
      id: 'github',
      name: 'github',
      conflictGroup: 'git-group',
      keywords: ['write', 'create', 'repository'],
      priority: 8
    });

    const git = createMockSkill({
      id: 'git',
      name: 'git',
      conflictGroup: 'git-group',
      keywords: ['write', 'commit'],
      priority: 5
    });

    const result = await resolver.resolve(github, 'create a new repository', [github, git]);

    // Should prefer github due to higher priority and better keyword match
    expect(result.skill.id).toBe('github');
    expect(result.conflictResolved).toBe(true);
    expect(result.alternatives).toContain('git');
  });

  it('should use word boundary matching for skill names', async () => {
    const github = createMockSkill({
      id: 'github',
      name: 'github',
      conflictGroup: 'git-group',
      keywords: ['github', 'repository'],
      priority: 5
    });

    const git = createMockSkill({
      id: 'git',
      name: 'git',
      conflictGroup: 'git-group',
      keywords: ['git', 'commit'],
      priority: 5
    });

    // "github" should match github, not git (word boundary)
    const result = await resolver.resolve(github, 'create a github issue', [github, git]);
    
    // github should win due to word boundary match bonus
    expect(result.skill.id).toBe('github');
  });
});

// Helper function to create mock skills
function createMockSkill(overrides: Partial<SkillFingerprint> = {}): SkillFingerprint {
  return {
    id: 'test-skill',
    name: 'test-skill',
    description: 'Test skill',
    keywords: [],
    semanticVector: new Array(384).fill(0),
    examples: [],
    manualTriggers: [],
    autoTriggers: [],
    conflictGroup: undefined,
    priority: 5,
    sideEffects: 'read-only',
    preconditions: [],
    feedbackWeight: 1.0,
    ...overrides
  };
}
