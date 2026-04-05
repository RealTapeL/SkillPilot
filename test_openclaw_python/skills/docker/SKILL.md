---
name: docker
description: Manage Docker containers and images
requires:
  bins:
    - docker
route:
  triggers:
    - "build docker"
    - "run container"
    - "docker build"
    - "docker run"
  priority: 6
  side_effects: write-local
---

# Docker Skill

Use this skill to manage Docker containers and images.

## Use When

- Building Docker images
- Running containers
- Managing Docker resources

## Examples

- "Build a Docker image"
- "Run a container from my image"
- "List all Docker containers"
