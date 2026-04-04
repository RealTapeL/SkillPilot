/**
 * Terminal Output Formatter
 * 
 * Provides colored, formatted output for CLI commands.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { RouteResult, SkillFingerprint, ConflictGroup, IndexStats } from '@skillpilot/core';

export class Formatter {
  /**
   * Format a route result for display
   */
  static formatRouteResult(result: RouteResult, query: string): string {
    const lines: string[] = [];
    
    lines.push(chalk.bold('\nQuery:') + ` "${query}"`);
    lines.push(chalk.gray('─'.repeat(50)));

    if (!result.skill) {
      lines.push(chalk.yellow('⚠ No matching skill found'));
      lines.push(chalk.gray(`Method: ${result.method} | Latency: ${result.latencyMs.toFixed(0)}ms`));
      return lines.join('\n');
    }

    const confidence = result.confidence;
    const confidenceColor = confidence >= 0.8 ? chalk.green : 
                           confidence >= 0.5 ? chalk.yellow : chalk.red;
    
    lines.push(chalk.green('✓') + ' ' + chalk.bold(result.skill.name) + 
               chalk.gray(`  (confidence: ${confidenceColor(confidence.toFixed(2))}, method: ${result.method}, ${result.latencyMs.toFixed(0)}ms)`));
    
    if (result.skill.description) {
      lines.push(chalk.gray('  ' + result.skill.description.slice(0, 100) + 
                            (result.skill.description.length > 100 ? '...' : '')));
    }

    if (result.resolutionReason) {
      lines.push(chalk.cyan('  ↳ ' + result.resolutionReason));
    }

    if (result.conflictResolved && result.conflictAlternatives && result.conflictAlternatives.length > 0) {
      lines.push(chalk.gray(`  Alternatives considered: ${result.conflictAlternatives.join(', ')}`));
    }

    return lines.join('\n');
  }

  /**
   * Format route result as JSON
   */
  static formatRouteResultJson(result: RouteResult): string {
    return JSON.stringify({
      skill: result.skill ? {
        id: result.skill.id,
        name: result.skill.name,
        description: result.skill.description
      } : null,
      confidence: result.confidence,
      method: result.method,
      conflictResolved: result.conflictResolved,
      conflictAlternatives: result.conflictAlternatives,
      resolutionReason: result.resolutionReason,
      latencyMs: result.latencyMs
    }, null, 2);
  }

  /**
   * Format detailed route explanation
   */
  static formatRouteExplain(result: RouteResult, allScores: Array<{ skill: SkillFingerprint; fastScore: number; semanticScore: number }>, query: string): string {
    const lines: string[] = [];
    
    lines.push(chalk.bold('Query:') + ` "${query}"`);
    lines.push(chalk.gray('═'.repeat(50)));

    // Fast path section
    lines.push(chalk.bold('\nFast Path:'));
    if (result.trace?.fastResult) {
      lines.push(`  Score: ${result.trace.fastResult.score.toFixed(1)}/10`);
      if (result.trace.fastResult.matchedTrigger) {
        lines.push(`  Matched trigger: "${result.trace.fastResult.matchedTrigger}"`);
      }
      if (result.trace.fastResult.matchedKeywords.length > 0) {
        lines.push(`  Matched keywords: ${result.trace.fastResult.matchedKeywords.join(', ')}`);
      }
    } else {
      lines.push(chalk.gray('  No fast path match'));
    }

    // Semantic path section
    lines.push(chalk.bold('\nSemantic Path:'));
    if (result.trace?.semanticResults && result.trace.semanticResults.length > 0) {
      for (const r of result.trace.semanticResults.slice(0, 5)) {
        const bar = '█'.repeat(Math.round(r.confidence * 20)) + 
                    '░'.repeat(20 - Math.round(r.confidence * 20));
        const marker = r.skillName === result.skill?.name ? chalk.green(' ← winner') : '';
        lines.push(`  ${r.skillName.padEnd(15)} ${r.similarity.toFixed(2)} ${chalk.cyan(bar)}${marker}`);
      }
    } else {
      lines.push(chalk.gray('  Semantic results not available in trace'));
    }

    // Conflict resolution section
    if (result.conflictResolved) {
      lines.push(chalk.bold('\nConflict Resolver:'));
      lines.push(`  Chose ${chalk.bold(result.skill?.name)} over [${result.conflictAlternatives?.join(', ')}]`);
      if (result.resolutionReason) {
        lines.push(`  Reason: ${result.resolutionReason}`);
      }
    }

    // Final result
    lines.push(chalk.bold('\nFinal:'));
    if (result.skill) {
      const weight = result.skill.feedbackWeight;
      lines.push(`  ${result.skill.name} (${result.confidence.toFixed(2)} ${weight !== 1.0 ? `× weight ${weight.toFixed(2)}` : ''})`);
    } else {
      lines.push(chalk.yellow('  No match'));
    }

    return lines.join('\n');
  }

  /**
   * Format conflict groups
   */
  static formatConflicts(groups: ConflictGroup[]): string {
    if (groups.length === 0) {
      return chalk.green('No conflicts detected. All skills are distinct.');
    }

    const lines: string[] = [];
    lines.push(chalk.bold(`Found ${groups.length} conflict group${groups.length > 1 ? 's' : ''}:\n`));

    for (const group of groups) {
      const simColor = group.maxSimilarity >= 0.9 ? chalk.red : 
                       group.maxSimilarity >= 0.85 ? chalk.yellow : chalk.green;
      lines.push(chalk.bold(`Conflict ${group.id}`) + 
                 chalk.gray(` (similarity ${simColor(group.maxSimilarity.toFixed(2))})`));
      lines.push('  ' + group.skillIds.join(chalk.gray(' · ')));
      
      if (group.skillIds.length > 1) {
        lines.push(chalk.gray('  Tip: Add route.prefer_when to disambiguate\n'));
      }
    }

    return lines.join('\n');
  }

  /**
   * Format index statistics
   */
  static formatStats(stats: IndexStats): string {
    const lines: string[] = [];
    
    lines.push(chalk.bold('SkillPilot Index Statistics'));
    lines.push(chalk.gray('─'.repeat(40)));
    
    const table = new Table({
      style: { border: [] },
      colWidths: [25, 20]
    });

    table.push(
      ['Total Skills:', chalk.bold(stats.totalSkills.toString())],
      ['Conflict Groups:', stats.conflictGroups > 0 ? chalk.yellow(stats.conflictGroups.toString()) : chalk.green('0')],
      ['Embed Provider:', stats.embedProvider],
      ['Last Updated:', stats.lastUpdated > 0 ? new Date(stats.lastUpdated).toLocaleString() : chalk.gray('Never')]
    );

    lines.push(table.toString());
    
    return lines.join('\n');
  }

  /**
   * Format index build result
   */
  static formatIndexResult(totalIndexed: number, conflictGroups: number, errors: Array<{ path: string; error: string }>): string {
    const lines: string[] = [];
    
    lines.push(chalk.green('✓') + ` Indexed ${chalk.bold(totalIndexed.toString())} skills`);
    
    if (conflictGroups > 0) {
      lines.push(chalk.yellow('⚠') + ` Found ${conflictGroups} conflict group${conflictGroups > 1 ? 's' : ''}`);
    }

    if (errors.length > 0) {
      lines.push(chalk.red(`\n✗ ${errors.length} error${errors.length > 1 ? 's' : ''}:`));
      for (const err of errors.slice(0, 5)) {
        lines.push(chalk.gray(`  ${err.path}: ${err.error}`));
      }
      if (errors.length > 5) {
        lines.push(chalk.gray(`  ... and ${errors.length - 5} more`));
      }
    }

    return lines.join('\n');
  }

  /**
   * Format error message
   */
  static formatError(message: string): string {
    return chalk.red('✗ Error: ') + message;
  }

  /**
   * Format success message
   */
  static formatSuccess(message: string): string {
    return chalk.green('✓ ') + message;
  }

  /**
   * Format warning message
   */
  static formatWarning(message: string): string {
    return chalk.yellow('⚠ ') + message;
  }
}
