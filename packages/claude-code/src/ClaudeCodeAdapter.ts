/**
 * Claude Code Adapter for SkillPilot
 * 
 * This adapter allows Claude Code to use SkillPilot for skill routing.
 * 
 * Usage in CLAUDE.md:
 * ```markdown
 * ## SkillPilot Integration
 * 
 * Before processing any message, run:
 * ```bash
 * skillpilot-claude "$MESSAGE"
 * ```
 * If output is non-empty, use that skill to answer the user.
 * ```
 */

import { 
  SkillRouter, 
  SkillIndex, 
  LocalEmbedProvider,
  DEFAULT_ROUTER_CONFIG
} from '@skillpilot/core';

export interface ClaudeCodeAdapterOptions {
  skillDir?: string;
  dataDir?: string;
  hardRouteThreshold?: number;
  softInjectThreshold?: number;
}

export class ClaudeCodeAdapter {
  private router: SkillRouter | null = null;
  private index: SkillIndex | null = null;

  async initialize(options: ClaudeCodeAdapterOptions = {}): Promise<void> {
    const skillDir = options.skillDir || process.env.SKILLROUTE_SKILL_DIR || '~/.claude/skills';
    const dataDir = options.dataDir;

    const embed = new LocalEmbedProvider();
    await embed.initialize();

    this.index = await SkillIndex.load(skillDir, dataDir);
    this.router = new SkillRouter(this.index, embed, {
      ...DEFAULT_ROUTER_CONFIG,
      hardRouteThreshold: options.hardRouteThreshold ?? DEFAULT_ROUTER_CONFIG.hardRouteThreshold,
      softInjectThreshold: options.softInjectThreshold ?? DEFAULT_ROUTER_CONFIG.softInjectThreshold
    });
  }

  /**
   * Route a query and return the result
   */
  async route(query: string): Promise<{
    skill: { name: string; description: string } | null;
    confidence: number;
    shouldUseSkill: boolean;
    context?: string;
  }> {
    if (!this.router) {
      throw new Error('Adapter not initialized');
    }

    const result = await this.router.route(query);

    if (!result.skill) {
      return {
        skill: null,
        confidence: 0,
        shouldUseSkill: false
      };
    }

    const shouldUseSkill = result.confidence >= this.router.getConfig().hardRouteThreshold;

    return {
      skill: {
        name: result.skill.name,
        description: result.skill.description
      },
      confidence: result.confidence,
      shouldUseSkill,
      context: shouldUseSkill ? this.buildContext(result.skill) : undefined
    };
  }

  private buildContext(skill: { name: string; description: string }): string {
    return `Use the ${skill.name} skill to handle this request.
Skill description: ${skill.description}`;
  }

  /**
   * Close the adapter and release resources
   */
  close(): void {
    this.index?.close();
  }
}

// CLI entry point
export async function main(): Promise<void> {
  const query = process.argv[2];
  
  if (!query) {
    console.error('Usage: skillpilot-claude "<query>"');
    process.exit(1);
  }

  const adapter = new ClaudeCodeAdapter();
  await adapter.initialize();

  try {
    const result = await adapter.route(query);
    
    // Output JSON for Claude Code to parse
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    adapter.close();
  }
}
