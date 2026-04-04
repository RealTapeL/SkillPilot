# Contributing to SkillPilot

Thank you for your interest in contributing to SkillPilot! This document provides guidelines and instructions for contributing.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/skillpilot.git
cd skillpilot

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint
```

## Project Structure

```
skillpilot/
├── packages/
│   ├── core/           # Core routing engine
│   ├── cli/            # CLI tool
│   ├── openclaw/       # OpenClaw adapter
│   ├── claude-code/    # Claude Code adapter
│   └── langchain/      # LangChain adapter
├── benchmarks/         # Performance benchmarks
├── tests/              # Test suites
└── README.md
```

## Making Changes

1. **Create a branch**: `git checkout -b feature/your-feature`
2. **Make your changes** with appropriate tests
3. **Run tests**: `pnpm test`
4. **Build**: `pnpm build`
5. **Commit**: `git commit -m "feat: your feature description"`
6. **Push**: `git push origin feature/your-feature`

## Commit Message Convention

We follow [Conventional Commits](https://conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test changes
- `refactor:` Code refactoring
- `perf:` Performance improvements

## Adding a New Adapter

To add support for a new agent framework:

1. Create a new package in `packages/your-framework/`
2. Implement the adapter interface
3. Add tests
4. Update documentation

## Benchmark Contributions

Help improve SkillPilot's accuracy by contributing to the benchmark dataset:

1. Add new test cases to `benchmarks/datasets/intents-100.json`
2. Run benchmarks: `pnpm bench`
3. Submit a PR with your results

## Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Add JSDoc comments for public APIs
- Write tests for new features

## Questions?

Open an issue or join our discussions!
