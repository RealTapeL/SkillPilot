/**
 * ClawHub Router Extension
 * 
 * Extends SkillRouter with ClawHub auto-discovery:
 * - Low confidence local match → search ClawHub
 * - Return remote skill options for user consideration
 * - Auto-install option with one click
 */

import { SkillRouter, RouteResult } from '../router/SkillRouter.js';
import { SkillIndex } from '../index/SkillIndex.js';
import { ClawHubClient, ClawHubSkill, clawHubClient } from './ClawHubClient.js';
import { SkillFingerprint } from '../fingerprint/Fingerprinter.js';
import { GradualAdoptionManager, adoptionManager } from './GradualAdoption.js';

/**
 * Extended route result with ClawHub options
 */
export interface ClawHubRouteResult extends RouteResult {
  clawHubResults?: {
    matched: boolean;
    skills: Array<{
      skill: ClawHubSkill;
      confidence: number;
      installable: boolean;
    }>;
  };
}

/**
 * ClawHub-aware skill router
 */
export class ClawHubAwareRouter extends SkillRouter {
  private clawHubClient: ClawHubClient;
  private localIndex: SkillIndex;
  protected adoptionManager: GradualAdoptionManager;

  constructor(
    index: SkillIndex,
    embed: any,
    config: any,
    clawHub?: ClawHubClient,
    adoptionMgr?: GradualAdoptionManager
  ) {
    super(index, embed, config);
    this.localIndex = index;
    this.clawHubClient = clawHub || clawHubClient;
    this.adoptionManager = adoptionMgr || adoptionManager;
  }

  /**
   * Route with ClawHub fallback
   */
  async routeWithClawHub(query: string, context?: any): Promise<ClawHubRouteResult> {
    // First: try local routing
    const localResult = await this.route(query, context);
    
    // If high confidence local match, return immediately
    if (localResult.confidence >= 0.5 && localResult.skill) {
      return localResult;
    }

    // Low confidence local match → search ClawHub
    const clawHubSkills = await this.clawHubClient.searchSkills(query, {
      limit: 5,
      minRating: 3.5
    });

    // If no ClawHub results either, return original
    if (clawHubSkills.length === 0) {
      return localResult;
    }

    // Calculate confidence for ClawHub skills
    const scoredClawHubSkills = clawHubSkills.map(skill => {
      const confidence = this.calculateRemoteSkillConfidence(query, skill);
      return {
        skill,
        confidence,
        installable: true
      };
    }).filter(s => s.confidence >= 0.3);

    // Return extended result
    return {
      ...localResult,
      clawHubResults: {
        matched: scoredClawHubSkills.length > 0,
        skills: scoredClawHubSkills
      }
    };
  }

  /**
   * Calculate confidence score for a remote skill
   */
  private calculateRemoteSkillConfidence(query: string, skill: ClawHubSkill): number {
    let score = 0;
    const queryLower = query.toLowerCase();

    // Name match
    if (skill.name.toLowerCase().includes(queryLower)) score += 0.3;

    // Description match
    if (skill.description.toLowerCase().includes(queryLower)) score += 0.25;

    // Tag match
    for (const tag of skill.tags) {
      if (queryLower.includes(tag.toLowerCase())) score += 0.2;
    }

    // Rating boost (0.1 - 0.2)
    score += (skill.rating / 10);

    // Popularity boost (0 - 0.1)
    score += Math.min(skill.downloads / 50000, 0.1);

    return Math.min(score, 1.0);
  }

  /**
   * Install a ClawHub skill and add it to the local index
   */
  async installAndIndexSkill(skillId: string, targetDir: string): Promise<boolean> {
    const success = await this.clawHubClient.installSkill(skillId, targetDir);
    
    if (success) {
      // Register new skill for gradual adoption
      this.adoptionManager?.registerNewSkill(skillId);
    }

    return success;
  }
}
