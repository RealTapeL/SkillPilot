/**
 * Feedback Command
 * 
 * skillpilot feedback correct --wrong <id> --right <id> --query "<query>"
 * Records feedback for self-learning.
 */

import { Command } from 'commander';
import { 
  SkillIndex, 
  FeedbackRecorder 
} from '@realtapel/skillpilot-core';
import { getDataDir } from '../config.js';
import { Formatter } from '../output/Formatter.js';

export function registerFeedbackCommand(program: Command): void {
  const feedbackCmd = program
    .command('feedback')
    .description('Record routing feedback for self-learning');

  feedbackCmd
    .command('correct')
    .description('Record a correction (wrong routing)')
    .requiredOption('--wrong <id>', 'ID of wrongly routed skill')
    .requiredOption('--right <id>', 'ID of correctly used skill')
    .requiredOption('--query <query>', 'Original query')
    .action(async (options) => {
      try {
        const dataDir = getDataDir();
        const index = new SkillIndex(dataDir);
        const recorder = new FeedbackRecorder(index);

        await recorder.correct(options.wrong, options.right, options.query);
        await recorder.flush();

        console.log(Formatter.formatSuccess(
          `Recorded correction: ${options.wrong} → ${options.right}`
        ));

        index.close();
      } catch (err) {
        console.error(Formatter.formatError(String(err)));
        process.exit(1);
      }
    });

  feedbackCmd
    .command('confirm')
    .description('Confirm a routing was correct')
    .requiredOption('--skill <id>', 'ID of correctly routed skill')
    .requiredOption('--query <query>', 'Original query')
    .action(async (options) => {
      try {
        const dataDir = getDataDir();
        const index = new SkillIndex(dataDir);
        const recorder = new FeedbackRecorder(index);

        await recorder.confirm(options.skill, options.query);
        await recorder.flush();

        console.log(Formatter.formatSuccess(`Confirmed routing for ${options.skill}`));

        index.close();
      } catch (err) {
        console.error(Formatter.formatError(String(err)));
        process.exit(1);
      }
    });
}
