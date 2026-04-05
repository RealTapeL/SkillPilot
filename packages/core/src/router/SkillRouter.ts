/**
 * Skill Router
 * 
 * Main router that orchestrates fast path, semantic path, and conflict resolution.
 * Three-stage routing: Fast → Semantic → Conflict Resolution
 * 
 * @example
 * ```typescript
 * const router = new SkillRouter(index, embedProvider);
 * const result = await router.route("create a GitHub issue");
 * // result.skill.name === 'github'
 * // result.method === 'fast'
 * // result.latencyMs === 2
 * ```
 */

import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';
import { SkillIndex } from '../index/SkillIndex.js';
import { FastRouter } from './FastRouter.js';
import { SemanticRouter } from './SemanticRouter.js';
import { ConflictResolver, ConflictResolutionResult } from './ConflictResolver.js';
import { EmbedProvider } from '../embed/EmbedProvider.js';

/**
 * Configuration options for the skill router
 */
export interface RouterConfig {
  /** Fast path minimum score to bypass semantic matching (0-10) */
  fastRouteMinScore: number;
  /** Hard route threshold: direct skill execution (0-1) */
  hardRouteThreshold: number;
  /** Soft inject threshold: inject skill context (0-1) */
  softInjectThreshold: number;
  /** Enable semantic matching */
  enableSemantic: boolean;
}

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  fastRouteMinScore: 6,  // Lowered from 8 to catch more fuzzy matches
  hardRouteThreshold: 0.70,  // Lowered for better coverage
  softInjectThreshold: 0.40,
  enableSemantic: true
};

/**
 * Result of a routing operation
 */
export interface RouteResult {
  /** The matched skill, or null if no match */
  skill: SkillFingerprint | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Routing method used */
  method: 'fast' | 'semantic' | 'no-match';
  /** Whether conflict resolution was performed */
  conflictResolved?: boolean;
  /** Alternative skills considered */
  conflictAlternatives?: string[];
  /** Human-readable resolution reason */
  resolutionReason?: string;
  /** Routing latency in milliseconds */
  latencyMs: number;
  /** Detailed routing trace (if requested) */
  trace?: RouteTrace;
}

/**
 * Detailed trace of routing decisions
 */
export interface RouteTrace {
  /** Fast path matching result */
  fastResult?: { 
    score: number; 
    matchedTrigger?: string; 
    matchedKeywords: string[] 
  };
  /** Semantic matching results */
  semanticResults?: Array<{ 
    skillName: string; 
    similarity: number; 
    confidence: number 
  }>;
  /** Skills considered in conflict resolution */
  conflictCandidates?: string[];
}

/**
 * Context for routing operation
 */
export interface RouteContext {
  /** Enable detailed tracing */
  trace?: boolean;
  /** User identifier for feedback tracking */
  userId?: string;
  /** Session identifier */
  sessionId?: string;
}

/**
 * Score data for routeWithDetails
 */
interface SkillScore {
  skill: SkillFingerprint;
  fastScore: number;
  semanticScore: number;
}

/**
 * Three-stage skill router with fallback and error recovery.
 * 
 * Routing flow:
 * 1. Fast Path: Keyword/trigger matching (1-5ms)
 * 2. Semantic Path: Vector similarity matching (~20ms with ONNX)
 * 3. Conflict Resolution: Resolve overlapping skills
 * 
 * Error handling:
 * - All errors are caught and return safe no-match results
 * - Fallback to fast path when semantic matching fails
 * - Graceful degradation when index is unavailable
 */
export class SkillRouter {
  private fastRouter: FastRouter;
  private semanticRouter: SemanticRouter;
  private conflictResolver: ConflictResolver;
  private config: RouterConfig;

