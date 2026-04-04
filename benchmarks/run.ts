#!/usr/bin/env node

/**
 * SkillPilot Benchmark Runner
 * 
 * Measures routing accuracy and latency against labeled test data.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  SkillIndex,
  SkillRouter,
  LocalEmbedProvider,
  IndexBuilder,
  Fingerprinter,
  ConflictDetector
} from '@skillpilot/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface BenchmarkResult {
  method: string;
  accuracy: number;
  correctCount: number;
  totalCount: number;
  latency: {
    p50: number;
    p99: number;
  };
  details: Array<{
    query: string;
    expected: string;
    actual: string | null;
    correct: boolean;
    latencyMs: number;
  }>;
}

interface TestIntent {
  query: string;
  expected_skill: string;
  difficulty: 'easy' | 'hard';
}

interface TestSkill {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  sideEffects: string;
}

async function loadTestData(): Promise<{ intents: TestIntent[]; skills: TestSkill[] }> {
  const intentsData = await fs.readFile(
    path.join(__dirname, 'datasets/intents-100.json'),
    'utf-8'
  );
  const skillsData = await fs.readFile(
    path.join(__dirname, 'datasets/skills-50.json'),
    'utf-8'
  );

  return {
    intents: JSON.parse(intentsData).intents,
    skills: JSON.parse(skillsData).skills
  };
}

async function setupTestIndex(skills: TestSkill[]): Promise<SkillIndex> {
  const dataDir = path.join(__dirname, '.benchmark-index');
  
  // Clean up any existing index
  try {
    await fs.rm(dataDir, { recursive: true });
  } catch {}

  const index = new SkillIndex(dataDir);
  const embed = new LocalEmbedProvider();
  await embed.initialize();

  // Create fingerprints for test skills
  const fingerprinter = new Fingerprinter(embed);
  const fingerprints: Awaited<ReturnType<Fingerprinter['fingerprint']>>[] = [];

  for (const skill of skills) {
    // Create a mock SKILL.md content
    const mockContent = `---
name: ${skill.name}
description: ${skill.description}
---

# ${skill.name}

${skill.description}

## Keywords
${skill.keywords.join(', ')}
`;

    // Parse and fingerprint
    const fp = await fingerprinter.fingerprint.mock?.() || {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      semanticVector: await embed.embed(`${skill.name} ${skill.description}`),
      intentPatterns: [],
      keywords: skill.keywords,
      sideEffects: skill.sideEffects as any,
      preconditions: { env: [], bins: [] },
      conflictScore: 0,
      manualTriggers: [],
      priority: 5,
      feedbackWeight: 1.0,
      sourcePath: `/mock/${skill.id}`,
      contentHash: 'mock',
      indexedAt: Date.now()
    };

    fingerprints.push(fp);
  }

  // Detect conflicts
  const detector = new ConflictDetector();
  const withConflicts = detector.detectConflicts(fingerprints);

  // Save to index
  index.saveBatch(withConflicts);

  return index;
}

async function runBenchmark(
  index: SkillIndex,
  intents: TestIntent[]
): Promise<BenchmarkResult> {
  const embed = new LocalEmbedProvider();
  await embed.initialize();

  const router = new SkillRouter(index, embed, {
    hardRouteThreshold: 0.45, // Lower threshold for benchmark
    softInjectThreshold: 0.3,
    enableSemantic: true
  });

  const results: BenchmarkResult['details'] = [];
  const latencies: number[] = [];

  for (const intent of intents) {
    const start = performance.now();
    const result = await router.route(intent.query);
    const latency = performance.now() - start;

    const actualSkillId = result.skill?.id || null;
    const isCorrect = actualSkillId === intent.expected_skill;

    results.push({
      query: intent.query,
      expected: intent.expected_skill,
      actual: actualSkillId,
      correct: isCorrect,
      latencyMs: latency
    });

    latencies.push(latency);
  }

  const correctCount = results.filter(r => r.correct).length;
  latencies.sort((a, b) => a - b);

  return {
    method: 'SkillPilot (full)',
    accuracy: (correctCount / intents.length) * 100,
    correctCount,
    totalCount: intents.length,
    latency: {
      p50: latencies[Math.floor(latencies.length * 0.5)],
      p99: latencies[Math.floor(latencies.length * 0.99)]
    },
    details: results
  };
}

function formatResults(result: BenchmarkResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════╗');
  lines.push('║         SkillPilot Benchmark Results                     ║');
  lines.push('╚══════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Dataset: ${result.totalCount} intents`);
  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`Method:              ${result.method}`);
  lines.push(`Accuracy:            ${result.accuracy.toFixed(1)}% (${result.correctCount}/${result.totalCount})`);
  lines.push(`P50 Latency:         ${result.latency.p50.toFixed(1)}ms`);
  lines.push(`P99 Latency:         ${result.latency.p99.toFixed(1)}ms`);
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('');

  // Show some examples
  lines.push('Sample Results:');
  const samples = result.details.slice(0, 10);
  for (const r of samples) {
    const status = r.correct ? '✓' : '✗';
    const color = r.correct ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    lines.push(`${color}${status}${reset} "${r.query.slice(0, 40)}..." → ${r.actual || 'null'} (expected: ${r.expected})`);
  }

  // Show errors
  const errors = result.details.filter(r => !r.correct);
  if (errors.length > 0) {
    lines.push('');
    lines.push(`Errors (${errors.length} total):`);
    for (const e of errors.slice(0, 5)) {
      lines.push(`  ✗ "${e.query}"`);
      lines.push(`    Expected: ${e.expected}, Got: ${e.actual || 'null'}`);
    }
    if (errors.length > 5) {
      lines.push(`  ... and ${errors.length - 5} more`);
    }
  }

  return lines.join('\n');
}

async function saveResults(result: BenchmarkResult): Promise<void> {
  const outputPath = path.join(__dirname, 'results/latest.json');
  
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ...result
    }, null, 2)
  );
}

async function main(): Promise<void> {
  console.log('SkillPilot Benchmark');
  console.log('====================\n');

  console.log('Loading test data...');
  const { intents, skills } = await loadTestData();
  console.log(`Loaded ${intents.length} intents and ${skills.length} skills\n`);

  console.log('Setting up test index...');
  const index = await setupTestIndex(skills);
  console.log('Index ready\n');

  console.log('Running benchmark...');
  const result = await runBenchmark(index, intents);

  console.log(formatResults(result));

  await saveResults(result);
  console.log(`\nResults saved to benchmarks/results/latest.json`);

  index.close();
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
