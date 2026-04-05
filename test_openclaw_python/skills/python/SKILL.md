---
name: python
description: Python development - run scripts, manage venv, pip install

route:
  triggers:
    - "run python"
    - "python script"
    - "pip install"
    - "create venv"
    - "activate venv"
    - "pytest"
    - "python test"
  priority: 8
  prefer_when:
    - "python"
    - "pip"
    - "venv"
    - "pytest"
    - "script"
  side_effects: write-local
---

# Python Skill

Python development and environment management.

## Examples

- "run the script" → python script.py
- "install requirements" → pip install -r
- "create virtual env" → python -m venv
- "run pytest" → pytest
