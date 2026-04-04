/**
 * Route Command
 * 
 * skillpilot route "<query>"
 * Routes a query and displays the result.
 */

import { Command } from 'commander';
import { 
  SkillIndex, 
  SkillRouter, 
  LocalEmbedProvider,
  DEFAULT_ROUTER_CONFIG
} from '@skillpilot/core';
import { getDataDir, getConfig } from '../config.js';
import { Formatter } from '../output/Formatter.js';

export function registerRouteCommand(program: Command): void {
  program
    .command('route')
    .description('Route a query to find the best matching skill')
    .argument('<query>', 'Query to route')
    .option('-j, --json', 'Output as JSON')
    .action(async (query: string, options) => {
      try {
        const dataDir = getDataDir();
        const embed = new LocalEmbedProvider();
        await embed.initialize();

        const index = new SkillIndex(dataDir);
        
        // Check if index is empty
        const stats = index.getStats();
        if (stats.totalSkills === 0) {
          console.error(Formatter.formatError('No skills indexed. Run `skillpilot index <dirs...>` first.'));
          index.close();
          process.exit(1);
        }

        const router = new SkillRouter(index, embed, DEFAULT_ROUTER_CONFIG);
        const result = await router.route(query);

        if (options.json) {
          console.log(Formatter.formatRouteResultJson(result));
        } else {
          console.log(Formatter.formatRouteResult(result, query));
        }

        index.close();
      } catch (err) {
        console.error(Formatter.formatError(String(err)));
        process.exit(1);
      }
    });
}
