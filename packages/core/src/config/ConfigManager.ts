/**
 * Configuration Manager
 * 
 * Unified configuration management with validation, defaults, and environment overrides.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

/**
 * Complete SkillPilot configuration
 */
export interface SkillPilotConfig {
  /** Router configuration */
  router: RouterConfig;
  /** Embedding provider configuration */
  embed: EmbedConfig;
  /** Index configuration */
  index: IndexConfig;
  /** Feedback system configuration */
  feedback: FeedbackConfig;
  /** CLI display configuration */
  cli: CliConfig;
}

export interface RouterConfig {
  /** Fast path minimum score (0-10) */
  fastRouteMinScore: number;
  /** Hard route threshold (0-1) */
  hardRouteThreshold: number;
  /** Soft inject threshold (0-1) */
  softInjectThreshold: number;
  /** Enable semantic matching */
  enableSemantic: boolean;
}

export interface EmbedConfig {
  /** Provider type */
  provider: 'local-onnx' | 'openai';
  /** OpenAI API key (if using openai provider) */
  openaiApiKey?: string;
  /** OpenAI model name */
  openaiModel: string;
  /** Local model path override */
  modelPath?: string;
}

export interface IndexConfig {
  /** Skill directories to index */
  skillDirs: string[];
  /** Auto-refresh interval in minutes */
  refreshInterval: number;
  /** Conflict detection threshold (0-1) */
  conflictThreshold: number;
}

export interface FeedbackConfig {
  /** Enable feedback recording */
  enabled: boolean;
  /** Batch size before writing to disk */
  batchSize: number;
}

export interface CliConfig {
  /** Output format */
  outputFormat: 'human' | 'json';
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: SkillPilotConfig = {
  router: {
    fastRouteMinScore: 6,
    hardRouteThreshold: 0.70,
    softInjectThreshold: 0.40,
    enableSemantic: true
  },
  embed: {
    provider: 'local-onnx',
    openaiModel: 'text-embedding-3-small'
  },
  index: {
    skillDirs: [],
    refreshInterval: 5,
    conflictThreshold: 0.85
  },
  feedback: {
    enabled: true,
    batchSize: 10
  },
  cli: {
    outputFormat: 'human'
  }
};

/**
 * Environment-based configuration overrides
 */
export const ENV_OVERRIDES: Record<string, string> = {
  SKILLPILOT_HARD_THRESHOLD: 'router.hardRouteThreshold',
  SKILLPILOT_SOFT_THRESHOLD: 'router.softInjectThreshold',
  SKILLPILOT_FAST_MIN_SCORE: 'router.fastRouteMinScore',
  SKILLPILOT_EMBED_PROVIDER: 'embed.provider',
  SKILLPILOT_OPENAI_KEY: 'embed.openaiApiKey',
  SKILLPILOT_OUTPUT_FORMAT: 'cli.outputFormat'
};

/**
 * Configuration presets for common scenarios
 */
export const CONFIG_PRESETS = {
  /** High accuracy, lower speed */
  accurate: {
    router: {
      fastRouteMinScore: 8,
      hardRouteThreshold: 0.85,
      softInjectThreshold: 0.60,
      enableSemantic: true
    }
  },
  /** High speed, lower accuracy */
  fast: {
    router: {
      fastRouteMinScore: 4,
      hardRouteThreshold: 0.50,
      softInjectThreshold: 0.20,
      enableSemantic: false
    }
  },
  /** Balanced (default) */
  balanced: DEFAULT_CONFIG.router,
  /** Test environment - relaxed thresholds */
  test: {
    router: {
      fastRouteMinScore: 6,
      hardRouteThreshold: 0.30,
      softInjectThreshold: 0.15,
      enableSemantic: true
    }
  }
};

/**
 * Manages SkillPilot configuration with validation and environment overrides.
 */
export class ConfigManager {
  private config: SkillPilotConfig;
  private configPath: string;

  /**
   * Create a new ConfigManager.
   * 
   * @param configPath - Optional custom config file path
   */
  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Get the default configuration file path.
   */
  private getDefaultConfigPath(): string {
    return path.join(os.homedir(), '.skillpilot', 'config.yaml');
  }

  /**
   * Load configuration from file and environment.
   * 
   * Loads in order (later overrides earlier):
   * 1. Default config
   * 2. Config file
   * 3. Environment variables
   */
  async load(): Promise<void> {
    // Start with defaults
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // Load from file
    try {
      await this.loadFromFile();
    } catch (error) {
      console.log('[Config] No config file found, using defaults');
    }

    // Apply environment overrides
    this.loadFromEnvironment();

    // Validate
    this.validate();
  }

