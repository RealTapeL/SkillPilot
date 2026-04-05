---
name: github
description: Interact with GitHub repositories, issues, pull requests, and workflows
requires:
  env:
    - GITHUB_TOKEN
  bins:
    - gh
route:
  triggers:
    - "open a PR"
    - "create issue"
    - "review pull request"
    - "list my repos"
    - "check CI status"
  priority: 8
  prefer_when:
    - "issue"
    - "PR"
    - "repository"
  side_effects: write-remote
---

# GitHub Skill

Use this skill when you need to interact with GitHub repositories, issues, pull requests, and workflows.

## Use When

- Creating or managing GitHub repositories
- Opening or reviewing pull requests
- Creating or managing issues
- Checking CI/CD status
- Managing GitHub workflows

## Examples

- "Create a new repository"
- "Open a pull request"
- "List open issues"
- "Check CI/CD status"
