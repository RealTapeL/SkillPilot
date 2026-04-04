# SkillPilot

> **Universal Agent Skill Router** — Route agent skills before LLM inference

[![Platform](https://img.shields.io/badge/platform-OpenClaw%20%7C%20Claude%20Code%20%7C%20Codex%20%7C%20LangChain-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

**Your agent has 1,000 skills. SkillPilot makes sure it uses the right one.**

---

## The Problem

Current agent frameworks (OpenClaw, Claude Code, Codex, etc.) handle skill selection by putting **all skill descriptions into the system prompt** and letting the LLM decide. This causes three issues:

| Problem | Impact |
|---------|--------|
| **Slow** | Wait 1-5 seconds for LLM to reason about which skill to use |
| **Expensive** | Every request includes thousands of tokens of skill descriptions |
| **Inaccurate** | More skills = more confusion for the LLM |

## The Solution

SkillPilot routes skills **before** LLM inference using vector semantic matching:

```
User Query
    ↓
SkillPilot Router (Fast Path: < 2ms)
    ↓
Semantic Matching (Vector similarity: < 20ms)
    ↓
Conflict Resolution (< 5ms)
    ↓
Execute Skill OR Inject Context
```

**Total routing time: < 25ms** — vs. 1-5 seconds waiting for LLM.

---

## Installation

```bash
# Install CLI
npm install -g skillpilot

# Or use with your agent framework
npm install @skillpilot/openclaw    # For OpenClaw
npm install @skillpilot/claude-code # For Claude Code
npm install @skillpilot/langchain   # For LangChain
```

---

## Quick Start

### CLI Usage

```bash
# Index your skills
skillpilot index ~/.openclaw/skills ~/.claude/skills

# Route a query
skillpilot route "create a GitHub issue"
# Output:
# ✓ github  (confidence: 0.94, method: semantic, 18ms)
#   Description: Interact with GitHub repositories, issues...

# Explain routing decision
skillpilot explain "send a slack message"

# View conflict groups
skillpilot conflicts

# View statistics
skillpilot stats
```

### OpenClaw Integration

```typescript
// In your OpenClaw plugin
import { createOpenClawPlugin } from '@skillpilot/openclaw';

export default createOpenClawPlugin();
```

### Claude Code Integration

Add to your `CLAUDE.md`:

```markdown
## SkillPilot Integration

Before processing any message, run:
```bash
skillpilot-claude "$MESSAGE"
```
If the output indicates a skill should be used, prefer that skill.
```

### LangChain Integration

```typescript
import { SkillPilotTool } from '@skillpilot/langchain';

const router = new SkillPilotTool({ skillDir: './skills' });
await router.initialize();

const result = await router.invoke("create a GitHub issue");
// { skill: "github", confidence: 0.94, shouldUse: true }
```

---

## Key Features

### 🎯 Zero-Config Skill Fingerprinting

SkillPilot automatically parses any `SKILL.md` and extracts:
- Semantic embeddings
- Intent patterns
- Keywords
- Side effects classification

No manual configuration needed. Install a skill → it can be routed.

### ⚡ Three-Stage Routing

| Stage | Time | Purpose |
|-------|------|---------|
| Fast Path | < 2ms | Keyword + trigger phrase matching |
| Semantic Path | < 20ms | Vector similarity matching |
| Conflict Resolution | < 5ms | Resolve overlapping skill conflicts |

### 🤝 Conflict-Aware Routing

Automatically detects and resolves conflicts between similar skills (e.g., `github` vs `github-advanced`):

```bash
$ skillpilot conflicts
Conflict Group A (similarity 0.91):
  github · github-advanced · github-enterprise
  Tip: Add route.prefer_when to disambiguate
```

### 🔄 Self-Learning

Records routing feedback and automatically adjusts weights:

```bash
# Record a correction
skillpilot feedback correct --wrong slack --right slack-advanced --query "bulk send"
```

### 🔌 Cross-Platform

Same index, multiple platforms:

```
~/.skillpilot/index/  ←── Shared across platforms
        ↑               ↑               ↑
  OpenClaw        Claude Code     CLI Tool
```

---

## Skill Fingerprint Specification

SkillPilot can auto-extract fingerprints from any `SKILL.md`. For better routing accuracy, skill authors can add a `route:` section to the frontmatter:

```yaml
---
name: github
description: Interact with GitHub repositories

route:
  triggers:
    - "open a PR"
    - "create issue"
  priority: 8
  prefer_when:
    - "issue"
    - "PR"
  side_effects: write-remote
---
```

| Field | Type | Description |
|-------|------|-------------|
| `triggers` | `string[]` | Exact trigger phrases |
| `priority` | `number` | Conflict group priority (1-10) |
| `prefer_when` | `string[]` | Keywords that favor this skill |
| `side_effects` | `enum` | `read-only` / `write-local` / `write-remote` |

---

## Benchmarks

Run benchmarks locally:

```bash
cd benchmarks
pnpm install
pnpm run bench
```

Example results:

```
╔══════════════════════════════════════════════════════════╗
║         SkillPilot Benchmark Results                     ║
╚══════════════════════════════════════════════════════════╝

Dataset: 50 intents × 20 skills
───────────────────────────────────────────────────────────
Method:              SkillPilot (full)
Accuracy:            93.0%
P50 Latency:         12ms
P99 Latency:         23ms
───────────────────────────────────────────────────────────
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              User Message                    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Platform Adapter                   │
│  OpenClaw | Claude Code | LangChain | CLI   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         SkillPilot Core Engine               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐│
│  │  Fast    │ │ Semantic │ │   Conflict   ││
│  │  Router  │ │  Router  │ │   Resolver   ││
│  └──────────┘ └──────────┘ └──────────────┘│
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │      Skill Index (SQLite + Vectors)   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## Configuration

Create `~/.skillpilot/config.yaml`:

```yaml
router:
  hardRouteThreshold: 0.80    # Direct skill execution
  softInjectThreshold: 0.45   # Inject context
  enableSemantic: true        # Enable vector matching

embed:
  provider: local-onnx        # or 'openai'

index:
  skillDirs:
    - ~/.openclaw/skills
    - ~/.claude/skills

feedback:
  enabled: true
  batchSize: 10
```

---

## Development

```bash
# Clone repository
git clone https://github.com/yourusername/skillpilot.git
cd skillpilot

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run benchmarks
pnpm bench
```

---

## Packages

| Package | Description |
|---------|-------------|
| `@skillpilot/core` | Core routing engine |
| `skillpilot` | CLI tool |
| `@skillpilot/openclaw` | OpenClaw plugin adapter |
| `@skillpilot/claude-code` | Claude Code hook adapter |
| `@skillpilot/langchain` | LangChain tool adapter |

---

## License

MIT

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

**SkillPilot** — Route smarter, not harder.
