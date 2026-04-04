/**
 * OpenAI Embedding Provider
 * 
 * Uses OpenAI's text-embedding-3-small model
 * - 1536-dimensional embeddings
 * - High quality, requires API key
 */

import { EmbedProvider, normalizeVector } from './EmbedProvider.js';

export interface OpenAIEmbedConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAIEmbedProvider implements EmbedProvider {
  readonly name = 'openai';
  private config: OpenAIEmbedConfig;

  constructor(config: OpenAIEmbedConfig) {
    this.config = {
      model: 'text-embedding-3-small',
      ...config
    };
  }

  getDimension(): number {
    return 1536;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(
      `${this.config.baseUrl || 'https://api.openai.com/v1'}/embeddings`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
          encoding_format: 'float'
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return normalizeVector(data.data[0].embedding);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(
      `${this.config.baseUrl || 'https://api.openai.com/v1'}/embeddings`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.model,
          input: texts,
          encoding_format: 'float'
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map(d => normalizeVector(d.embedding));
  }
}
