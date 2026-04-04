/**
 * SKILL.md Parser
 * 
 * Parses SKILL.md files and extracts:
 * - Frontmatter metadata (name, description, requires, route)
 * - Raw content for further processing
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

export interface SkillMeta {
  name?: string;
  description?: string;
  requires?: {
    env?: string[];
    bins?: string[];
  };
  route?: {
    triggers?: string[];
    priority?: number;
    prefer_when?: string[];
    side_effects?: 'read-only' | 'write-local' | 'write-remote' | 'network';
  };
  [key: string]: unknown;
}

export interface ParsedSkill {
  raw: string;
  meta: SkillMeta;
  content: string;
}

export async function parseSkillMd(skillPath: string): Promise<ParsedSkill> {
  // Handle both direct file path and directory path
  let filePath = skillPath;
  const stats = await fs.stat(skillPath);
  
  if (stats.isDirectory()) {
    filePath = path.join(skillPath, 'SKILL.md');
  }

  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(raw);

  return {
    raw,
    meta: parsed.data as SkillMeta,
    content: parsed.content
  };
}

export function parseSkillMdSync(raw: string): ParsedSkill {
  const parsed = matter(raw);

  return {
    raw,
    meta: parsed.data as SkillMeta,
    content: parsed.content
  };
}
