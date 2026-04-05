/**
 * Configuration and Model Management
 * 
 * Unified configuration system with presets, validation, and environment overrides.
 * Model management for downloading and caching ONNX models.
 */

export {
  ConfigManager,
  DEFAULT_CONFIG,
  CONFIG_PRESETS,
  ENV_OVERRIDES
} from './ConfigManager.js';

export type {
  SkillPilotConfig,
  RouterConfig,
  EmbedConfig,
  IndexConfig,
  FeedbackConfig,
  CliConfig
} from './ConfigManager.js';

export {
  ModelManager,
  AVAILABLE_MODELS
} from './ModelManager.js';

export type { ModelName, ProgressCallback } from './ModelManager.js';
