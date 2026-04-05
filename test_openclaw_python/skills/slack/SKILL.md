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
    - "send message to"
  priority: 7
  side_effects: write-remote
---

# Slack Skill

Use this skill when you need to send messages to Slack channels or notify your team.

## Use When

- Sending messages to Slack channels
- Notifying team members
- Posting updates to Slack
- Sending notifications

## Examples

- "Send a message to #general"
- "Notify the team on Slack"
- "Post an update to my slack channel"