  /**
   * Create a new SkillRouter instance.
   * 
   * @param index - Skill index for retrieving fingerprints
   * @param embed - Embedding provider for semantic matching
   * @param config - Optional configuration overrides
   */
  constructor(
    private index: SkillIndex,
    embed: EmbedProvider,
    config: Partial<RouterConfig> = {}
  ) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.fastRouter = new FastRouter();
    this.semanticRouter = new SemanticRouter(embed);
    this.conflictResolver = new ConflictResolver(index);
  }

  /**
   * Route a query to the best matching skill.
   * 
   * Three-stage routing with automatic fallback:
   * 1. Fast path (keywords) → immediate return if score >= threshold
   * 2. Semantic path (vectors) → if fast path fails and enabled
   * 3. Fallback → low-confidence fast match if available
   * 
   * @param query - User query string
   * @param context - Optional routing context
   * @returns Route result with skill, confidence, and metadata
   * @throws Never throws - returns no-match result on error
   */
  async route(query: string, context?: RouteContext): Promise<RouteResult> {
    const t0 = performance.now();
    
    try {
      // Get all skill fingerprints
      let fingerprints: SkillFingerprint[];
      try {
        fingerprints = await this.index.getAll();
      } catch (error) {
        console.error('Failed to load skill index:', error);
        return this.createNoMatchResult(t0);
      }

      if (fingerprints.length === 0) {
        console.warn('No skills indexed');
        return this.createNoMatchResult(t0);
      }

      const trace: RouteTrace = {};

      // Stage 1: Fast Path (keyword + manual trigger matching)
      const fastResult = this.fastRouter.match(query, fingerprints, 4);
      
      if (fastResult) {
        // High confidence fast match - use immediately
        if (fastResult.score >= this.config.fastRouteMinScore) {
          try {
            const resolved = await this.conflictResolver.resolve(
              fastResult.skill, 
              query, 
              fingerprints
            );
            
            if (context?.trace) {
              trace.fastResult = {
                score: fastResult.score,
                matchedTrigger: fastResult.matchedTrigger,
                matchedKeywords: fastResult.matchedKeywords
              };
            }

            return this.buildResult(resolved, 'fast', t0, trace);
          } catch (error) {
            console.warn('Conflict resolution failed:', error);
            // Fall through to use fast result directly
            return this.buildResult({
              skill: fastResult.skill,
              confidence: fastResult.score / 10,
              conflictResolved: false,
              alternatives: []
            }, 'fast', t0, trace);
          }
        }
        
        // Low confidence match - save for potential fallback
        trace.fastResult = {
          score: fastResult.score,
          matchedTrigger: fastResult.matchedTrigger,
          matchedKeywords: fastResult.matchedKeywords
        };
      }

      // Stage 2: Semantic Path (embedding matching)
      if (!this.config.enableSemantic) {
        return {
          skill: null,
          confidence: 0,
          method: 'no-match',
          latencyMs: performance.now() - t0,
          trace: context?.trace ? trace : undefined
        };
      }

      let semResult;
      try {
        semResult = await this.semanticRouter.match(query, fingerprints);
      } catch (error) {
        console.warn('Semantic matching failed:', error);
        semResult = null;
      }
      
      if (!semResult) {
        // Fallback to low-confidence fast match if available
        if (fastResult && fastResult.score >= 4) {
          const fallbackConfidence = fastResult.score / 10;
          return {
            skill: fastResult.skill,
            confidence: fallbackConfidence,
            method: 'fast',
            latencyMs: performance.now() - t0,
            trace: context?.trace ? trace : undefined
          };
        }
        
        return {
          skill: null,
          confidence: 0,
          method: 'no-match',
          latencyMs: performance.now() - t0,
          trace: context?.trace ? trace : undefined
        };
      }

      if (context?.trace) {
        try {
          const topK = await this.semanticRouter.matchTopK(query, fingerprints, 5);
          trace.semanticResults = topK.map(r => ({
            skillName: r.skill.name,
            similarity: r.similarity,
            confidence: r.confidence
          }));
        } catch (error) {
          console.warn('Failed to get semantic topK:', error);
        }
      }

      // Stage 3: Conflict Resolution
      try {
        const resolved = await this.conflictResolver.resolve(
          semResult.skill, 
          query, 
          fingerprints
        );

        if (context?.trace && resolved.conflictResolved) {
          trace.conflictCandidates = [resolved.skill.name, ...resolved.alternatives];
        }

        return this.buildResult(resolved, 'semantic', t0, context?.trace ? trace : undefined);
      } catch (error) {
        console.warn('Conflict resolution failed:', error);
        // Use semantic result directly
        return this.buildResult({
          skill: semResult.skill,
          confidence: semResult.confidence,
          conflictResolved: false,
          alternatives: []
        }, 'semantic', t0, context?.trace ? trace : undefined);
      }
    } catch (error) {
      console.error('Routing error:', error);
      return this.createNoMatchResult(t0);
    }
  }

  /**
   * Route with detailed scoring for all skills (for explain command).
   * 
   * Returns scores for every skill, useful for debugging and explanation.
   * 
   * @param query - User query string
   * @returns Result with all skill scores
   * @throws Never throws - returns partial results on error
   */
  async routeWithDetails(query: string): Promise<{
    result: RouteResult;
    allScores: SkillScore[];
  }> {
    const t0 = performance.now();
    
    try {
      let fingerprints: SkillFingerprint[];
      try {
        fingerprints = await this.index.getAll();
      } catch (error) {
        console.error('Failed to load skill index:', error);
        return {
          result: this.createNoMatchResult(t0),
          allScores: []
        };
      }
      
      // Get fast scores for all
      const fastScores = fingerprints.map(skill => {
        try {
          const match = this.fastRouter.match(query, [skill], 0);
          return { skill, fastScore: match?.score || 0 };
        } catch (error) {
          return { skill, fastScore: 0 };
        }
      });

      // Get semantic scores for all
      let semanticMap = new Map<string, number>();
      try {
        const semanticResults = await this.semanticRouter.matchTopK(
          query, 
          fingerprints, 
          fingerprints.length
        );
        semanticMap = new Map(semanticResults.map(r => [r.skill.id, r.confidence]));
      } catch (error) {
        console.warn('Semantic scoring failed:', error);
      }

      // Combine scores
      const allScores = fastScores.map(({ skill, fastScore }) => ({
        skill,
        fastScore,
        semanticScore: semanticMap.get(skill.id) || 0
      }));

      // Sort by combined score
      allScores.sort((a, b) => {
        const combinedA = a.fastScore + a.semanticScore * 10;
        const combinedB = b.fastScore + b.semanticScore * 10;
        return combinedB - combinedA;
      });

      // Get final result using normal routing
      const result = await this.route(query);
      result.latencyMs = performance.now() - t0;

      return { result, allScores };
    } catch (error) {
      console.error('RouteWithDetails error:', error);
      return {
        result: this.createNoMatchResult(t0),
        allScores: []
      };
    }
  }

  /**
   * Build a route result from resolution data.
   */
  private buildResult(
    data: ConflictResolutionResult,
    method: RouteResult['method'],
    t0: number,
    trace?: RouteTrace
  ): RouteResult {
    const baseConfidence = data.confidence;
    const finalConfidence = baseConfidence * (data.skill?.feedbackWeight ?? 1);

    return {
      skill: data.skill,
      confidence: finalConfidence,
      method,
      conflictResolved: data.conflictResolved,
      conflictAlternatives: data.alternatives,
      resolutionReason: data.resolutionReason,
      latencyMs: performance.now() - t0,
      trace
    };
  }

  /**
   * Create a safe no-match result.
   */
  private createNoMatchResult(t0: number): RouteResult {
    return {
      skill: null,
      confidence: 0,
      method: 'no-match',
      latencyMs: performance.now() - t0
    };
  }

  /**
   * Update router configuration.
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current router configuration.
   * 
   * @returns Current configuration (copy)
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }
}
