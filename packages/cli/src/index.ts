#!/usr/bin/env node

/**
 * SkillPilot CLI
 * 
 * Universal Agent Skill Router - Command Line Interface
 */

import { Command } from 'commander';
import { registerIndexCommand } from './commands/index.js';
import { registerRouteCommand } from './commands/route.js';
import { registerExplainCommand } from './commands/explain.js';
import { registerConflictsCommand } from './commands/conflicts.js';
import { registerStatsCommand } from './commands/stats.js';
import { registerFeedbackCommand } from './commands/feedback.js';
import { VERSION } from '@skillpilot/core';

const program = new Command();

program
  .name('skillpilot')
  .description('Universal Agent Skill Router - Route skills before LLM inference')
  .version(VERSION, '-v, --version', 'Display version number')
  .helpOption('-h, --help', 'Display help');

// Register commands
registerIndexCommand(program);
registerRouteCommand(program);
registerExplainCommand(program);
registerConflictsCommand(program);
registerStatsCommand(program);
registerFeedbackCommand(program);

// Default action (show help)
program.action(() => {
  program.help();
});

program.parse();
