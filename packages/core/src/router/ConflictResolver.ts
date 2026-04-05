/**
 * Conflict Resolver
 * 
 * Resolves conflicts within conflict groups by:
 * - Detecting context signals (e.g., "advanced", "bulk", "simple")
 * - Applying user priority rules
 * - Providing transparent reasoning
 */

import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';
import { SkillIndex } from '../index/SkillIndex.js';

export interface ConflictResolutionResult {
  skill: SkillFingerprint;
  confidence: number;
  conflictResolved: boolean;
  alternatives: string[];
  resolutionReason?: string;
}

export class ConflictResolver {
  constructor(private index: SkillIndex) {}

  /**
   * Resolve conflicts for a matched skill
   */
  async resolve(
    matchedSkill: SkillFingerprint,
    query: string,
    allSkills: SkillFingerprint[]
  ): Promise<ConflictResolutionResult> {
    // If not in a conflict group, return as-is
    if (!matchedSkill.conflictGroup) {
      return {
        skill: matchedSkill,
        confidence: 1.0,
        conflictResolved: false,
        alternatives: []
      };
    }

    // Get all skills in the same conflict group
    const conflictSkills = allSkills.filter(
      s => s.conflictGroup === matchedSkill.conflictGroup && s.id !== matchedSkill.id
    );

    if (conflictSkills.length === 0) {
      return {
        skill: matchedSkill,
        confidence: 1.0,
        conflictResolved: false,
        alternatives: []
      };
    }

    const lowerQuery = query.toLowerCase();
    const candidates = [matchedSkill, ...conflictSkills];

    // Score each candidate based on context signals
    const scored = candidates.map(skill => ({
      skill,
      score: this.calculateContextScore(skill, lowerQuery)
    }));

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0];
    const runnerUp = scored[1];

    // Calculate confidence based on score gap
    const scoreGap = runnerUp ? winner.score - runnerUp.score : winner.score;
    const confidence = Math.min(1, 0.7 + scoreGap * 0.1);

    // Build resolution reason
    let resolutionReason: string | undefined;
    if (winner.skill.id !== matchedSkill.id) {
      const signals = this.extractMatchedSignals(winner.skill, lowerQuery);
      resolutionReason = `Context signals [${signals.join(', ')}] favor ${winner.skill.name}`;
    }

    return {
      skill: winner.skill,
      confidence,
      conflictResolved: true,
      alternatives: candidates
        .filter(c => c.id !== winner.skill.id)
        .map(c => c.name),
      resolutionReason
    };
  }

  /**
   * Calculate context score for a skill based on query
   */
  private calculateContextScore(skill: SkillFingerprint, lowerQuery: string): number {
    let score = skill.priority; // Base score from priority

    // Check prefer_when signals from SKILL.md
    const routeMeta = skill.manualTriggers; // Simplified - in real impl, would check prefer_when
    
    // Common context signals
    const signalKeywords: Record<string, string[]> = {
      'advanced': ['advanced', 'complex', 'detailed', 'full', 'complete'],
      'simple': ['simple', 'basic', 'quick', 'easy'],
      'bulk': ['bulk', 'batch', 'multiple', 'all', 'many'],
      'single': ['single', 'one', 'individual'],
      'notify': ['notify', 'alert', 'notification', 'ping'],
      'read': ['read', 'get', 'show', 'display', 'view'],
      'write': ['write', 'create', 'update', 'delete', 'modify']
    };

    // Check each signal category
    for (const [category, keywords] of Object.entries(signalKeywords)) {
      const hasSignal = keywords.some(kw => lowerQuery.includes(kw));
      if (hasSignal) {
        // Boost score if skill has related keywords
        if (skill.keywords.some(k => k.toLowerCase().includes(category))) {
          score += 3;
        }
      }
    }

    // Boost if skill name appears in query (as whole word)
    if (skill.name) {
      const nameLower = skill.name.toLowerCase();
      // Check for exact match or word boundary match
      const wordBoundaryMatch = new RegExp(`\\b${nameLower}\\b`).test(lowerQuery);
      const exactMatch = lowerQuery.includes(nameLower);
      
      if (wordBoundaryMatch) {
        score += 5 + nameLower.length * 0.2; // Prefer longer names
      } else if (exactMatch) {
        score += 3; // Partial match gets lower score
      }
    }

    // Boost for manual trigger matches
    for (const trigger of skill.manualTriggers) {
      if (lowerQuery.includes(trigger.toLowerCase())) {
        score += 4;
      }
    }

    // Apply feedback weight
    score *= skill.feedbackWeight;

    return score;
  }

  /**
   * Extract which signals matched for a skill
   */
  private extractMatchedSignals(skill: SkillFingerprint, lowerQuery: string): string[] {
    const signals: string[] = [];

    // Check name match
    if (skill.name && lowerQuery.includes(skill.name.toLowerCase())) {
      signals.push(`name:"${skill.name}"`);
    }

    // Check manual triggers
    for (const trigger of skill.manualTriggers) {
      if (lowerQuery.includes(trigger.toLowerCase())) {
        signals.push(`trigger:"${trigger}"`);
      }
    }

    // Check keywords
    for (const keyword of skill.keywords) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        signals.push(`keyword:"${keyword}"`);
      }
    }

    return signals.slice(0, 3); // Limit to top 3
  }
}
