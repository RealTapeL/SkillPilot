/**
 * Feedback Recorder
 * 
 * Records routing feedback for self-learning.
 * Accumulates feedback and updates skill weights.
 */

import { SkillIndex } from '../index/SkillIndex.js';

export type FeedbackSignal =
  | { type: 'confirmed'; skillId: string; query: string }
  | { type: 'corrected'; wrongSkillId: string; rightSkillId: string; query: string }
  | { type: 'ignored'; skillId: string; query: string };

export interface FeedbackRecorderConfig {
  /** Batch size before applying weight updates */
  batchSize: number;
  /** Enable/disable feedback recording */
  enabled: boolean;
}

export const DEFAULT_FEEDBACK_CONFIG: FeedbackRecorderConfig = {
  batchSize: 10,
  enabled: true
};

export class FeedbackRecorder {
  private pendingUpdates: FeedbackSignal[] = [];
  private config: FeedbackRecorderConfig;

  constructor(
    private index: SkillIndex,
    config: Partial<FeedbackRecorderConfig> = {}
  ) {
    this.config = { ...DEFAULT_FEEDBACK_CONFIG, ...config };
  }

  /**
   * Record a feedback signal
   */
  async record(signal: FeedbackSignal): Promise<void> {
    if (!this.config.enabled) return;

    this.pendingUpdates.push(signal);
    
    // Store in index for persistence
    this.index.recordFeedback({
      type: signal.type,
      query: signal.query,
      skillId: signal.type === 'corrected' ? signal.rightSkillId : signal.skillId,
      wrongSkillId: signal.type === 'corrected' ? signal.wrongSkillId : undefined
    });

    // Flush if batch size reached
    if (this.pendingUpdates.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Record that a routed skill was confirmed (used correctly)
   */
  async confirm(skillId: string, query: string): Promise<void> {
    await this.record({ type: 'confirmed', skillId, query });
  }

  /**
   * Record that a routing was corrected by the user
   */
  async correct(wrongSkillId: string, rightSkillId: string, query: string): Promise<void> {
    await this.record({ type: 'corrected', wrongSkillId, rightSkillId, query });
  }

  /**
   * Record that a routed skill was ignored
   */
  async ignore(skillId: string, query: string): Promise<void> {
    await this.record({ type: 'ignored', skillId, query });
  }

  /**
   * Apply pending weight updates
   */
  async flush(): Promise<void> {
    if (this.pendingUpdates.length === 0) return;

    const updates = [...this.pendingUpdates];
    this.pendingUpdates = [];

    for (const signal of updates) {
      switch (signal.type) {
        case 'confirmed':
          // Correct routing: small boost
          await this.index.updateWeight(signal.skillId, w => Math.min(w * 1.05, 2.0));
          break;

        case 'corrected':
          // Wrong routing: decrease wrong skill, boost right skill
          await this.index.updateWeight(signal.wrongSkillId, w => Math.max(w * 0.85, 0.1));
          await this.index.updateWeight(signal.rightSkillId, w => Math.min(w * 1.1, 2.0));
          break;

        case 'ignored':
          // Ignored: slight decrease
          await this.index.updateWeight(signal.skillId, w => Math.max(w * 0.95, 0.3));
          break;
      }
    }
  }

  /**
   * Get pending feedback count
   */
  getPendingCount(): number {
    return this.pendingUpdates.length;
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<FeedbackRecorderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
