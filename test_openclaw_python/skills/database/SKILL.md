---
name: database
description: Database operations - query, migrate, backup, connect

route:
  triggers:
    - "query database"
    - "run migration"
    - "backup database"
    - "connect to db"
    - "SQL query"
    - "show tables"
  priority: 7
  prefer_when:
    - "database"
    - "SQL"
    - "query"
    - "table"
    - "migration"
    - "postgres"
    - "mysql"
  side_effects: write-remote
---

# Database Skill

Database operations and queries.

## Examples

- "query the users table" → SELECT * FROM users
- "run migrations" → migrate up
- "backup the database" → pg_dump
- "show all tables" → \dt
