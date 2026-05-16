/**
 * OpenClaw Adapter for SkillPilot
 * 
 * Integrates SkillPilot as an OpenClaw plugin.
 * Hooks into before_dispatch to route skills before LLM inference.
 */

import { 
  SkillIndex, 
  LocalEmbedProvider,
  SkillFingerprint,
  FeedbackRecorder,
  ClawHubAwareRouter,
  GradualAdoptionManager,
  adoptionManager,
  clawHubClient
} from '@realtapel/skillpilot-core';

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
  enableClawHubSearch: boolean;
  autoInstallSkills: boolean;
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
  private router: ClawHubAwareRouter | null = null;
  private index: SkillIndex | null = null;
  private feedbackRecorder: FeedbackRecorder | null = null;
  private adoptionManager: GradualAdoptionManager | null = null;

  async initialize(api: OpenClawAPI, skillDir: string): Promise<void> {
    const embed = new LocalEmbedProvider();
    await embed.initialize();

    this.index = await SkillIndex.load(skillDir);
    this.adoptionManager = adoptionManager;
    
    // Initialize with ClawHub-aware router
    this.router = new ClawHubAwareRouter(
      this.index, 
      embed,
      {
        hardRouteThreshold: api.config.hardRouteThreshold,
        softInjectThreshold: api.config.softInjectThreshold
      }
    );
    this.feedbackRecorder = new FeedbackRecorder(this.index);

    this.registerHooks(api);
    this.registerCommands(api);
  }

  private registerHooks(api: OpenClawAPI): void {
    // before_dispatch hook - main routing logic
    api.registerHook('before_dispatch', async (ctx: HookContext): Promise<HookResult | void> => {
      if (!this.router) return;

      // Use ClawHub-aware routing
      const result = await this.router.routeWithClawHub(ctx.message.text);

      // Check for ClawHub results (low/no local match)
      if (api.config.enableClawHubSearch && result.clawHubResults?.matched) {
        const clawHubSkills = result.clawHubResults.skills;
        if (clawHubSkills.length > 0) {
          // Show ClawHub suggestions to user
          const suggestions = clawHubSkills
            .slice(0, 3)
            .map((s: { skill: { name: string; description: string }; confidence: number }) => 
              `  • ${s.skill.name} (${(s.confidence * 100).toFixed(0)}%) - ${s.skill.description}`
            )
            .join('\n');
          
          ctx.appendFooter(`\n💡 Found skills in ClawHub that might help:\n${suggestions}`);
        }
      }

      // High confidence AND can auto-execute (not in observation stage)
      if (result.confidence >= api.config.hardRouteThreshold && result.skill && result.canAutoExecute) {
        ctx.injectSystemContext(buildSkillContext(result.skill));
        ctx.setMetadata('skillpilot', result);

        let footerNotes: string[] = [];
        
        if (result.conflictResolved && api.config.showConflictInfo) {
          footerNotes.push(`chose \`${result.skill.name}\` over [${result.conflictAlternatives?.join(', ')}]`);
        }

        // Show adoption stage info
        if (result.adoptionStage && result.adoptionStage !== 'trusted') {
          footerNotes.push(`${result.skill.name} in ${result.adoptionStage} stage`);
        }

        if (footerNotes.length > 0) {
          ctx.appendFooter(`\n_SkillPilot: ${footerNotes.join(' · ')}_`);
        }

        return { cancel: false };
      }

      // Medium confidence: soft inject context
      if (result.confidence >= api.config.softInjectThreshold && result.skill) {
        ctx.injectSystemContext(buildSoftContext(result.skill));
        
        // Show adoption stage for new skills
        if (result.adoptionStage && result.adoptionStage !== 'trusted') {
          ctx.appendFooter(`\n_SkillPilot: ${result.skill.name} in ${result.adoptionStage} stage_`);
        }
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
          const result = await this.router.routeWithClawHub(query);
          ctx.reply(JSON.stringify(result, null, 2));
        } else if (subcmd === 'conflicts') {
          const conflicts = this.index.getConflictGroups();
          ctx.reply(formatConflicts(conflicts));
        } else if (subcmd === 'stats') {
          const stats = this.index.getStats();
          ctx.reply(formatStats(stats));
        } else if (subcmd === 'search') {
          const query = args.slice(1).join(' ');
          const results = await clawHubClient.searchSkills(query);
          const formatted = results.map((r: { name: string; rating: number; description: string }) => 
            `• ${r.name} (⭐${r.rating})\n  ${r.description}`
          ).join('\n\n');
          ctx.reply(`ClawHub search results for "${query}":\n\n${formatted}`);
        } else if (subcmd === 'adoption') {
          const skillName = args[1];
          if (skillName && this.adoptionManager) {
            const stats = this.adoptionManager.getAdoptionStats(skillName);
            if (stats) {
              ctx.reply(`Skill adoption status for ${skillName}:\n` +
                `• Stage: ${stats.stage}\n` +
                `• Usage count: ${stats.observationCount}\n` +
                `• Success rate: ${(stats.successRate * 100).toFixed(1)}%\n` +
                `• Effective weight: ${(stats.weight * 100).toFixed(0)}%`
              );
            } else {
              ctx.reply(`No adoption data for ${skillName} (fully trusted skill)`);
            }
          } else {
            ctx.reply('Usage: skillpilot adoption <skill-name>');
          }
        } else if (subcmd === 'feedback') {
          const skillName = args[1];
          const feedback = args[2] === 'good' ? true : args[2] === 'bad' ? false : null;
          
          if (skillName && feedback !== null && this.adoptionManager) {
            this.adoptionManager.recordFeedback(skillName, feedback);
            const stats = this.adoptionManager.getAdoptionStats(skillName);
            ctx.reply(`Recorded ${feedback ? 'positive' : 'negative'} feedback for ${skillName}\n` +
              `New stage: ${stats?.stage || 'trusted'}`);
          } else {
            ctx.reply('Usage: skillpilot feedback <skill-name> good|bad');
          }
        } else {
          const stats = this.index.getStats();
          ctx.reply(formatStats(stats) + 
            `\n\nCommands available:\n` +
            `  skillpilot stats - Show status\n` +
            `  skillpilot explain <query> - Debug routing\n` +
            `  skillpilot conflicts - Show skill conflicts\n` +
            `  skillpilot search <query> - Search ClawHub\n` +
            `  skillpilot adoption <skill-name> - Check adoption stage\n` +
            `  skillpilot feedback <skill-name> good|bad - Give feedback`
          );
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
