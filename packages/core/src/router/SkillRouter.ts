/**
 * Skill Router
 * 
 * Main router that orchestrates fast path, semantic path, and conflict resolution.
 * Three-stage routing: Fast → Semantic → Conflict Resolution
 */

import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';
import { SkillIndex } from '../index/SkillIndex.js';
import { FastRouter } from './FastRouter.js';
import { SemanticRouter } from './SemanticRouter.js';
import { ConflictResolver } from './ConflictResolver.js';
import { EmbedProvider } from '../embed/EmbedProvider.js';

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

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  fastRouteMinScore: 6,  // Lowered from 8 to catch more fuzzy matches
  hardRouteThreshold: 0.70,  // Lowered for better coverage
  softInjectThreshold: 0.40,
  enableSemantic: true
};

export interface RouteResult {
  skill: SkillFingerprint | null;
  confidence: number;
  method: 'fast' | 'semantic' | 'no-match';
  conflictResolved?: boolean;
  conflictAlternatives?: string[];
  resolutionReason?: string;
  latencyMs: number;
  trace?: RouteTrace;
}

export interface RouteTrace {
  fastResult?: { score: number; matchedTrigger?: string; matchedKeywords: string[] };
  semanticResults?: Array<{ skillName: string; similarity: number; confidence: number }>;
  conflictCandidates?: string[];
}

export interface RouteContext {
  trace?: boolean;
  userId?: string;
  sessionId?: string;
}

export class SkillRouter {
  private fastRouter: FastRouter;
  private semanticRouter: SemanticRouter;
  private conflictResolver: ConflictResolver;
  private config: RouterConfig;

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
   * Route a query to the best matching skill
   */
  async route(query: string, context?: RouteContext): Promise<RouteResult> {
    const t0 = performance.now();
    const fingerprints = await this.index.getAll();

    const trace: RouteTrace = {};

    // Stage 1: Fast Path (keyword + manual trigger matching)
    // Try with lower threshold to get potential fallback
    const fastResult = this.fastRouter.match(query, fingerprints, 4);
    
    if (fastResult) {
      // High confidence fast match - use immediately
      if (fastResult.score >= this.config.fastRouteMinScore) {
        const resolved = await this.conflictResolver.resolve(fastResult.skill, query, fingerprints);
        
        if (context?.trace) {
          trace.fastResult = {
            score: fastResult.score,
            matchedTrigger: fastResult.matchedTrigger,
            matchedKeywords: fastResult.matchedKeywords
          };
        }

        return this.buildResult(resolved, 'fast', t0, trace);
      }
      
      // Low confidence match - save for potential fallback
      trace.fastResult = {
        score: fastResult.score,
        matchedTrigger: fastResult.matchedTrigger,
        matchedKeywords: fastResult.matchedKeywords
      };
    }

    // Stage 2: Slow Path (semantic embedding matching)
    if (!this.config.enableSemantic) {
      return {
        skill: null,
        confidence: 0,
        method: 'no-match',
        latencyMs: performance.now() - t0,
        trace: context?.trace ? trace : undefined
      };
    }

    const semResult = await this.semanticRouter.match(query, fingerprints);
    
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
      const topK = await this.semanticRouter.matchTopK(query, fingerprints, 5);
      trace.semanticResults = topK.map(r => ({
        skillName: r.skill.name,
        similarity: r.similarity,
        confidence: r.confidence
      }));
    }

    // Stage 3: Conflict Resolution
    const resolved = await this.conflictResolver.resolve(semResult.skill, query, fingerprints);

    if (context?.trace && resolved.conflictResolved) {
      trace.conflictCandidates = [resolved.skill.name, ...resolved.alternatives];
    }

    return this.buildResult(resolved, 'semantic', t0, context?.trace ? trace : undefined);
  }

  /**
   * Route with detailed scoring for all skills (for explain command)
   */
  async routeWithDetails(query: string): Promise<{
    result: RouteResult;
    allScores: Array<{ skill: SkillFingerprint; fastScore: number; semanticScore: number }>;
  }> {
    const t0 = performance.now();
    const fingerprints = await this.index.getAll();
    
    // Get fast scores for all
    const fastScores = fingerprints.map(skill => {
      const match = this.fastRouter.match(query, [skill], 0);
      return { skill, fastScore: match?.score || 0 };
    });

    // Get semantic scores for all
    const semanticResults = await this.semanticRouter.matchTopK(query, fingerprints, fingerprints.length);
    const semanticMap = new Map(semanticResults.map(r => [r.skill.id, r.confidence]));

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
  }

  private buildResult(
    data: Awaited<ReturnType<ConflictResolver['resolve']>>,
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
   * Update router config
   */
  updateConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current config
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }
}
