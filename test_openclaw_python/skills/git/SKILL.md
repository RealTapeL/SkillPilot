---
name: git
description: Version control with Git - commit, branch, merge, push, pull

route:
  triggers:
    - "git commit"
    - "git push"
    - "git pull"
    - "create branch"
    - "switch branch"
    - "git status"
    - "git log"
    - "git diff"
    - "merge branch"
    - "git stash"
  priority: 9
  prefer_when:
    - "commit"
    - "branch"
    - "merge"
    - "push"
    - "pull"
    - "repository"
  side_effects: write-local
---

# Git Skill

Execute Git commands for version control.

## Examples

- "commit these changes" → git commit
- "push to origin" → git push
- "create a feature branch" → git checkout -b
- "show me the git log" → git log
- "switch to main branch" → git checkout main
