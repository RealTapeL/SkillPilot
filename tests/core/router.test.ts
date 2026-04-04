import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  SkillIndex,
  SkillRouter,
  FastRouter,
  SemanticRouter,
  ConflictResolver,
  LocalEmbedProvider,
  Fingerprinter,
  ConflictDetector
} from '@skillpilot/core';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('FastRouter', () => {
  let fastRouter: FastRouter;
  let fingerprints: Awaited<ReturnType<Fingerprinter['fingerprint']>>[];

  beforeAll(async () => {
    fastRouter = new FastRouter();
    
    const embed = new LocalEmbedProvider();
    await embed.initialize();
    const fingerprinter = new Fingerprinter(embed);

    const skillPaths = [
      path.join(__dirname, '../fixtures/mock-skills/github'),
      path.join(__dirname, '../fixtures/mock-skills/slack'),
      path.join(__dirname, '../fixtures/mock-skills/file-read')
    ];

    fingerprints = await fingerprinter.fingerprintBatch(skillPaths);
  });

  it('should match by keyword', () => {
    const result = fastRouter.match('create a github issue', fingerprints);

    expect(result).not.toBeNull();
    expect(result?.skill.name).toBe('github');
    expect(result?.matchedKeywords).toContain('github');
  });

  it('should match by manual trigger', () => {
    const result = fastRouter.match('open a PR for my changes', fingerprints);

    expect(result).not.toBeNull();
    expect(result?.skill.name).toBe('github');
    expect(result?.matchedTrigger).toBe('open a PR');
  });

  it('should return null for no match', () => {
    const result = fastRouter.match('something completely unrelated', fingerprints);

    expect(result).toBeNull();
  });
});

describe('SemanticRouter', () => {
  let semanticRouter: SemanticRouter;
  let fingerprints: Awaited<ReturnType<Fingerprinter['fingerprint']>>[];

  beforeAll(async () => {
    const embed = new LocalEmbedProvider();
    await embed.initialize();
    
    semanticRouter = new SemanticRouter(embed);
    
    const fingerprinter = new Fingerprinter(embed);
    const skillPaths = [
      path.join(__dirname, '../fixtures/mock-skills/github'),
      path.join(__dirname, '../fixtures/mock-skills/slack'),
      path.join(__dirname, '../fixtures/mock-skills/file-read')
    ];

    fingerprints = await fingerprinter.fingerprintBatch(skillPaths);
  });

  it('should match semantically similar queries', async () => {
    const result = await semanticRouter.match(
      'I need to create a ticket on GitHub',
      fingerprints
    );

    expect(result).not.toBeNull();
    expect(result?.skill.name).toBe('github');
    expect(result?.confidence).toBeGreaterThan(0.3);
  });

  it('should return top K matches', async () => {
    const results = await semanticRouter.matchTopK(
      'send a message',
      fingerprints,
      3
    );

    expect(results).toHaveLength(3);
    expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
  });
});

describe('SkillRouter Integration', () => {
  let index: SkillIndex;
  let router: SkillRouter;
  const testDataDir = path.join(__dirname, '.test-index');

  beforeAll(async () => {
    // Clean up
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {}

    const embed = new LocalEmbedProvider();
    await embed.initialize();

    index = new SkillIndex(testDataDir);

    // Index test skills
    const fingerprinter = new Fingerprinter(embed);
    const skillPaths = [
      path.join(__dirname, '../fixtures/mock-skills/github'),
      path.join(__dirname, '../fixtures/mock-skills/slack'),
      path.join(__dirname, '../fixtures/mock-skills/file-read')
    ];

    const fingerprints = await fingerprinter.fingerprintBatch(skillPaths);
    const detector = new ConflictDetector();
    const withConflicts = detector.detectConflicts(fingerprints);
    index.saveBatch(withConflicts);

    router = new SkillRouter(index, embed, {
      hardRouteThreshold: 0.45,
      softInjectThreshold: 0.3
    });
  });

  afterAll(() => {
    index.close();
    // Clean up
    fs.rm(testDataDir, { recursive: true }).catch(() => {});
  });

  it('should route GitHub-related queries', async () => {
    const result = await router.route('create a new repository on GitHub');

    expect(result.skill).not.toBeNull();
    expect(result.skill?.name).toBe('github');
    expect(result.latencyMs).toBeLessThan(100);
  });

  it('should route Slack-related queries', async () => {
    const result = await router.route('notify the team on Slack');

    expect(result.skill).not.toBeNull();
    expect(result.skill?.name).toBe('slack');
  });

  it('should include trace when requested', async () => {
    const result = await router.route('open a PR', { trace: true });

    expect(result.trace).toBeDefined();
    expect(result.trace?.fastResult).toBeDefined();
  });

  it('should return no-match for unrelated queries', async () => {
    const result = await router.route('xyz abc 123 unrelated nonsense');

    expect(result.skill).toBeNull();
    expect(result.confidence).toBe(0);
  });
});
