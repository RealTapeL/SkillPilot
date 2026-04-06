/**
 * Lightweight Semantic Matcher
 * 
 * Zero-dependency BM25-based semantic matching for SkillPilot.
 * Fallback when ONNX model is not available.
 * 
 * Features:
 * - Pure JS/TS implementation, no native dependencies
 * - BM25 algorithm optimized for short text matching
 * - < 1ms latency for skill routing
 * - Automatic fallback from ONNX
 */

import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';

/** Stop words for text preprocessing */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'need', 'dare', 'ought', 'used', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those'
]);

/** BM25 parameters */
const BM25_K1 = 1.2;  // Term frequency saturation
const BM25_B = 0.75;  // Length normalization

/** Tokenized document */
interface TokenizedDoc {
  skill: SkillFingerprint;
  tokens: string[];
  termFreq: Map<string, number>;
  length: number;
}

/** BM25 score result */
interface BM25Result {
  skill: SkillFingerprint;
  score: number;
}

/**
 * Lightweight BM25 semantic matcher.
 * 
 * No ONNX, no native dependencies, pure JavaScript.
 * Perfect for skill routing: short texts, fast, good accuracy.
 */
export class LightweightMatcher {
  private docs: TokenizedDoc[] = [];
  private docCount = 0;
  private avgDocLength = 0;
  private idfCache = new Map<string, number>();

  /**
   * Build BM25 index from skill fingerprints.
   * 
   * @param skills - Array of skill fingerprints
   */
  constructor(skills: SkillFingerprint[]) {
    this.buildIndex(skills);
  }

  /**
   * Tokenize and preprocess text.
   */
  private tokenize(text: string): string[] {
    if (!text) return [];
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !STOP_WORDS.has(word));
  }

  /**
   * Build BM25 index from skills.
   */
  private buildIndex(skills: SkillFingerprint[]): void {
    // Tokenize all skill texts
    this.docs = skills.map(skill => {
      // Combine name, description, and keywords with weights
      const nameText = skill.name ? `${skill.name} ${skill.name}` : ''; // 2x weight
      const keywordText = skill.keywords?.join(' ') ?? '';
      const descText = skill.description ?? '';
      
      const fullText = `${nameText} ${keywordText} ${descText}`;
      const tokens = this.tokenize(fullText);
      
      // Calculate term frequencies
      const termFreq = new Map<string, number>();
      for (const token of tokens) {
        termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
      }
      
      return {
        skill,
        tokens,
        termFreq,
        length: tokens.length
      };
    });

    this.docCount = this.docs.length;
    
    // Calculate average document length
    const totalLength = this.docs.reduce((sum, doc) => sum + doc.length, 0);
    this.avgDocLength = totalLength / (this.docCount || 1);

    // Pre-calculate IDF for all terms
    this.precomputeIdf();
  }

  /**
   * Pre-compute IDF for all terms in corpus.
   */
  private precomputeIdf(): void {
    const docFreq = new Map<string, number>();
    
    for (const doc of this.docs) {
      const seen = new Set<string>();
      for (const token of doc.tokens) {
        if (!seen.has(token)) {
          docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
          seen.add(token);
        }
      }
    }

    // IDF formula: log((N - n + 0.5) / (n + 0.5) + 1)
    for (const [term, freq] of docFreq) {
      const idf = Math.log(
        (this.docCount - freq + 0.5) / (freq + 0.5) + 1
      );
      this.idfCache.set(term, idf);
    }
  }

  /**
   * Calculate BM25 score for a document.
   */
  private score(queryTokens: string[], doc: TokenizedDoc): number {
    let score = 0;
    
    for (const term of queryTokens) {
      const idf = this.idfCache.get(term) ?? 0;
      const tf = doc.termFreq.get(term) ?? 0;
      
      if (tf === 0) continue;

      // BM25 term scoring
      const numerator = tf * (BM25_K1 + 1);
      const denominator = tf + BM25_K1 * (
        1 - BM25_B + BM25_B * (doc.length / this.avgDocLength)
      );
      
      score += idf * (numerator / denominator);
    }
    
    return score;
  }

  /**
   * Match query against indexed skills.
   * 
   * @param query - User query string
   * @param topN - Number of top results to return
   * @returns Array of scored skill matches
   */
  match(query: string, topN = 3): BM25Result[] {
    const queryTokens = this.tokenize(query);
    
    if (queryTokens.length === 0 || this.docs.length === 0) {
      return [];
    }

    // Score all documents
    const results: BM25Result[] = this.docs.map(doc => ({
      skill: doc.skill,
      score: this.score(queryTokens, doc)
    }));

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Filter low scores and return top N
    const maxScore = results[0]?.score ?? 0;
    const threshold = maxScore * 0.1; // 10% of max score

    return results
      .filter(r => r.score > threshold)
      .slice(0, topN);
  }

  /**
   * Get single best match.
   * 
   * @param query - User query string
   * @returns Best match or null
   */
  matchOne(query: string): BM25Result | null {
    const results = this.match(query, 1);
    return results[0] ?? null;
  }
}
