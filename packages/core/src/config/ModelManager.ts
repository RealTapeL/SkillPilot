/**
 * Model Manager
 * 
 * Manages downloading and caching of ONNX embedding models.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createWriteStream } from 'fs';
import https from 'https';

/**
 * Available model definitions
 */
export const AVAILABLE_MODELS = {
  'all-MiniLM-L6-v2': {
    name: 'all-MiniLM-L6-v2',
    description: 'Lightweight sentence transformer (recommended)',
    size: '23MB',
    dimensions: 384,
    url: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx',
    fallbackUrls: [
      'https://github.com/RealTapeL/SkillPilot/releases/download/models/all-MiniLM-L6-v2.onnx'
    ]
  }
};

export type ModelName = keyof typeof AVAILABLE_MODELS;

/**
 * Model download progress callback
 */
export type ProgressCallback = (downloaded: number, total: number) => void;

/**
 * Manages ONNX model downloading and caching.
 */
export class ModelManager {
  private modelsDir: string;

  /**
   * Create a new ModelManager.
   * 
   * @param modelsDir - Custom models directory (default: ~/.skillpilot/models)
   */
  constructor(modelsDir?: string) {
    this.modelsDir = modelsDir || path.join(os.homedir(), '.skillpilot', 'models');
  }

  /**
   * Get the path to a model file.
   */
  getModelPath(modelName: ModelName): string {
    return path.join(this.modelsDir, `${modelName}.onnx`);
  }

  /**
   * Check if a model is already downloaded.
   */
  async isModelAvailable(modelName: ModelName): Promise<boolean> {
    try {
      const modelPath = this.getModelPath(modelName);
      await fs.access(modelPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get model info and availability status.
   */
  async getModelStatus(modelName: ModelName): Promise<{
    name: string;
    description: string;
    size: string;
    dimensions: number;
    available: boolean;
    path: string;
  }> {
    const model = AVAILABLE_MODELS[modelName];
    if (!model) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    return {
      name: model.name,
      description: model.description,
      size: model.size,
      dimensions: model.dimensions,
      available: await this.isModelAvailable(modelName),
      path: this.getModelPath(modelName)
    };
  }

  /**
   * Download a model from Hugging Face or fallback URLs.
   * 
   * @param modelName - Name of the model to download
   * @param onProgress - Optional progress callback
   * @returns Path to downloaded model
   */
  async downloadModel(
    modelName: ModelName = 'all-MiniLM-L6-v2',
    onProgress?: ProgressCallback
  ): Promise<string> {
    const model = AVAILABLE_MODELS[modelName];
    if (!model) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    // Check if already exists
    const modelPath = this.getModelPath(modelName);
    if (await this.isModelAvailable(modelName)) {
      console.log(`[ModelManager] Model ${modelName} already exists at ${modelPath}`);
      return modelPath;
    }

    // Ensure models directory exists
    await fs.mkdir(this.modelsDir, { recursive: true });

    // Try primary URL first
    const urls = [model.url, ...model.fallbackUrls];
    
    for (const url of urls) {
      try {
        console.log(`[ModelManager] Downloading ${modelName} from ${url}...`);
        const tempPath = `${modelPath}.tmp`;
        
        await this.downloadFile(url, tempPath, onProgress);
        
        // Rename temp file to final
        await fs.rename(tempPath, modelPath);
        
        console.log(`[ModelManager] Successfully downloaded ${modelName}`);
        return modelPath;
      } catch (error) {
        console.warn(`[ModelManager] Failed to download from ${url}:`, error);
        // Try next URL
      }
    }

    throw new Error(`Failed to download ${modelName} from all sources`);
  }

  /**
   * Download a file from URL.
   */
  private downloadFile(
    url: string,
    destPath: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destPath);
      
      https.get(url, { 
        timeout: 60000,
        headers: {
          'User-Agent': 'SkillPilot-ModelManager/1.0'
        }
      }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlink(destPath).catch(() => {});
            this.downloadFile(redirectUrl, destPath, onProgress)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destPath).catch(() => {});
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;

        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (onProgress && total > 0) {
            onProgress(downloaded, total);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          file.close();
          fs.unlink(destPath).catch(() => {});
          reject(err);
        });
      }).on('error', (err) => {
        file.close();
        fs.unlink(destPath).catch(() => {});
        reject(err);
      });
    });
  }

  /**
   * List all available models and their status.
   */
  async listModels(): Promise<Array<{
    name: string;
    description: string;
    size: string;
    dimensions: number;
    available: boolean;
  }>> {
    const results = [];
    
    for (const [name, info] of Object.entries(AVAILABLE_MODELS)) {
      results.push({
        name: info.name,
        description: info.description,
        size: info.size,
        dimensions: info.dimensions,
        available: await this.isModelAvailable(name as ModelName)
      });
    }
    
    return results;
  }

  /**
   * Remove a downloaded model.
   */
  async removeModel(modelName: ModelName): Promise<void> {
    const modelPath = this.getModelPath(modelName);
    
    try {
      await fs.unlink(modelPath);
      console.log(`[ModelManager] Removed ${modelName}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get total size of downloaded models.
   */
  async getCacheSize(): Promise<number> {
    try {
      const files = await fs.readdir(this.modelsDir);
      let totalSize = 0;
      
      for (const file of files) {
        if (file.endsWith('.onnx')) {
          const stat = await fs.stat(path.join(this.modelsDir, file));
          totalSize += stat.size;
        }
      }
      
      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Format bytes to human readable string.
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
