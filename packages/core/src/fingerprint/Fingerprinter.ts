/**
 * Skill Fingerprinter
 * 
 * Automatically generates skill fingerprints from SKILL.md files.
 * Zero configuration required - just install the skill and it can be routed.
 */

import * as path from 'path';
import * as crypto from 'crypto';
import { EmbedProvider } from '../embed/EmbedProvider.js';
import { parseSkillMd, ParsedSkill, SkillMeta } from './SkillParser.js';

export interface SkillFingerprint {
  id: string;
  name: string;
  description: string;

  // Auto-generated routing signals
  semanticVector: number[];          // Full text semantic embedding
  intentPatterns: string[];          // Auto-extracted intent patterns
  keywords: string[];                // High-frequency keywords

  // Side effect classification (affects routing decision)
  sideEffects: 'read-only' | 'write-local' | 'write-remote' | 'network';

  // Preconditions (not met = weight reduction)
  preconditions: {
    env: string[];                   // Required environment variables
    bins: string[];                  // Required external commands
  };

  // Conflict detection
  conflictGroup?: string;            // Functional overlap group ID
  conflictScore: number;             // Max similarity with other skills in group

  // Manual override (from SKILL.md frontmatter route: field)
  manualTriggers: string[];
  priority: number;

  // Feedback weight (self-learning, initial value 1.0)
  feedbackWeight: number;

  // Metadata
  sourcePath: string;
  contentHash: string;               // For detecting SKILL.md changes
  indexedAt: number;
}

export class Fingerprinter {
  constructor(private embed: EmbedProvider) {}

  async fingerprint(skillPath: string): Promise<SkillFingerprint> {
    const { raw, meta } = await parseSkillMd(skillPath);

    // 1. Semantic vector: embedding of name + description + first 500 chars
    const embedText = [
      meta.name,
      meta.description,
      raw.slice(0, 500)
    ].join('\n');
    const semanticVector = await this.embed.embed(embedText);

    // 2. Intent patterns: extract "Use when..." / "Triggered by..." patterns
    const intentPatterns = extractIntentPatterns(raw);

    // 3. Keywords: high-frequency nouns
    const keywords = extractKeywords(raw, meta.description);

    // 4. Side effect classification: infer from requires.bins and description verbs
    const sideEffects = classifySideEffects(raw, meta);

    // 5. Manual override: parse route: field from SKILL.md frontmatter
    const manualTriggers = meta.route?.triggers ?? [];
    const priority = meta.route?.priority ?? 5;

    return {
      id: meta.name ?? path.basename(path.dirname(skillPath)),
      name: meta.name ?? '',
      description: meta.description ?? '',
      semanticVector,
      intentPatterns,
      keywords,
      sideEffects,
      preconditions: {
        env: meta.requires?.env ?? [],
        bins: meta.requires?.bins ?? []
      },
      conflictGroup: undefined,      // Filled by ConflictDetector
      conflictScore: 0,
      manualTriggers,
      priority,
      feedbackWeight: 1.0,
      sourcePath: skillPath,
      contentHash: hashContent(raw),
      indexedAt: Date.now()
    };
  }

  async fingerprintBatch(skillPaths: string[]): Promise<SkillFingerprint[]> {
    const fingerprints: SkillFingerprint[] = [];
    for (const path of skillPaths) {
      try {
        fingerprints.push(await this.fingerprint(path));
      } catch (err) {
        console.warn(`Failed to fingerprint ${path}:`, err);
      }
    }
    return fingerprints;
  }
}

// Extract intent patterns from content
// Matches "Use when...", "Triggered by...", "Invoke this skill when...", etc.
function extractIntentPatterns(text: string): string[] {
  const patterns: string[] = [];
  const regex = /(?:use when|triggered by|invoke (?:this )?(?:skill )?when|call when)\s+(.+?)(?:\.|$)/gim;
  for (const match of text.matchAll(regex)) {
    patterns.push(match[1].trim());
  }
  return patterns.slice(0, 10);
}

// Extract high-frequency keywords from text
function extractKeywords(text: string, description?: string): string[] {
  const combined = `${description || ''} ${text}`.toLowerCase();
  
  // Common technical keywords to track
  const techKeywords = [
    'github', 'git', 'repository', 'issue', 'pr', 'commit', 'branch', 'merge',
    'slack', 'discord', 'telegram', 'email', 'notification', 'message',
    'file', 'directory', 'path', 'content', 'read', 'write', 'edit',
    'database', 'db', 'query', 'sql', 'api', 'http', 'request', 'response',
    'server', 'client', 'web', 'url', 'endpoint', 'json', 'xml',
    'test', 'build', 'deploy', 'ci', 'cd', 'pipeline',
    'docker', 'container', 'kubernetes', 'k8s',
    'aws', 'gcp', 'azure', 'cloud',
    'python', 'javascript', 'typescript', 'go', 'rust', 'java',
    'create', 'delete', 'update', 'get', 'list', 'search', 'find'
  ];

  const found = techKeywords.filter(kw => combined.includes(kw));
  return [...new Set(found)].slice(0, 20);
}

// Classify side effects based on text content
function classifySideEffects(text: string, meta: SkillMeta): SkillFingerprint['sideEffects'] {
  // Check manual override first
  if (meta.route?.side_effects) {
    return meta.route.side_effects;
  }

  const ltext = text.toLowerCase();
  
  // Write operations
  if (/\b(write|create|delete|update|post|send|push|commit|add|remove|modify)\b/.test(ltext)) {
    if (/\b(github|slack|email|telegram|api|http|remote|server|upload)\b/.test(ltext)) {
      return 'write-remote';
    }
    return 'write-local';
  }
  
  // Network operations (read-only)
  if (/\b(fetch|request|download|search|browse|get|pull|clone)\b/.test(ltext)) {
    return 'network';
  }
  
  return 'read-only';
}

// Hash content for change detection
function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}
