/**
 * Gradual Skill Adoption System
 * 
 * New skills go through an observation period where they:
 * 1. Get lower initial confidence weight
 * 2. Don't auto-execute (show as option only)
 * 3. Gradually gain trust based on positive feedback
 * 
 * Prevents new/untested skills from breaking the routing flow.
 */

import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';

/**
 * Skill adoption stage
 */
export type AdoptionStage = 
  | 'observation'     // New skill - lower weight, no auto-execute
  | 'learning'        // Gaining trust - moderate weight, conditional auto-execute
  | 'trusted';        // Fully trusted - normal routing behavior

/**
 * Tracks skill adoption progress
 */
export interface SkillAdoptionState {
  skillId: string;
  stage: AdoptionStage;
  observationStart: number;
  observationCount: number;
  positiveFeedback: number;
  negativeFeedback: number;
  lastUsed: number;
}

/**
 * Configuration for gradual adoption
 */
export interface AdoptionConfig {
  /** Number of observations required to exit observation stage */
  observationThreshold: number;
  /** Success rate required to exit observation stage */
  successRateThreshold: number;
  /** Number of observations required to become fully trusted */
  fullTrustThreshold: number;
  /** Weight multiplier for observation stage */
  observationWeight: number;
  /** Weight multiplier for learning stage */
  learningWeight: number;
}

/**
 * Default adoption configuration
 */
export const DEFAULT_ADOPTION_CONFIG: AdoptionConfig = {
  observationThreshold: 5,
  successRateThreshold: 0.7,
  fullTrustThreshold: 20,
  observationWeight: 0.5,
  learningWeight: 0.8
};

/**
 * Manages gradual skill adoption
 */
export class GradualAdoptionManager {
  private states: Map<string, SkillAdoptionState> = new Map();
  private config: AdoptionConfig;

  constructor(config: Partial<AdoptionConfig> = {}) {
    this.config = { ...DEFAULT_ADOPTION_CONFIG, ...config };
  }

  /**
   * Register a new skill for adoption tracking
   */
  registerNewSkill(skillId: string): void {
    if (this.states.has(skillId)) return;

    this.states.set(skillId, {
      skillId,
      stage: 'observation',
      observationStart: Date.now(),
      observationCount: 0,
      positiveFeedback: 0,
      negativeFeedback: 0,
      lastUsed: Date.now()
    });
  }

  /**
   * Get the effective confidence weight for a skill
   * based on its adoption stage
   */
  getEffectiveWeight(skill: SkillFingerprint): number {
    const state = this.states.get(skill.id);
    
    // If not tracked (existing skill), full weight
    if (!state) return 1.0;

    // Apply stage-based weighting
    switch (state.stage) {
      case 'observation':
        return this.config.observationWeight;
      case 'learning':
        return this.config.learningWeight;
      case 'trusted':
        return 1.0;
      default:
        return 1.0;
    }
  }

  /**
   * Check if a skill should be allowed to auto-execute
   */
  canAutoExecute(skill: SkillFingerprint): boolean {
    const state = this.states.get(skill.id);
    
    // Existing skills can always auto-execute
    if (!state) return true;
    
    // Only trusted skills auto-execute by default
    return state.stage === 'trusted';
  }

  /**
   * Get the adoption stage of a skill
   */
  getStage(skillId: string): AdoptionStage {
    const state = this.states.get(skillId);
    return state?.stage || 'trusted';
  }

  /**
   * Record feedback and potentially advance adoption stage
   */
  recordFeedback(skillId: string, positive: boolean): void {
    const state = this.states.get(skillId);
    if (!state) return;

    state.observationCount++;
    state.lastUsed = Date.now();
    
    if (positive) {
      state.positiveFeedback++;
    } else {
      state.negativeFeedback++;
    }

    // Check for stage advancement
    this.evaluateStageAdvancement(state);
  }

  /**
   * Evaluate if a skill is ready to advance to the next stage
   */
  private evaluateStageAdvancement(state: SkillAdoptionState): void {
    const totalFeedback = state.positiveFeedback + state.negativeFeedback;
    
    if (totalFeedback === 0) return;

    const successRate = state.positiveFeedback / totalFeedback;

    // Observation → Learning
    if (state.stage === 'observation') {
      if (totalFeedback >= this.config.observationThreshold && 
          successRate >= this.config.successRateThreshold) {
        state.stage = 'learning';
      }
      return;
    }

    // Learning → Trusted
    if (state.stage === 'learning') {
      if (state.observationCount >= this.config.fullTrustThreshold && 
          successRate >= this.config.successRateThreshold) {
        state.stage = 'trusted';
      }
      return;
    }

    // Trusted stays trusted unless significant negative feedback
    if (state.stage === 'trusted' && totalFeedback >= 10) {
      // If success rate drops significantly, demote
      if (successRate < this.config.successRateThreshold * 0.8) {
        state.stage = 'learning';
      }
    }
  }

  /**
   * Get adoption statistics for debugging/UI
   */
  getAdoptionStats(skillId: string): {
    stage: AdoptionStage;
    observationCount: number;
    successRate: number;
    weight: number;
  } | null {
    const state = this.states.get(skillId);
    if (!state) return null;

    const total = state.positiveFeedback + state.negativeFeedback;
    const successRate = total > 0 ? state.positiveFeedback / total : 0;

    return {
      stage: state.stage,
      observationCount: state.observationCount,
      successRate,
      weight: state.stage === 'observation' 
        ? this.config.observationWeight 
        : state.stage === 'learning' 
          ? this.config.learningWeight 
          : 1.0
    };
  }

  /**
   * Load adoption states from storage
   */
  loadStates(states: Array<SkillAdoptionState>): void {
    for (const state of states) {
      this.states.set(state.skillId, state);
    }
  }

  /**
   * Save adoption states for persistence
   */
  saveStates(): Array<SkillAdoptionState> {
    return Array.from(this.states.values());
  }
}

// Export singleton
export const adoptionManager = new GradualAdoptionManager();
