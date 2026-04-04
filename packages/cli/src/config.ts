/**
 * Configuration utilities for CLI
 */

import * as path from 'path';
import * as os from 'os';
import { cosmiconfigSync } from 'cosmiconfig';
import { z } from 'zod';

const configSchema = z.object({
  router: z.object({
    hardRouteThreshold: z.number().min(0).max(1).default(0.80),
    softInjectThreshold: z.number().min(0).max(1).default(0.45),
    enableSemantic: z.boolean().default(true),
    debug: z.boolean().default(false)
  }).default({}),
  embed: z.object({
    provider: z.enum(['openai', 'local-onnx']).default('local-onnx'),
    openaiModel: z.string().default('text-embedding-3-small')
  }).default({}),
  index: z.object({
    skillDirs: z.array(z.string()).default([]),
    refreshInterval: z.number().default(5),
    conflictThreshold: z.number().min(0).max(1).default(0.85)
  }).default({}),
  feedback: z.object({
    enabled: z.boolean().default(true),
    batchSize: z.number().default(10)
  }).default({}),
  cli: z.object({
    outputFormat: z.enum(['human', 'json']).default('human')
  }).default({})
});

export type Config = z.infer<typeof configSchema>;

const explorer = cosmiconfigSync('skillpilot', {
  searchPlaces: [
    '.skillpilotrc',
    '.skillpilotrc.json',
    '.skillpilotrc.yaml',
    '.skillpilotrc.yml',
    'skillpilot.config.js',
    'skillpilot.config.json'
  ]
});

export function getConfig(): Config {
  const result = explorer.search();
  
  if (result && result.config) {
    return configSchema.parse(result.config);
  }
  
  return configSchema.parse({});
}

export function getDataDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.skillpilot', 'index');
}

export function getConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.skillpilot');
}
