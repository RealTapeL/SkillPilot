/**
 * Conflicts Command
 * 
 * skillpilot conflicts
 * Shows all detected conflict groups.
 */

import { Command } from 'commander';
import { SkillIndex } from '@realtapel/skillpilot-core';
import { getDataDir } from '../config.js';
import { Formatter } from '../output/Formatter.js';

export function registerConflictsCommand(program: Command): void {
  program
    .command('conflicts')
    .description('Show detected skill conflict groups')
    .action(async () => {
      try {
        const dataDir = getDataDir();
        const index = new SkillIndex(dataDir);

        const groups = index.getConflictGroups();
        
        console.log(Formatter.formatConflicts(groups));

        index.close();
      } catch (err) {
        console.error(Formatter.formatError(String(err)));
        process.exit(1);
      }
    });
}
