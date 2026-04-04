/**
 * Conflict Detector
 * 
 * Automatically detects functional overlap between skills
 * and groups them into conflict groups for resolution.
 */

import { SkillFingerprint } from './Fingerprinter.js';
import { cosineSimilarity } from '../embed/EmbedProvider.js';

export interface ConflictGroup {
  id: string;
  skillIds: string[];
  maxSimilarity: number;
}

export class ConflictDetector {
  private threshold: number;

  constructor(threshold = 0.85) {
    this.threshold = threshold;
  }

  /**
   * Detect conflicts among all skills
   * Returns updated fingerprints with conflictGroup and conflictScore set
   */
  detectConflicts(fingerprints: SkillFingerprint[]): SkillFingerprint[] {
    const n = fingerprints.length;
    const unionFind = new UnionFind(n);
    const similarities: Map<string, number> = new Map();

    // Compute pairwise similarities
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = cosineSimilarity(
          fingerprints[i].semanticVector,
          fingerprints[j].semanticVector
        );
        
        if (sim >= this.threshold) {
          unionFind.union(i, j);
          const key = `${i},${j}`;
          similarities.set(key, sim);
        }
      }
    }

    // Build conflict groups
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = unionFind.find(i);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(i);
    }

    // Assign group IDs and conflict scores
    let groupCounter = 0;
    for (const [root, indices] of groups) {
      if (indices.length < 2) continue; // Skip non-conflicting skills

      const groupId = `conflict-group-${String.fromCharCode(65 + groupCounter)}`;
      groupCounter++;

      // Calculate conflict scores for each skill in group
      for (const idx of indices) {
        let maxSim = 0;
        for (const otherIdx of indices) {
          if (idx === otherIdx) continue;
          const key = idx < otherIdx ? `${idx},${otherIdx}` : `${otherIdx},${idx}`;
          const sim = similarities.get(key) || 0;
          maxSim = Math.max(maxSim, sim);
        }
        
        fingerprints[idx].conflictGroup = groupId;
        fingerprints[idx].conflictScore = maxSim;
      }
    }

    return fingerprints;
  }

  /**
   * Get all conflict groups
   */
  getConflictGroups(fingerprints: SkillFingerprint[]): ConflictGroup[] {
    const groups = new Map<string, Set<string>>();
    const scores = new Map<string, number>();

    for (const fp of fingerprints) {
      if (fp.conflictGroup) {
        if (!groups.has(fp.conflictGroup)) {
          groups.set(fp.conflictGroup, new Set());
          scores.set(fp.conflictGroup, 0);
        }
        groups.get(fp.conflictGroup)!.add(fp.id);
        scores.set(fp.conflictGroup, Math.max(scores.get(fp.conflictGroup)!, fp.conflictScore));
      }
    }

    return Array.from(groups.entries()).map(([id, skillSet]) => ({
      id,
      skillIds: Array.from(skillSet),
      maxSimilarity: scores.get(id)!
    }));
  }
}

// Union-Find data structure for grouping
class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const px = this.find(x);
    const py = this.find(y);
    if (px !== py) {
      this.parent[px] = py;
    }
  }
}
