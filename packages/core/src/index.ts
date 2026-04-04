/**
 * SkillPilot Core - Universal Agent Skill Router
 * 
 * @packageDocumentation
 */

// Embedding providers
export { EmbedProvider, cosineSimilarity, normalizeVector } from './embed/EmbedProvider.js';
export { LocalEmbedProvider } from './embed/LocalEmbed.js';
export { OpenAIEmbedProvider, type OpenAIEmbedConfig } from './embed/OpenAIEmbed.js';

// Fingerprinting
export { 
  Fingerprinter, 
  type SkillFingerprint 
} from './fingerprint/Fingerprinter.js';
export { 
  ConflictDetector, 
  type ConflictGroup 
} from './fingerprint/ConflictDetector.js';
export { 
  parseSkillMd, 
  parseSkillMdSync, 
  type ParsedSkill, 
  type SkillMeta 
} from './fingerprint/SkillParser.js';

// Index
export { 
  SkillIndex, 
  type IndexStats 
} from './index/SkillIndex.js';
export { 
  IndexBuilder, 
  type IndexBuildOptions, 
  type IndexBuildResult 
} from './index/IndexBuilder.js';

// Router
export { FastRouter, type FastMatchResult } from './router/FastRouter.js';
export { 
  SemanticRouter, 
  type SemanticMatchResult, 
  type SemanticMatchOptions 
} from './router/SemanticRouter.js';
export { 
  ConflictResolver, 
  type ConflictResolutionResult 
} from './router/ConflictResolver.js';
export { 
  SkillRouter, 
  type RouterConfig, 
  type RouteResult, 
  type RouteContext, 
  type RouteTrace,
  DEFAULT_ROUTER_CONFIG 
} from './router/SkillRouter.js';

// Feedback
export { 
  FeedbackRecorder, 
  type FeedbackSignal, 
  type FeedbackRecorderConfig,
  DEFAULT_FEEDBACK_CONFIG 
} from './feedback/FeedbackRecorder.js';

// Version
export const VERSION = '0.1.0';