  /**
   * Load configuration from YAML file.
   */
  private async loadFromFile(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = this.parseYaml(content);
      this.config = this.deepMerge(this.config, parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  /**
   * Simple YAML parser for basic config files.
   */
  private parseYaml(content: string): Partial<SkillPilotConfig> {
    const result: any = {};
    let currentSection: string | null = null;
    let currentArray: string[] | null = null;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Section header
      if (trimmed.endsWith(':') && !trimmed.includes(' - ')) {
        const key = trimmed.slice(0, -1);
        result[key] = {};
        currentSection = key;
        currentArray = null;
        continue;
      }

      // Array item
      if (trimmed.startsWith('- ')) {
        const item = trimmed.slice(2);
        if (currentArray) {
          currentArray.push(item);
        }
        continue;
      }

      // Key-value pair
      const match = trimmed.match(/^(\w+):\s*(.+)$/);
      if (match && currentSection) {
        const [, key, value] = match;
        const parsedValue = this.parseValue(value);
        
        if (parsedValue === '') {
          currentArray = [];
          result[currentSection][key] = currentArray;
        } else {
          result[currentSection][key] = parsedValue;
          currentArray = null;
        }
      }
    }

    return result;
  }

  /**
   * Parse a YAML value to appropriate type.
   */
  private parseValue(value: string): any {
    const trimmed = value.trim();
    
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1);
    }
    
    return trimmed;
  }

  /**
   * Load configuration from environment variables.
   */
  private loadFromEnvironment(): void {
    for (const [envVar, configPath] of Object.entries(ENV_OVERRIDES)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setNestedValue(this.config, configPath, this.parseValue(value));
      }
    }
  }

  /**
   * Set a nested value by path.
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Deep merge two objects.
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Validate configuration values.
   */
  private validate(): void {
    const { router, embed, index } = this.config;

    if (router.fastRouteMinScore < 0 || router.fastRouteMinScore > 10) {
      throw new Error('router.fastRouteMinScore must be between 0 and 10');
    }
    if (router.hardRouteThreshold < 0 || router.hardRouteThreshold > 1) {
      throw new Error('router.hardRouteThreshold must be between 0 and 1');
    }
    if (router.softInjectThreshold < 0 || router.softInjectThreshold > 1) {
      throw new Error('router.softInjectThreshold must be between 0 and 1');
    }
    if (!['local-onnx', 'openai'].includes(embed.provider)) {
      throw new Error('embed.provider must be "local-onnx" or "openai"');
    }
    if (embed.provider === 'openai' && !embed.openaiApiKey) {
      throw new Error('embed.openaiApiKey is required when using openai provider');
    }
    if (index.conflictThreshold < 0 || index.conflictThreshold > 1) {
      throw new Error('index.conflictThreshold must be between 0 and 1');
    }
  }

  /**
   * Get current configuration.
   */
  getConfig(): SkillPilotConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Get router configuration.
   */
  getRouterConfig(): RouterConfig {
    return { ...this.config.router };
  }

  /**
   * Apply a configuration preset.
   */
  applyPreset(presetName: keyof typeof CONFIG_PRESETS): void {
    const preset = CONFIG_PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}`);
    }
    
    this.config.router = { ...this.config.router, ...preset.router };
  }

  /**
   * Save current configuration to file.
   */
  async save(): Promise<void> {
    const yaml = this.toYaml(this.config);
    const dir = path.dirname(this.configPath);
    
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {}
    
    await fs.writeFile(this.configPath, yaml, 'utf-8');
  }

  /**
   * Convert configuration to YAML string.
   */
  private toYaml(config: SkillPilotConfig): string {
    const lines: string[] = [
      '# SkillPilot Configuration',
      '# Generated automatically - edit with care',
      ''
    ];

    lines.push('router:');
    lines.push(`  fastRouteMinScore: ${config.router.fastRouteMinScore}`);
    lines.push(`  hardRouteThreshold: ${config.router.hardRouteThreshold}`);
    lines.push(`  softInjectThreshold: ${config.router.softInjectThreshold}`);
    lines.push(`  enableSemantic: ${config.router.enableSemantic}`);
    lines.push('');

    lines.push('embed:');
    lines.push(`  provider: ${config.embed.provider}`);
    lines.push(`  openaiModel: ${config.embed.openaiModel}`);
    if (config.embed.openaiApiKey) {
      lines.push(`  openaiApiKey: "${config.embed.openaiApiKey}"`);
    }
    lines.push('');

    lines.push('index:');
    lines.push('  skillDirs:');
    for (const dir of config.index.skillDirs) {
      lines.push(`    - ${dir}`);
    }
    lines.push(`  refreshInterval: ${config.index.refreshInterval}`);
    lines.push(`  conflictThreshold: ${config.index.conflictThreshold}`);
    lines.push('');

    lines.push('feedback:');
    lines.push(`  enabled: ${config.feedback.enabled}`);
    lines.push(`  batchSize: ${config.feedback.batchSize}`);
    lines.push('');

    lines.push('cli:');
    lines.push(`  outputFormat: ${config.cli.outputFormat}`);

    return lines.join('\n');
  }
}
