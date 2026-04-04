/**
 * Fast Router
 * 
 * Quick keyword and trigger phrase matching.
 * Completes in < 2ms for immediate routing decisions.
 */

import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';

export interface FastMatchResult {
  skill: SkillFingerprint;
  score: number;  // 0-10 scale
  matchedTrigger?: string;
  matchedKeywords: string[];
}

export class FastRouter {
  /**
   * Match query against skill keywords and manual triggers
   * Returns match result if score >= minScore
   */
  match(query: string, fingerprints: SkillFingerprint[], minScore = 8): FastMatchResult | null {
    const lowerQuery = query.toLowerCase();
    let bestMatch: FastMatchResult | null = null;

    for (const skill of fingerprints) {
      const result = this.matchSkill(lowerQuery, skill);
      if (result && result.score >= minScore) {
        if (!bestMatch || result.score > bestMatch.score) {
          bestMatch = result;
        }
      }
    }

    return bestMatch;
  }

  private matchSkill(lowerQuery: string, skill: SkillFingerprint): FastMatchResult | null {
    let score = 0;
    let matchedTrigger: string | undefined;
    const matchedKeywords: string[] = [];

    // Check manual triggers (highest weight: 3x)
    for (const trigger of skill.manualTriggers) {
      const lowerTrigger = trigger.toLowerCase();
      if (lowerQuery.includes(lowerTrigger)) {
        const triggerScore = 9 + (lowerTrigger.length / lowerQuery.length);
        if (triggerScore > score) {
          score = triggerScore;
          matchedTrigger = trigger;
        }
      }
    }

    // Check keywords (weight based on keyword importance)
    let keywordScore = 0;
    for (const keyword of skill.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerQuery.includes(lowerKeyword)) {
        // Longer keyword matches = higher score
        const weight = Math.min(keyword.length / 3, 3);
        keywordScore += weight;
        matchedKeywords.push(keyword);
      }
    }

    // Boost score if skill name appears in query
    if (skill.name && lowerQuery.includes(skill.name.toLowerCase())) {
      keywordScore += 5;
    }

    // Combine scores (triggers take precedence)
    if (!matchedTrigger && keywordScore > 0) {
      score = Math.min(keywordScore, 8);
    }

    if (score === 0) return null;

    return {
      skill,
      score: Math.min(score, 10),
      matchedTrigger,
      matchedKeywords
    };
  }

  /**
   * Batch match for multiple queries
   */
  matchBatch(queries: string[], fingerprints: SkillFingerprint[]): (FastMatchResult | null)[] {
    return queries.map(q => this.match(q, fingerprints));
  }
}
