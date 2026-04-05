/**
 * Local ONNX Embedding Provider
 * 
 * Uses all-MiniLM-L6-v2 model via ONNX Runtime for local embeddings.
 * Falls back to hash-based embedding if ONNX model is not available.
 * 
 * Features:
 * - 30MB model size (when available)
 * - 384-dimensional embeddings
 * - Fully offline, no API calls
 * - Graceful fallback when model missing
 * 
 * @example
 * ```typescript
 * const embed = new LocalEmbedProvider();
 * await embed.initialize();
 * const vector = await embed.embed("create a GitHub issue");
 * // vector.length === 384
 * ```
 */

import * as ort from 'onnxruntime-node';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EmbedProvider, normalizeVector } from './EmbedProvider.js';

/** Provider name */
export const PROVIDER_NAME = 'local-onnx';

/** Embedding dimension */
export const EMBEDDING_DIMENSION = 384;

/** Maximum sequence length for tokenization */
export const MAX_SEQ_LENGTH = 128;

/** Vocabulary for simple tokenizer */
const VOCAB: Record<string, number> = {
  '[PAD]': 0, '[UNK]': 1, '[CLS]': 2, '[SEP]': 3, '[MASK]': 4,
  // Common words
  'the': 5, 'a': 6, 'an': 7, 'to': 8, 'of': 9, 'in': 10, 'and': 11,
  'for': 12, 'with': 13, 'is': 14, 'are': 15, 'was': 16, 'were': 17,
  'be': 18, 'been': 19, 'have': 20, 'has': 21, 'had': 22, 'do': 23,
  'does': 24, 'did': 25, 'will': 26, 'would': 27, 'could': 28, 'should': 29,
  'can': 30, 'may': 31, 'might': 32, 'must': 33, 'shall': 34,
  // Git/GitHub terms
  'github': 100, 'git': 101, 'repository': 102, 'repo': 103, 'issue': 104,
  'pr': 105, 'pull': 106, 'request': 107, 'commit': 108, 'branch': 109,
  'merge': 110, 'push': 111, 'clone': 112, 'fetch': 113, 'slack': 114,
  'message': 115, 'send': 116, 'channel': 117, 'notification': 118,
  // Actions
  'create': 200, 'delete': 201, 'update': 202, 'get': 203, 'list': 204,
  'search': 205, 'find': 206, 'show': 207, 'display': 208, 'open': 209,
  'close': 210, 'run': 211, 'execute': 212, 'build': 213, 'test': 214,
  'deploy': 215, 'install': 216, 'configure': 217, 'setup': 218,
  // File terms
  'file': 300, 'directory': 301, 'folder': 302, 'path': 303, 'content': 304,
  'read': 305, 'write': 306, 'edit': 307, 'modify': 308, 'rename': 309,
  'copy': 310, 'move': 311, 'remove': 312, 'code': 400, 'function': 401,
  'class': 402, 'method': 403, 'variable': 404, 'import': 405, 'export': 406,
  // API terms
  'api': 500, 'http': 501, 'http_request': 502, 'response': 503, 'json': 504,
  'data': 505, 'database': 506, 'db': 507, 'query': 508, 'server': 509,
  'client': 510, 'web': 511, 'url': 512, 'endpoint': 513
};

/** Token IDs */
const TOKEN_PAD = VOCAB['[PAD]'];
const TOKEN_UNK = VOCAB['[UNK]'];
const TOKEN_CLS = VOCAB['[CLS]'];
const TOKEN_SEP = VOCAB['[SEP]'];

/**
 * Local ONNX embedding provider with fallback.
 * 
 * Attempts to load all-MiniLM-L6-v2 ONNX model from ~/.skillpilot/models/.
 * If model not found, falls back to deterministic hash-based embedding.
 */
export class LocalEmbedProvider implements EmbedProvider {
  readonly name = PROVIDER_NAME;
  private session: ort.InferenceSession | null = null;
  private modelPath: string;
  private initialized = false;
  private initError: Error | null = null;

  /**
   * Create a new LocalEmbedProvider.
   * 
   * @param modelPath - Optional custom path to ONNX model file
   */
  constructor(modelPath?: string) {
    this.modelPath = modelPath || this.getDefaultModelPath();
  }

  /**
   * Get the default model path in user's home directory.
   */
  private getDefaultModelPath(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    return path.join(homeDir, '.skillpilot', 'models', 'all-MiniLM-L6-v2.onnx');
  }

  /**
   * Initialize the embedding provider.
   * 
   * Attempts to load ONNX model. If fails, falls back to hash-based embedding.
   * Safe to call multiple times - subsequent calls are no-ops.
   * 
   * @throws Never throws - failures are logged and fallback is used
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if model exists
      try {
        await fs.access(this.modelPath);
      } catch {
        // Model not found - will use fallback
        console.warn(`[LocalEmbed] ONNX model not found at ${this.modelPath}`);
        console.warn(`[LocalEmbed] Using fallback embedding (install model for better accuracy)`);
        this.session = null;
        this.initialized = true;
        return;
      }

      // Load ONNX model
      try {
        this.session = await ort.InferenceSession.create(this.modelPath);
        console.log(`[LocalEmbed] Loaded ONNX model from ${this.modelPath}`);
      } catch (error) {
        console.warn(`[LocalEmbed] Failed to load ONNX model:`, error);
        console.warn(`[LocalEmbed] Using fallback embedding`);
        this.session = null;
      }
    } catch (error) {
      console.error(`[LocalEmbed] Initialization error:`, error);
      this.initError = error instanceof Error ? error : new Error(String(error));
      this.session = null;
    } finally {
      this.initialized = true;
    }
  }

  /**
   * Get the embedding dimension.
   * 
   * @returns Always 384 (all-MiniLM-L6-v2 dimension)
   */
  getDimension(): number {
    return EMBEDDING_DIMENSION;
  }

