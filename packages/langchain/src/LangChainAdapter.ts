/**
 * LangChain Adapter for SkillPilot
 * 
 * Implements LangChain's BaseTool interface to provide
 * skill routing as a LangChain tool.
 */

import { 
  SkillRouter, 
  SkillIndex, 
  LocalEmbedProvider,
  SkillFingerprint,
  DEFAULT_ROUTER_CONFIG
} from '@realtapel/skillpilot-core';

// Minimal BaseTool-like interface to avoid peer dependency issues
interface ToolParams {
  name: string;
  description: string;
}

interface ToolResult {
  skill: string | null;
  description: string;
  confidence: number;
  shouldUse: boolean;
}

export interface LangChainAdapterOptions {
  skillDir?: string;
  dataDir?: string;
  name?: string;
  description?: string;
  hardRouteThreshold?: number;
  softInjectThreshold?: number;
}

/**
 * SkillPilotTool - LangChain-compatible tool
 * 
 * Usage:
 * ```typescript
 * import { SkillPilotTool } from '@realtapel/langchain';
 * 
 * const router = new SkillPilotTool({ skillDir: './skills' });
 * await router.initialize();
 * 
 * const result = await router.invoke("create a github issue");
 * // result = { skill: "github", description: "...", confidence: 0.94, shouldUse: true }
 * ```
 */
export class SkillPilotTool {
  name: string;
  description: string;

  private router: SkillRouter | null = null;
  private index: SkillIndex | null = null;
  private options: LangChainAdapterOptions;

  constructor(options: LangChainAdapterOptions = {}) {
    this.options = options;
    this.name = options.name || 'skill_router';
    this.description = options.description || 
      'Routes user intent to the most appropriate installed skill. ' +
      'Input: user query. ' +
      'Output: JSON with skill name, description, confidence, and shouldUse flag.';
  }

  /**
   * Initialize the tool
   */
  async initialize(): Promise<void> {
    const skillDir = this.options.skillDir || process.env.SKILLROUTE_SKILL_DIR || './skills';
    const dataDir = this.options.dataDir;

    const embed = new LocalEmbedProvider();
    await embed.initialize();

    this.index = await SkillIndex.load(skillDir, dataDir);
    this.router = new SkillRouter(this.index, embed, {
      ...DEFAULT_ROUTER_CONFIG,
      hardRouteThreshold: this.options.hardRouteThreshold ?? DEFAULT_ROUTER_CONFIG.hardRouteThreshold,
      softInjectThreshold: this.options.softInjectThreshold ?? DEFAULT_ROUTER_CONFIG.softInjectThreshold
    });
  }

  /**
   * Main tool invocation method
   */
  async invoke(query: string): Promise<ToolResult> {
    if (!this.router) {
      throw new Error('Tool not initialized. Call initialize() first.');
    }

    const result = await this.router.route(query);

    if (!result.skill) {
      return {
        skill: null,
        description: 'No matching skill found',
        confidence: 0,
        shouldUse: false
      };
    }

    return {
      skill: result.skill.name,
      description: result.skill.description,
      confidence: result.confidence,
      shouldUse: result.confidence >= this.router.getConfig().hardRouteThreshold
    };
  }

  /**
   * Get all available skills
   */
  async getAvailableSkills(): Promise<Array<{ id: string; name: string; description: string }>> {
    if (!this.index) {
      throw new Error('Tool not initialized. Call initialize() first.');
    }

    const fingerprints = this.index.getAll();
    return fingerprints.map(fp => ({
      id: fp.id,
      name: fp.name,
      description: fp.description
    }));
  }

  /**
   * Get conflict groups
   */
  async getConflictGroups(): Promise<Array<{ id: string; skills: string[] }>> {
    if (!this.index) {
      throw new Error('Tool not initialized. Call initialize() first.');
    }

    const groups = this.index.getConflictGroups();
    return groups.map(g => ({
      id: g.id,
      skills: g.skillIds
    }));
  }

  /**
   * Close the tool and release resources
   */
  close(): void {
    this.index?.close();
  }
}

/**
 * Create a LangChain-compatible tool function
 * 
 * This is a simpler alternative to the class-based approach.
 */
export async function createSkillRouterTool(options: LangChainAdapterOptions = {}) {
  const tool = new SkillPilotTool(options);
  await tool.initialize();
  return tool;
}
