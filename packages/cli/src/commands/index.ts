/**
 * Index Command
 * 
 * skillpilot index <dirs...>
 * Builds skill index from specified directories.
 */

import { Command } from 'commander';
import ora from 'ora';
import { 
  SkillIndex, 
  IndexBuilder, 
  LocalEmbedProvider 
} from '@realtapel/skillpilot-core';
import { getDataDir, getConfig } from '../config.js';
import { Formatter } from '../output/Formatter.js';

export function registerIndexCommand(program: Command): void {
  program
    .command('index')
    .description('Build skill index from directories')
    .argument('<dirs...>', 'Skill directories to index')
    .option('-r, --reindex', 'Force full reindex (clear existing)')
    .action(async (dirs: string[], options) => {
      const spinner = ora('Initializing...').start();

      try {
        const dataDir = getDataDir();
        const embed = new LocalEmbedProvider();
        await embed.initialize();

        const index = new SkillIndex(dataDir);
        const builder = new IndexBuilder(embed);

        spinner.text = 'Scanning skill directories...';

        // Expand home directory in paths
        const expandedDirs = dirs.map(d => d.replace(/^~/, process.env.HOME || '~'));

        const result = await builder.build(index, {
          skillDirs: expandedDirs,
          onProgress: (current, total, name) => {
            spinner.text = `Indexing: ${name} (${current}/${total})`;
          }
        });

        spinner.stop();

        console.log(Formatter.formatIndexResult(
          result.totalIndexed,
          result.conflictGroups,
          result.errors
        ));

        index.close();
      } catch (err) {
        spinner.stop();
        console.error(Formatter.formatError(String(err)));
        process.exit(1);
      }
    });
}
