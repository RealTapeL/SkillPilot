---
name: npm
description: Node.js package management - install, run scripts, update

route:
  triggers:
    - "npm install"
    - "npm run"
    - "npm test"
    - "npm build"
    - "install dependencies"
    - "npm publish"
  priority: 8
  prefer_when:
    - "npm"
    - "node"
    - "package"
    - "install"
    - "dependency"
  side_effects: write-local
---

# NPM Skill

Manage Node.js packages and run scripts.

## Examples

- "install dependencies" → npm install
- "run the tests" → npm test
- "build the project" → npm run build
- "publish package" → npm publish
