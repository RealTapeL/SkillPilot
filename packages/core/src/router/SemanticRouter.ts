/**
 * Semantic Router
 * 
 * Vector-based semantic matching using embeddings.
 * Provides more accurate matching than keyword-based routing.
 * Typical latency: < 20ms
 */

import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';
import { EmbedProvider, cosineSimilarity } from '../embed/EmbedProvider.js';

export interface SemanticMatchResult {
  skill: SkillFingerprint;
  confidence: number;  // 0-1 scale
  similarity: number;  // Raw cosine similarity
}

export interface SemanticMatchOptions {
  topK?: number;
  minConfidence?: number;
}

export class SemanticRouter {
  constructor(private embed: EmbedProvider) {}

  /**
   * Match query against all skills using semantic similarity
   */
  async match(
    query: string,
    fingerprints: SkillFingerprint[],
    options: SemanticMatchOptions = {}
  ): Promise<SemanticMatchResult | null> {
    const { topK = 5, minConfidence = 0.45 } = options;

    if (fingerprints.length === 0) return null;

    // Generate query embedding
    const queryVector = await this.embed.embed(query);

    // Calculate similarities
    const scores: Array<{ skill: SkillFingerprint; similarity: number }> = [];
    
    for (const skill of fingerprints) {
      const similarity = cosineSimilarity(queryVector, skill.semanticVector);
      scores.push({ skill, similarity });
    }

    // Sort by similarity (descending)
    scores.sort((a, b) => b.similarity - a.similarity);

    // Get top K results
    const topResults = scores.slice(0, topK);

    if (topResults.length === 0) return null;

    const best = topResults[0];
    
    // Apply confidence transformation
    // Map similarity [0.5, 1.0] to confidence [0.0, 1.0]
    const confidence = Math.max(0, (best.similarity - 0.5) * 2);

    if (confidence < minConfidence) {
      return null;
    }

    return {
      skill: best.skill,
      confidence,
      similarity: best.similarity
    };
  }

  /**
   * Get top K matches for a query
   */
  async matchTopK(
    query: string,
    fingerprints: SkillFingerprint[],
    topK = 5
  ): Promise<SemanticMatchResult[]> {
    if (fingerprints.length === 0) return [];

    const queryVector = await this.embed.embed(query);

    const scores = fingerprints.map(skill => ({
      skill,
      similarity: cosineSimilarity(queryVector, skill.semanticVector)
    }));

    scores.sort((a, b) => b.similarity - a.similarity);

    return scores.slice(0, topK).map(({ skill, similarity }) => ({
      skill,
      similarity,
      confidence: Math.max(0, (similarity - 0.5) * 2)
    }));
  }

  /**
   * Batch semantic matching
   */
  async matchBatch(
    queries: string[],
    fingerprints: SkillFingerprint[]
  ): Promise<(SemanticMatchResult | null)[]> {
    // Generate embeddings for all queries
    const queryVectors = await this.embed.embedBatch(queries);

    return queryVectors.map(queryVector => {
      let bestSkill: SkillFingerprint | null = null;
      let bestSimilarity = -1;

      for (const skill of fingerprints) {
        const similarity = cosineSimilarity(queryVector, skill.semanticVector);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestSkill = skill;
        }
      }

      if (!bestSkill) return null;

      const confidence = Math.max(0, (bestSimilarity - 0.5) * 2);
      return {
        skill: bestSkill,
        confidence,
        similarity: bestSimilarity
      };
    });
  }
}
