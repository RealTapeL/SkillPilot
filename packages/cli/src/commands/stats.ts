/**
 * Stats Command
 * 
 * skillpilot stats
 * Shows index statistics.
 */

import { Command } from 'commander';
import { SkillIndex } from '@skillpilot/core';
import { getDataDir } from '../config.js';
import { Formatter } from '../output/Formatter.js';

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Show index statistics')
    .action(async () => {
      try {
        const dataDir = getDataDir();
        const index = new SkillIndex(dataDir);

        const stats = index.getStats();
        
        console.log(Formatter.formatStats(stats));

        index.close();
      } catch (err) {
        console.error(Formatter.formatError(String(err)));
        process.exit(1);
      }
    });
}
