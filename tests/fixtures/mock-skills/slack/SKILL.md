---
name: slack
description: Send messages and notifications to Slack channels
requires:
  env:
    - SLACK_TOKEN
route:
  triggers:
    - "send slack message"
    - "notify team"
    - "post to channel"
  priority: 7
  side_effects: write-remote
---

# Slack Skill

Use this skill when you need to send messages to Slack.

Triggered by requests to notify the team or send messages to channels.
