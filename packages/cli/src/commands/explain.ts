/**
 * Explain Command
 * 
 * skillpilot explain "<query>"
 * Explains the routing decision with detailed scoring.
 */

import { Command } from 'commander';
import { 
  SkillIndex, 
  SkillRouter, 
  LocalEmbedProvider,
  DEFAULT_ROUTER_CONFIG
} from '@realtapel/skillpilot-core';
import { getDataDir } from '../config.js';
import { Formatter } from '../output/Formatter.js';

export function registerExplainCommand(program: Command): void {
  program
    .command('explain')
    .description('Explain routing decision with detailed scoring')
    .argument('<query>', 'Query to explain')
    .action(async (query: string) => {
      try {
        const dataDir = getDataDir();
        const embed = new LocalEmbedProvider();
        await embed.initialize();

        const index = new SkillIndex(dataDir);
        
        const stats = index.getStats();
        if (stats.totalSkills === 0) {
          console.error(Formatter.formatError('No skills indexed. Run `skillpilot index <dirs...>` first.'));
          index.close();
          process.exit(1);
        }

        const router = new SkillRouter(index, embed, DEFAULT_ROUTER_CONFIG);
        
        // Route with trace enabled
        const result = await router.route(query, { trace: true });
        
        // Get detailed scores
        const { allScores } = await router.routeWithDetails(query);

        console.log(Formatter.formatRouteExplain(result, allScores, query));

        index.close();
      } catch (err) {
        console.error(Formatter.formatError(String(err)));
        process.exit(1);
      }
    });
}