  /**
   * Check if ONNX model is loaded (vs using fallback).
   * 
   * @returns true if using ONNX, false if using fallback
   */
  isUsingOnnx(): boolean {
    return this.session !== null;
  }

  /**
   * Generate embedding for a text.
   * 
   * Uses ONNX model if available, otherwise falls back to hash-based embedding.
   * 
   * @param text - Input text to embed
   * @returns 384-dimensional normalized vector
   * @throws Never throws - returns fallback on error
   */
  async embed(text: string): Promise<number[]> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Validate input
    if (!text || typeof text !== 'string') {
      console.warn('[LocalEmbed] Invalid input, returning zero vector');
      return new Array(EMBEDDING_DIMENSION).fill(0);
    }

    // Use fallback if no ONNX session
    if (!this.session) {
      return this.fallbackEmbed(text);
    }

    // Use ONNX model
    try {
      const tokens = this.tokenize(text);
      const inputTensor = new ort.Tensor(
        'int64', 
        BigInt64Array.from(tokens.map(BigInt)), 
        [1, tokens.length]
      );
      
      const results = await this.session.run({ input_ids: inputTensor });

      // Extract output
      const output = results.pooled_output || results.last_hidden_state;
      if (!output) {
        throw new Error('ONNX model output not found');
      }

      const data = output.data as Float32Array;
      if (!data || data.length !== EMBEDDING_DIMENSION) {
        throw new Error(`Unexpected output dimension: ${data?.length}`);
      }

      return normalizeVector(Array.from(data));
    } catch (error) {
      console.warn('[LocalEmbed] ONNX embedding failed, using fallback:', error);
      return this.fallbackEmbed(text);
    }
  }

  /**
   * Generate embeddings for multiple texts.
   * 
   * @param texts - Array of input texts
   * @returns Array of 384-dimensional vectors
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts)) {
      console.warn('[LocalEmbed] Invalid batch input');
      return [];
    }

    const embeddings: number[][] = [];
    
    for (const text of texts) {
      try {
        const embedding = await this.embed(text);
        embeddings.push(embedding);
      } catch (error) {
        console.warn('[LocalEmbed] Batch item failed:', error);
        // Push zero vector as fallback
        embeddings.push(new Array(EMBEDDING_DIMENSION).fill(0));
      }
    }

    return embeddings;
  }

  /**
   * Tokenize text for ONNX model input.
   * 
   * Simple word-level tokenization with vocabulary lookup.
   * 
   * @param text - Input text
   * @returns Array of token IDs
   */
  private tokenize(text: string): number[] {
    try {
      // Normalize text
      const normalized = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .trim();
      
      const words = normalized.split(/\s+/).filter(w => w.length > 0);

      // Build token sequence
      const tokens: number[] = [TOKEN_CLS];
      
      for (const word of words.slice(0, MAX_SEQ_LENGTH - 2)) {
        tokens.push(VOCAB[word] ?? TOKEN_UNK);
      }
      
      tokens.push(TOKEN_SEP);
      
      // Pad to MAX_SEQ_LENGTH
      while (tokens.length < MAX_SEQ_LENGTH) {
        tokens.push(TOKEN_PAD);
      }
      
      return tokens;
    } catch (error) {
      console.warn('[LocalEmbed] Tokenization failed:', error);
      // Return minimal valid sequence
      const tokens = [TOKEN_CLS, TOKEN_SEP];
      while (tokens.length < MAX_SEQ_LENGTH) {
        tokens.push(TOKEN_PAD);
      }
      return tokens;
    }
  }

  /**
   * Fallback embedding using deterministic hashing.
   * 
   * Used when ONNX model is not available. Produces consistent embeddings
   * for the same input text, but lower quality than ONNX.
   * 
   * @param text - Input text
   * @returns 384-dimensional normalized vector
   */
  private fallbackEmbed(text: string): number[] {
    try {
      const embedding = new Array(EMBEDDING_DIMENSION).fill(0);
      
      if (!text) {
        return normalizeVector(embedding);
      }

      const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        for (let j = 0; j < word.length; j++) {
          const charCode = word.charCodeAt(j);
          // Deterministic hash distribution
          const idx = (charCode + i * 31 + j * 17) % EMBEDDING_DIMENSION;
          embedding[idx] += (charCode % 100) / 100;
        }
      }
      
      return normalizeVector(embedding);
    } catch (error) {
      console.error('[LocalEmbed] Fallback embedding failed:', error);
      // Return zero vector as last resort
      return new Array(EMBEDDING_DIMENSION).fill(0);
    }
  }
}
