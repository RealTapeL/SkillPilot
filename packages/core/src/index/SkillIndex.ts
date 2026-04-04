/**
 * Skill Index
 * 
 * Manages SQLite + vector storage for skill fingerprints.
 * Provides fast lookup and persistence.
 */

import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';
import { ConflictGroup } from '../fingerprint/ConflictDetector.js';

export interface IndexStats {
  totalSkills: number;
  conflictGroups: number;
  lastUpdated: number;
  embedProvider: string;
}

// Database row type (snake_case from SQLite)
interface SkillRow {
  id: string;
  name: string;
  description: string;
  semantic_vector: Buffer;
  intent_patterns: string;
  keywords: string;
  side_effects: string;
  preconditions: string;
  conflict_group: string | null;
  conflict_score: number;
  manual_triggers: string;
  priority: number;
  feedback_weight: number;
  source_path: string;
  content_hash: string;
  indexed_at: number;
}

export class SkillIndex {
  private db: Database.Database;
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    
    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'skills.db');
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    // Skills table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        semantic_vector BLOB,
        intent_patterns TEXT, -- JSON array
        keywords TEXT, -- JSON array
        side_effects TEXT,
        preconditions TEXT, -- JSON
        conflict_group TEXT,
        conflict_score REAL DEFAULT 0,
        manual_triggers TEXT, -- JSON array
        priority INTEGER DEFAULT 5,
        feedback_weight REAL DEFAULT 1.0,
        source_path TEXT,
        content_hash TEXT,
        indexed_at INTEGER
      )
    `);

    // Feedback log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feedback_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT,
        skill_id TEXT,
        signal_type TEXT, -- 'confirmed', 'corrected', 'ignored'
        wrong_skill_id TEXT,
        timestamp INTEGER
      )
    `);

    // Create index on conflict_group
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conflict_group ON skills(conflict_group)
    `);
  }

  /**
   * Load index from skill directories
   */
  static async load(skillDirs: string | string[], dataDir?: string): Promise<SkillIndex> {
    const indexDir = dataDir || path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.skillpilot',
      'index'
    );
    
    return new SkillIndex(indexDir);
  }

  /**
   * Save or update a skill fingerprint
   */
  save(fingerprint: SkillFingerprint): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO skills (
        id, name, description, semantic_vector, intent_patterns, keywords,
        side_effects, preconditions, conflict_group, conflict_score,
        manual_triggers, priority, feedback_weight, source_path, content_hash, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fingerprint.id,
      fingerprint.name,
      fingerprint.description,
      Buffer.from(new Float32Array(fingerprint.semanticVector).buffer),
      JSON.stringify(fingerprint.intentPatterns),
      JSON.stringify(fingerprint.keywords),
      fingerprint.sideEffects,
      JSON.stringify(fingerprint.preconditions),
      fingerprint.conflictGroup,
      fingerprint.conflictScore,
      JSON.stringify(fingerprint.manualTriggers),
      fingerprint.priority,
      fingerprint.feedbackWeight,
      fingerprint.sourcePath,
      fingerprint.contentHash,
      fingerprint.indexedAt
    );
  }

  /**
   * Save multiple fingerprints
   */
  saveBatch(fingerprints: SkillFingerprint[]): void {
    const insert = this.db.transaction((fps: SkillFingerprint[]) => {
      for (const fp of fps) {
        this.save(fp);
      }
    });
    insert(fingerprints);
  }

  /**
   * Get all fingerprints
   */
  getAll(): SkillFingerprint[] {
    const rows = this.db.prepare('SELECT * FROM skills').all() as SkillRow[];
    return rows.map(row => this.rowToFingerprint(row));
  }

  /**
   * Get fingerprint by ID
   */
  getById(id: string): SkillFingerprint | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow | undefined;
    return row ? this.rowToFingerprint(row) : null;
  }

  /**
   * Get skills by conflict group
   */
  getByConflictGroup(groupId: string): SkillFingerprint[] {
    const rows = this.db.prepare('SELECT * FROM skills WHERE conflict_group = ?').all(groupId) as SkillRow[];
    return rows.map(row => this.rowToFingerprint(row));
  }

  /**
   * Update feedback weight for a skill
   */
  updateWeight(skillId: string, updater: (current: number) => number): void {
    const skill = this.getById(skillId);
    if (!skill) return;

    const newWeight = updater(skill.feedbackWeight);
    this.db.prepare('UPDATE skills SET feedback_weight = ? WHERE id = ?').run(newWeight, skillId);
  }

  /**
   * Record feedback signal
   */
  recordFeedback(signal: {
    type: 'confirmed' | 'corrected' | 'ignored';
    query: string;
    skillId: string;
    wrongSkillId?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO feedback_log (query, skill_id, signal_type, wrong_skill_id, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      signal.query,
      signal.skillId,
      signal.type,
      signal.wrongSkillId || null,
      Date.now()
    );
  }

  /**
   * Get conflict groups
   */
  getConflictGroups(): ConflictGroup[] {
    const groups = new Map<string, { skillIds: Set<string>; maxSim: number }>();

    const rows = this.db.prepare(
      'SELECT id, conflict_group, conflict_score FROM skills WHERE conflict_group IS NOT NULL'
    ).all() as Array<{ id: string; conflict_group: string; conflict_score: number }>;

    for (const row of rows) {
      if (!groups.has(row.conflict_group)) {
        groups.set(row.conflict_group, { skillIds: new Set(), maxSim: 0 });
      }
      const g = groups.get(row.conflict_group)!;
      g.skillIds.add(row.id);
      g.maxSim = Math.max(g.maxSim, row.conflict_score);
    }

    return Array.from(groups.entries()).map(([id, data]) => ({
      id,
      skillIds: Array.from(data.skillIds),
      maxSimilarity: data.maxSim
    }));
  }

  /**
   * Get index statistics
   */
  getStats(): IndexStats {
    const totalSkills = this.db.prepare('SELECT COUNT(*) as count FROM skills').get() as { count: number };
    const conflictGroups = this.db.prepare(
      'SELECT COUNT(DISTINCT conflict_group) as count FROM skills WHERE conflict_group IS NOT NULL'
    ).get() as { count: number };
    const lastUpdated = this.db.prepare('SELECT MAX(indexed_at) as ts FROM skills').get() as { ts: number | null };

    return {
      totalSkills: totalSkills.count,
      conflictGroups: conflictGroups.count,
      lastUpdated: lastUpdated.ts || 0,
      embedProvider: 'local-onnx' // TODO: make configurable
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.db.prepare('DELETE FROM skills').run();
    this.db.prepare('DELETE FROM feedback_log').run();
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  private rowToFingerprint(row: SkillRow): SkillFingerprint {
    const vectorBuffer = row.semantic_vector;
    const vector = Array.from(new Float32Array(vectorBuffer.buffer, vectorBuffer.byteOffset, vectorBuffer.byteLength / 4));

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      semanticVector: vector,
      intentPatterns: JSON.parse(row.intent_patterns),
      keywords: JSON.parse(row.keywords),
      sideEffects: row.side_effects as SkillFingerprint['sideEffects'],
      preconditions: JSON.parse(row.preconditions),
      conflictGroup: row.conflict_group || undefined,
      conflictScore: row.conflict_score,
      manualTriggers: JSON.parse(row.manual_triggers),
      priority: row.priority,
      feedbackWeight: row.feedback_weight,
      sourcePath: row.source_path,
      contentHash: row.content_hash,
      indexedAt: row.indexed_at
    };
  }
}
