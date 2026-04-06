/**
 * Semantic Router
 * 
 * Vector-based semantic matching using embeddings.
 * Provides more accurate matching than keyword-based routing.
 * 
 * Features:
 * - ONNX model support (high accuracy)
 * - Lightweight BM25 fallback (zero dependencies)
 * - Automatic degradation when ONNX unavailable
 * - Typical latency: < 1ms (BM25) / < 20ms (ONNX)
 */

import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';
import { EmbedProvider, cosineSimilarity } from '../embed/EmbedProvider.js';
import { LightweightMatcher } from '../embed/LightweightMatcher.js';

export interface SemanticMatchResult {
  skill: SkillFingerprint;
  confidence: number;  // 0-1 scale
  similarity: number;  // Raw similarity score
  method: 'onnx' | 'bm25' | 'none';
}

export interface SemanticMatchOptions {
  topK?: number;
  minConfidence?: number;
}

/**
 * Semantic router with automatic fallback.
 * 
 * Uses ONNX embeddings when available, falls back to BM25 when not.
 * Zero configuration - works out of the box.
 */
export class SemanticRouter {
  private lightweightMatcher: LightweightMatcher | null = null;
  private useOnnx: boolean = true;

  constructor(private embed: EmbedProvider) {}

  /**
   * Initialize the router.
   * Detects ONNX availability and prepares fallback.
   */
  async initialize(fingerprints: SkillFingerprint[]): Promise<void> {
    // Check if ONNX is working
    try {
      await this.embed.embed('test');
      this.useOnnx = true;
    } catch (error) {
      console.warn('[SemanticRouter] ONNX not available, using BM25 fallback');
      this.useOnnx = false;
    }

    // Always prepare BM25 fallback
    if (fingerprints.length > 0) {
      this.lightweightMatcher = new LightweightMatcher(fingerprints);
    }
  }

  /**
   * Match query against all skills using semantic similarity.
   * 
   * Automatically selects best available method:
   * 1. ONNX embedding (if available)
   * 2. BM25 lightweight (fallback)
   */
  async match(
    query: string,
    fingerprints: SkillFingerprint[],
    options: SemanticMatchOptions = {}
  ): Promise<SemanticMatchResult | null> {
    const { topK = 5, minConfidence = 0.30 } = options;

    if (fingerprints.length === 0) return null;

    // Try ONNX first
    if (this.useOnnx) {
      try {
        const result = await this.matchOnnx(query, fingerprints, topK);
        if (result && result.confidence >= minConfidence) {
          return { ...result, method: 'onnx' };
        }
      } catch (error) {
        // ONNX failed, try BM25
      }
    }

    // Fallback to BM25
    return this.matchBm25(query, minConfidence);
  }

  /**
   * ONNX-based matching.
   */
  private async matchOnnx(
    query: string,
    fingerprints: SkillFingerprint[],
    topK: number
  ): Promise<SemanticMatchResult | null> {
    const queryVector = await this.embed.embed(query);

    const scores = fingerprints.map(skill => ({
      skill,
      similarity: cosineSimilarity(queryVector, skill.semanticVector)
    }));

    scores.sort((a, b) => b.similarity - a.similarity);
    const best = scores[0];

    if (!best) return null;

    // Map similarity [0.5, 1.0] to confidence [0.0, 1.0]
    const confidence = Math.max(0, (best.similarity - 0.5) * 2);

    return {
      skill: best.skill,
      confidence,
      similarity: best.similarity,
      method: 'onnx'
    };
  }

  /**
   * BM25-based lightweight matching.
   */
  private matchBm25(
    query: string,
    minConfidence: number
  ): SemanticMatchResult | null {
    if (!this.lightweightMatcher) return null;

    const result = this.lightweightMatcher.matchOne(query);
    if (!result) return null;

    // Normalize BM25 score to 0-1 confidence
    // BM25 scores are unbounded, use sigmoid-like normalization
    const normalizedScore = Math.min(result.score / 5, 1);
    const confidence = normalizedScore * 0.9; // Slightly lower max than ONNX

    if (confidence < minConfidence) {
      return null;
    }

    return {
      skill: result.skill,
      confidence,
      similarity: normalizedScore,
      method: 'bm25'
    };
  }

  /**
   * Get top K matches for a query.
   */
  async matchTopK(
    query: string,
    fingerprints: SkillFingerprint[],
    topK = 5
  ): Promise<SemanticMatchResult[]> {
    if (fingerprints.length === 0) return [];

    // Try ONNX first
    if (this.useOnnx) {
      try {
        const queryVector = await this.embed.embed(query);
        const scores = fingerprints.map(skill => ({
          skill,
          similarity: cosineSimilarity(queryVector, skill.semanticVector)
        }));
        scores.sort((a, b) => b.similarity - a.similarity);

        return scores.slice(0, topK).map(({ skill, similarity }) => ({
          skill,
          similarity,
          confidence: Math.max(0, (similarity - 0.5) * 2),
          method: 'onnx' as const
        }));
      } catch {
        // Fall through to BM25
      }
    }

    // BM25 fallback
    if (this.lightweightMatcher) {
      const results = this.lightweightMatcher.match(query, topK);
      return results.map(r => ({
        skill: r.skill,
        confidence: Math.min(r.score / 5, 1) * 0.9,
        similarity: Math.min(r.score / 5, 1),
        method: 'bm25' as const
      }));
    }

    return [];
  }

  /**
   * Batch semantic matching.
   */
  async matchBatch(
    queries: string[],
    fingerprints: SkillFingerprint[]
  ): Promise<(SemanticMatchResult | null)[]> {
    const results: (SemanticMatchResult | null)[] = [];

    for (const query of queries) {
      const result = await this.match(query, fingerprints);
      results.push(result);
    }

    return results;
  }

  /**
   * Check if using ONNX or BM25 fallback.
   */
  isUsingOnnx(): boolean {
    return this.useOnnx;
  }
}
