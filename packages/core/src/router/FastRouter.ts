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
      // Full phrase match
      if (lowerQuery.includes(lowerTrigger)) {
        const triggerScore = 9 + (lowerTrigger.length / lowerQuery.length);
        if (triggerScore > score) {
          score = triggerScore;
          matchedTrigger = trigger;
        }
      } else {
        // Partial word match - check if significant words overlap
        const triggerWords = lowerTrigger.split(/\s+/).filter(w => w.length >= 3);
        const queryWords = lowerQuery.split(/\s+/).filter(w => w.length >= 3);
        
        let matchCount = 0;
        for (const tw of triggerWords) {
          if (queryWords.includes(tw)) {
            matchCount++;
          }
        }
        
        // If more than half of trigger words match, give partial credit
        if (triggerWords.length > 0 && matchCount >= triggerWords.length / 2) {
          const partialScore = 5 + (matchCount / triggerWords.length) * 3;
          if (partialScore > score) {
            score = partialScore;
            matchedTrigger = trigger + " (partial)";
          }
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

    // Fuzzy matching: check if query words overlap with skill description/triggers
    if (score === 0 && keywordScore === 0) {
      const queryWords = lowerQuery.split(/\s+/);
      const skillText = [
        skill.name,
        ...(skill.description ? [skill.description] : []),
        ...skill.manualTriggers
      ].join(' ').toLowerCase();
      
      let overlapScore = 0;
      for (const word of queryWords) {
        if (word.length < 3) continue; // Skip short words
        
        // Direct word match in skill text
        if (skillText.includes(word)) {
          overlapScore += 2;
        }
        // Partial match (word is substring of skill text word)
        else {
          const skillWords = skillText.split(/\s+/);
          for (const sw of skillWords) {
            if (sw.includes(word) || word.includes(sw)) {
              overlapScore += 1;
              break;
            }
          }
        }
      }
      
      if (overlapScore > 0) {
        keywordScore = Math.min(overlapScore, 6); // Cap fuzzy matches at 6
      }
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
