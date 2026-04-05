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

/**
 * Result of conflict resolution
 */
export interface ConflictResolutionResult {
  /** The selected skill after conflict resolution */
  skill: SkillFingerprint;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether conflict resolution was performed */
  conflictResolved: boolean;
  /** Alternative skills considered */
  alternatives: string[];
  /** Human-readable reason for the resolution */
  resolutionReason?: string;
}

/**
 * Scored skill candidate for conflict resolution
 */
interface ScoredSkill {
  skill: SkillFingerprint;
  score: number;
}

/**
 * Context signal keywords for conflict resolution
 */
const SIGNAL_KEYWORDS: Record<string, string[]> = {
  'advanced': ['advanced', 'complex', 'detailed', 'full', 'complete'],
  'simple': ['simple', 'basic', 'quick', 'easy'],
  'bulk': ['bulk', 'batch', 'multiple', 'all', 'many'],
  'single': ['single', 'one', 'individual'],
  'notify': ['notify', 'alert', 'notification', 'ping'],
  'read': ['read', 'get', 'show', 'display', 'view'],
  'write': ['write', 'create', 'update', 'delete', 'modify']
};

/**
 * Resolves conflicts between similar skills within the same conflict group.
 * 
 * @example
 * ```typescript
 * const resolver = new ConflictResolver(index);
 * const result = await resolver.resolve(
 *   matchedSkill,
 *   "create a github issue",
 *   allSkills
 * );
 * // result.skill.name === 'github'
 * // result.confidence === 0.95
 * ```
 */
export class ConflictResolver {
  constructor(private index: SkillIndex) {}

  /**
   * Resolve conflicts for a matched skill.
   * 
   * If the skill is not in a conflict group, returns it as-is.
   * Otherwise, scores all skills in the same group and selects the best match.
   * 
   * @param matchedSkill - The initially matched skill
   * @param query - The user's query (lowercase for matching)
   * @param allSkills - All available skills for conflict comparison
   * @returns The resolved skill with confidence and alternatives
   * @throws Never throws - returns safe defaults on error
   */
  async resolve(
    matchedSkill: SkillFingerprint,
    query: string,
    allSkills: SkillFingerprint[]
  ): Promise<ConflictResolutionResult> {
    try {
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
      const scored: ScoredSkill[] = candidates.map(skill => ({
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
    } catch (error) {
      // Fail-safe: return original skill on error
      console.warn('ConflictResolver error:', error);
      return {
        skill: matchedSkill,
        confidence: 0.5,
        conflictResolved: false,
        alternatives: []
      };
    }
  }

  /**
   * Calculate context score for a skill based on query signals.
   * 
   * Scoring algorithm:
   * - Base score: skill priority (1-10)
   * - Context signals: +3 for each matching category
   * - Name match (word boundary): +5 + length bonus
   * - Name match (partial): +3
   * - Trigger match: +4 each
   * - Multiplied by feedback weight
   * 
   * @param skill - The skill to score
   * @param lowerQuery - Lowercase query string
   * @returns Calculated score (higher is better)
   */
  private calculateContextScore(skill: SkillFingerprint, lowerQuery: string): number {
    let score = skill.priority ?? 5; // Base score from priority, default 5

    try {
      // Check each signal category
      for (const [category, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
        const hasSignal = keywords.some(kw => lowerQuery.includes(kw));
        if (hasSignal && skill.keywords.some(k => k.toLowerCase().includes(category))) {
          score += 3;
        }
      }

      // Boost if skill name appears in query (as whole word)
      if (skill.name) {
        const nameLower = skill.name.toLowerCase();
        const wordBoundaryMatch = new RegExp(`\\b${nameLower}\\b`).test(lowerQuery);
        const exactMatch = lowerQuery.includes(nameLower);
        
        if (wordBoundaryMatch) {
          score += 5 + nameLower.length * 0.2;
        } else if (exactMatch) {
          score += 3;
        }
      }

      // Boost for manual trigger matches
      for (const trigger of skill.manualTriggers) {
        if (lowerQuery.includes(trigger.toLowerCase())) {
          score += 4;
        }
      }

      // Apply feedback weight (default 1.0)
      score *= skill.feedbackWeight ?? 1.0;
    } catch (error) {
      console.warn('Error calculating context score:', error);
    }

    return score;
  }

  /**
   * Extract which signals matched for a skill.
   * 
   * @param skill - The skill to check
   * @param lowerQuery - Lowercase query string
   * @returns Array of matched signal descriptions (max 3)
   */
  private extractMatchedSignals(skill: SkillFingerprint, lowerQuery: string): string[] {
    const signals: string[] = [];

    try {
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
    } catch (error) {
      console.warn('Error extracting matched signals:', error);
    }

    return signals.slice(0, 3); // Limit to top 3
  }
}
