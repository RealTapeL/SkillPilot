/**
 * OpenClaw Adapter for SkillPilot
 * 
 * Integrates SkillPilot as an OpenClaw plugin.
 * Hooks into before_dispatch to route skills before LLM inference.
 */

import { 
  SkillRouter, 
  SkillIndex, 
  LocalEmbedProvider,
  SkillFingerprint,
  FeedbackRecorder
} from '@skillpilot/core';

// Types for OpenClaw Plugin SDK (mocked for now)
interface OpenClawAPI {
  config: OpenClawConfig;
  registerHook(name: string, handler: (ctx: HookContext) => Promise<HookResult | void>): void;
  registerCommand(config: { name: string; description: string; run: (args: string[], ctx: any) => Promise<void> }): void;
}

interface OpenClawConfig {
  hardRouteThreshold: number;
  softInjectThreshold: number;
  showRoutingInfo: boolean;
  showConflictInfo: boolean;
}

interface HookContext {
  message: { text: string };
  injectSystemContext: (context: string) => void;
  appendFooter: (text: string) => void;
  setMetadata: (key: string, value: unknown) => void;
  metadata?: Record<string, unknown>;
}

interface HookResult {
  cancel?: boolean;
}

// Skill context builder
function buildSkillContext(skill: SkillFingerprint): string {
  return `You have a skill available: ${skill.name}
Description: ${skill.description}
Use this skill to answer the user's request.`;
}

function buildSoftContext(skill: SkillFingerprint): string {
  return `You may find this skill relevant: ${skill.name}
Description: ${skill.description}`;
}

function formatStats(stats: { totalSkills: number; conflictGroups: number }): string {
  return `SkillPilot Status:
- Indexed skills: ${stats.totalSkills}
- Conflict groups: ${stats.conflictGroups}`;
}

function formatConflicts(groups: Array<{ id: string; skillIds: string[] }>): string {
  if (groups.length === 0) return 'No conflicts detected.';
  
  return groups.map(g => `${g.id}: ${g.skillIds.join(', ')}`).join('\n');
}

// Main plugin entry
export class OpenClawAdapter {
  private router: SkillRouter | null = null;
  private index: SkillIndex | null = null;
  private feedbackRecorder: FeedbackRecorder | null = null;

  async initialize(api: OpenClawAPI, skillDir: string): Promise<void> {
    const embed = new LocalEmbedProvider();
    await embed.initialize();

    this.index = await SkillIndex.load(skillDir);
    this.router = new SkillRouter(this.index, embed, {
      hardRouteThreshold: api.config.hardRouteThreshold,
      softInjectThreshold: api.config.softInjectThreshold
    });
    this.feedbackRecorder = new FeedbackRecorder(this.index);

    this.registerHooks(api);
    this.registerCommands(api);
  }

  private registerHooks(api: OpenClawAPI): void {
    // before_dispatch hook - main routing logic
    api.registerHook('before_dispatch', async (ctx: HookContext): Promise<HookResult | void> => {
      if (!this.router) return;

      const result = await this.router.route(ctx.message.text);

      if (result.confidence >= api.config.hardRouteThreshold && result.skill) {
        // High confidence: inject skill context
        ctx.injectSystemContext(buildSkillContext(result.skill));
        ctx.setMetadata('skillpilot', result);

        if (result.conflictResolved && api.config.showConflictInfo) {
          ctx.appendFooter(
            `\n_SkillPilot: chose \`${result.skill.name}\` over [${result.conflictAlternatives?.join(', ')}]_`
          );
        }

        return { cancel: false };
      }

      if (result.confidence >= api.config.softInjectThreshold && result.skill) {
        // Medium confidence: soft inject context
        ctx.injectSystemContext(buildSoftContext(result.skill));
      }
    });

    // before_agent_reply hook - add routing info footer
    api.registerHook('before_agent_reply', async (ctx: HookContext): Promise<void> => {
      const meta = ctx.metadata?.skillpilot as { skill?: { name: string }; latencyMs?: number } | undefined;
      if (meta && api.config.showRoutingInfo) {
        ctx.appendFooter(`\n_via ${meta.skill?.name} · ${meta.latencyMs?.toFixed(0)}ms_`);
      }
    });
  }

  private registerCommands(api: OpenClawAPI): void {
    api.registerCommand({
      name: 'skillpilot',
      description: 'SkillPilot status and diagnostics',
      run: async (args: string[], ctx: any): Promise<void> => {
        if (!this.router || !this.index) {
          ctx.reply('SkillPilot not initialized');
          return;
        }

        const subcmd = args[0];

        if (subcmd === 'explain') {
          const query = args.slice(1).join(' ');
          const result = await this.router.route(query, { trace: true });
          ctx.reply(JSON.stringify(result, null, 2));
        } else if (subcmd === 'conflicts') {
          const conflicts = this.index.getConflictGroups();
          ctx.reply(formatConflicts(conflicts));
        } else if (subcmd === 'stats') {
          const stats = this.index.getStats();
          ctx.reply(formatStats(stats));
        } else {
          const stats = this.index.getStats();
          ctx.reply(formatStats(stats));
        }
      }
    });
  }
}

// Plugin entry point (for OpenClaw to import)
export function createOpenClawPlugin() {
  return {
    id: 'skillpilot',
    name: 'SkillPilot',
    version: '0.1.0',

    async register(api: OpenClawAPI): Promise<void> {
      const skillDir = process.env.OPENCLAW_SKILL_DIR || '~/.openclaw/skills';
      const adapter = new OpenClawAdapter();
      await adapter.initialize(api, skillDir);
    }
  };
}

// Default export for OpenClaw plugin system
export default createOpenClawPlugin;
