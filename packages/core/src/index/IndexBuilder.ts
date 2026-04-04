/**
 * Index Builder
 * 
 * Builds skill index from skill directories.
 * Scans directories, parses SKILL.md files, and generates fingerprints.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SkillIndex } from './SkillIndex.js';
import { Fingerprinter } from '../fingerprint/Fingerprinter.js';
import { ConflictDetector } from '../fingerprint/ConflictDetector.js';
import { EmbedProvider } from '../embed/EmbedProvider.js';

export interface IndexBuildOptions {
  skillDirs: string[];
  conflictThreshold?: number;
  onProgress?: (current: number, total: number, skillName: string) => void;
}

export interface IndexBuildResult {
  totalIndexed: number;
  conflictGroups: number;
  durationMs: number;
  errors: Array<{ path: string; error: string }>;
}

export class IndexBuilder {
  private fingerprinter: Fingerprinter;
  private conflictDetector: ConflictDetector;

  constructor(
    embed: EmbedProvider,
    conflictThreshold = 0.85
  ) {
    this.fingerprinter = new Fingerprinter(embed);
    this.conflictDetector = new ConflictDetector(conflictThreshold);
  }

  /**
   * Build index from skill directories
   */
  async build(index: SkillIndex, options: IndexBuildOptions): Promise<IndexBuildResult> {
    const startTime = Date.now();
    const errors: Array<{ path: string; error: string }> = [];

    // Collect all skill paths
    const skillPaths: string[] = [];
    for (const dir of options.skillDirs) {
      try {
        const paths = await this.scanSkillDirectory(dir);
        skillPaths.push(...paths);
      } catch (err) {
        errors.push({ path: dir, error: String(err) });
      }
    }

    // Clear existing index
    index.clear();

    // Generate fingerprints
    const fingerprints: Awaited<ReturnType<Fingerprinter['fingerprint']>>[] = [];
    for (let i = 0; i < skillPaths.length; i++) {
      const skillPath = skillPaths[i];
      try {
        const fp = await this.fingerprinter.fingerprint(skillPath);
        fingerprints.push(fp);
        options.onProgress?.(i + 1, skillPaths.length, fp.name);
      } catch (err) {
        errors.push({ path: skillPath, error: String(err) });
      }
    }

    // Detect conflicts
    const withConflicts = this.conflictDetector.detectConflicts(fingerprints);

    // Save to index
    index.saveBatch(withConflicts);

    const conflictGroups = this.conflictDetector.getConflictGroups(withConflicts);

    return {
      totalIndexed: fingerprints.length,
      conflictGroups: conflictGroups.length,
      durationMs: Date.now() - startTime,
      errors
    };
  }

  /**
   * Incrementally update index with new/changed skills
   */
  async update(index: SkillIndex, skillPaths: string[]): Promise<void> {
    for (const skillPath of skillPaths) {
      try {
        const fp = await this.fingerprinter.fingerprint(skillPath);
        
        // Check if skill already exists and has changed
        const existing = index.getById(fp.id);
        if (existing && existing.contentHash === fp.contentHash) {
          continue; // No change, skip
        }

        // Save new/updated fingerprint
        index.save(fp);
      } catch (err) {
        console.warn(`Failed to update ${skillPath}:`, err);
      }
    }

    // Re-run conflict detection on all skills
    const allFingerprints = index.getAll();
    const withConflicts = this.conflictDetector.detectConflicts(allFingerprints);
    
    // Update conflict info
    for (const fp of withConflicts) {
      if (fp.conflictGroup || fp.conflictScore > 0) {
        index.save(fp);
      }
    }
  }

  /**
   * Scan directory for skills
   */
  private async scanSkillDirectory(dir: string): Promise<string[]> {
    const skillPaths: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = path.join(dir, entry.name);
          const skillMdPath = path.join(skillDir, 'SKILL.md');
          
          try {
            await fs.access(skillMdPath);
            skillPaths.push(skillDir);
          } catch {
            // No SKILL.md, skip
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return skillPaths;
  }
}
