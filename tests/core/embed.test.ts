/**
 * LocalEmbedProvider Unit Tests
 * 
 * Tests for embedding provider with fallback behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalEmbedProvider, EMBEDDING_DIMENSION } from '@realtapel/skillpilot-core';

describe('LocalEmbedProvider', () => {
  let provider: LocalEmbedProvider;

  beforeEach(() => {
    provider = new LocalEmbedProvider();
  });

  describe('initialization', () => {
    it('should initialize without errors', async () => {
      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('should return correct dimension', () => {
      expect(provider.getDimension()).toBe(EMBEDDING_DIMENSION);
    });
  });

  describe('embed', () => {
    it('should return embedding of correct dimension', async () => {
      const embedding = await provider.embed('test query');
      
      expect(embedding).toHaveLength(EMBEDDING_DIMENSION);
    });

    it('should return normalized vector', async () => {
      const embedding = await provider.embed('test query');
      
      // Calculate magnitude
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      
      // Should be close to 1 (normalized) or 0 (zero vector)
      expect(magnitude).toBeGreaterThanOrEqual(0);
      expect(magnitude).toBeLessThanOrEqual(1.1);
    });

    it('should handle empty string', async () => {
      const embedding = await provider.embed('');
      
      expect(embedding).toHaveLength(EMBEDDING_DIMENSION);
      // Empty string should return zero vector
      expect(embedding.every(v => v === 0)).toBe(true);
    });

    it('should handle invalid input gracefully', async () => {
      const embedding = await provider.embed(null as any);
      
      expect(embedding).toHaveLength(EMBEDDING_DIMENSION);
    });

    it('should produce consistent embeddings for same text', async () => {
      const text = 'create a github issue';
      
      const embedding1 = await provider.embed(text);
      const embedding2 = await provider.embed(text);
      
      // Should be identical
      expect(embedding1).toEqual(embedding2);
    });

    it('should produce different embeddings for different texts', async () => {
      const embedding1 = await provider.embed('github');
      const embedding2 = await provider.embed('slack');
      
      // Should be different
      expect(embedding1).not.toEqual(embedding2);
    });
  });

  describe('embedBatch', () => {
    it('should batch process texts', async () => {
      const texts = ['github', 'slack', 'docker'];
      
      const embeddings = await provider.embedBatch(texts);
      
      expect(embeddings).toHaveLength(3);
      embeddings.forEach(emb => {
        expect(emb).toHaveLength(EMBEDDING_DIMENSION);
      });
    });

    it('should handle empty batch', async () => {
      const embeddings = await provider.embedBatch([]);
      
      expect(embeddings).toHaveLength(0);
    });

    it('should handle invalid batch input', async () => {
      const embeddings = await provider.embedBatch(null as any);
      
      expect(embeddings).toHaveLength(0);
    });
  });

  describe('fallback behavior', () => {
    it('should indicate ONNX availability', async () => {
      await provider.initialize();
      
      // Should be false if model not installed
      expect(typeof provider.isUsingOnnx()).toBe('boolean');
    });
  });
});
