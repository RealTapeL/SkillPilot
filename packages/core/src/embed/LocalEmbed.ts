/**
 * Local ONNX Embedding Provider
 * 
 * Uses all-MiniLM-L6-v2 model via ONNX Runtime
 * - 30MB model size
 * - 384-dimensional embeddings
 * - Fully offline, no API calls
 */

import * as ort from 'onnxruntime-node';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EmbedProvider, normalizeVector } from './EmbedProvider.js';

// Simple tokenizer for all-MiniLM-L6-v2
// This is a simplified version - in production, use a proper tokenizer
const VOCAB: Record<string, number> = {
  '[PAD]': 0, '[UNK]': 1, '[CLS]': 2, '[SEP]': 3, '[MASK]': 4,
  // Common words - this is a minimal vocab for demo
  'the': 5, 'a': 6, 'an': 7, 'to': 8, 'of': 9, 'in': 10, 'and': 11,
  'for': 12, 'with': 13, 'is': 14, 'are': 15, 'was': 16, 'were': 17,
  'be': 18, 'been': 19, 'have': 20, 'has': 21, 'had': 22, 'do': 23,
  'does': 24, 'did': 25, 'will': 26, 'would': 27, 'could': 28, 'should': 29,
  'can': 30, 'may': 31, 'might': 32, 'must': 33, 'shall': 34,
  'github': 100, 'git': 101, 'repository': 102, 'repo': 103, 'issue': 104,
  'pr': 105, 'pull': 106, 'request': 107, 'commit': 108, 'branch': 109,
  'merge': 110, 'push': 111, 'clone': 112, 'fetch': 113, 'slack': 114,
  'message': 115, 'send': 116, 'channel': 117, 'notification': 118,
  'create': 200, 'delete': 201, 'update': 202, 'get': 203, 'list': 204,
  'search': 205, 'find': 206, 'show': 207, 'display': 208, 'open': 209,
  'close': 210, 'run': 211, 'execute': 212, 'build': 213, 'test': 214,
  'deploy': 215, 'install': 216, 'configure': 217, 'setup': 218,
  'file': 300, 'directory': 301, 'folder': 302, 'path': 303, 'content': 304,
  'read': 305, 'write': 306, 'edit': 307, 'modify': 308, 'rename': 309,
  'copy': 310, 'move': 311, 'remove': 312, 'code': 400, 'function': 401,
  'class': 402, 'method': 403, 'variable': 404, 'import': 405, 'export': 406,
  'api': 500, 'http': 501, 'http_request': 502, 'response': 503, 'json': 504,
  'data': 505, 'database': 506, 'db': 507, 'query': 508, 'server': 509,
  'client': 510, 'web': 511, 'url': 512, 'endpoint': 513
};

const MAX_SEQ_LENGTH = 128;

export class LocalEmbedProvider implements EmbedProvider {
  readonly name = 'local-onnx';
  private session: ort.InferenceSession | null = null;
  private modelPath: string;

  constructor(modelPath?: string) {
    // Default to a model in user's home directory
    this.modelPath = modelPath || path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.skillpilot',
      'models',
      'all-MiniLM-L6-v2.onnx'
    );
  }

  async initialize(): Promise<void> {
    if (this.session) return;

    // Check if model exists, if not create a dummy session for demo
    try {
      await fs.access(this.modelPath);
      this.session = await ort.InferenceSession.create(this.modelPath);
    } catch {
      // Model not found - we'll use a fallback embedding method
      console.warn(`ONNX model not found at ${this.modelPath}, using fallback embedding`);
      this.session = null;
    }
  }

  getDimension(): number {
    return this.session ? 384 : 384; // all-MiniLM-L6-v2 outputs 384-dim vectors
  }

  async embed(text: string): Promise<number[]> {
    await this.initialize();
    
    if (!this.session) {
      // Fallback: use simple hash-based embedding for demo
      return this.fallbackEmbed(text);
    }

    const tokens = this.tokenize(text);
    const inputTensor = new ort.Tensor('int64', BigInt64Array.from(tokens.map(BigInt)), [1, tokens.length]);
    
    const results = await this.session.run({
      input_ids: inputTensor
    });

    // Extract pooled output (CLS token embedding)
    const output = results.pooled_output || results.last_hidden_state;
    const data = output.data as Float32Array;
    
    return normalizeVector(Array.from(data));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Process sequentially for simplicity
    const embeddings: number[][] = [];
    for (const text of texts) {
      embeddings.push(await this.embed(text));
    }
    return embeddings;
  }

  private tokenize(text: string): number[] {
    // Simple word-level tokenization
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);

    const tokens: number[] = [VOCAB['[CLS]']];
    
    for (const word of words.slice(0, MAX_SEQ_LENGTH - 2)) {
      tokens.push(VOCAB[word] || VOCAB['[UNK]']);
    }
    
    tokens.push(VOCAB['[SEP]']);
    
    // Pad to MAX_SEQ_LENGTH
    while (tokens.length < MAX_SEQ_LENGTH) {
      tokens.push(VOCAB['[PAD]']);
    }
    
    return tokens;
  }

  private fallbackEmbed(text: string): number[] {
    // Simple hash-based embedding for demo/testing
    // In production, this would download and use the actual ONNX model
    const embedding: number[] = new Array(384).fill(0);
    const words = text.toLowerCase().split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        const idx = (charCode + i * 31 + j * 17) % 384;
        embedding[idx] += (charCode % 100) / 100;
      }
    }
    
    return normalizeVector(embedding);
  }
}
