/**
 * Embedding Provider Abstract Interface
 * 
 * Provides unified interface for text embedding,
 * supporting both cloud (OpenAI) and local (ONNX) providers.
 */

export interface EmbedProvider {
  /**
   * Generate embedding vector for text
   * @param text Input text
   * @returns Embedding vector (number array)
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batch processing)
   * @param texts Array of input texts
   * @returns Array of embedding vectors
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get the dimension of embedding vectors
   */
  getDimension(): number;

  /**
   * Provider name
   */
  readonly name: string;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions don't match: ${a.length} vs ${b.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalize a vector to unit length
 */
export function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
}
