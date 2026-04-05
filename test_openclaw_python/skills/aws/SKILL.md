---
name: aws
description: AWS cloud operations - EC2, S3, Lambda, CloudFormation

route:
  triggers:
    - "deploy to AWS"
    - "create S3 bucket"
    - "list EC2 instances"
    - "upload to S3"
    - "invoke lambda"
    - "check cloudwatch"
  priority: 7
  prefer_when:
    - "AWS"
    - "EC2"
    - "S3"
    - "lambda"
    - "cloud"
    - "deploy"
    - "production"
  side_effects: write-remote
---

# AWS Skill

Manage AWS cloud resources.

## Examples

- "deploy to production" → AWS deploy
- "create an S3 bucket" → aws s3 mb
- "list running instances" → aws ec2 describe-instances
- "upload file to S3" → aws s3 cp
