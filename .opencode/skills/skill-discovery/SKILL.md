---
name: skill-discovery
description: |
  Use at the START of every conversation or task. Scans the project's
  `.opencode/skills/` directory for installed skills, picks the best match for
  the user's request, presents the top candidates to the user, and proceeds
  according to the chosen skill. Gate: fire on ANY new user request — not just
  specific keywords. Do NOT skip or run silently; always surface findings.
---

# Skill Discovery

## Rule

At the beginning of every conversation or task, before writing any code or
answering any question:

1. **Scan** — List all directories under `.opencode/skills/` (in the project
   root or `~/.config/opencode/skills/`). Each directory containing a
   `SKILL.md` is an installed skill.

2. **Match** — For each skill found, read its `name` and `description` from
   the frontmatter. Compare against the user's current request. Identify which
   skills are relevant.

3. **Surface** — Present the findings to the user:
   - If the best match is strong (clearly addresses the request): recommend it
     and ask the user to confirm before loading it.
   - If multiple skills are relevant: list the top candidates with a brief
     explanation of what each does and why it fits.
   - If no skills match: say so and proceed normally.
   - If no skills are installed at all: say so and proceed normally — no
     warnings or blocks.

4. **Proceed** — Once the user confirms a skill (or declines all), follow that
   skill's instructions for the remainder of the task.

## SkillsGate

The project also has [SkillsGate](https://skillsgate.ai) installed
(accessible via `skillsgate-tui` or `npx skillsgate`). SkillsGate is a visual
skill manager for browsing 91,000+ public skills from skills.sh, installing
them to specific agents, and editing them. If the user asks to find or
install new skills, use SkillsGate rather than manual setup.

## What NOT to do

- Do not silently skip skill discovery.
- Do not make up skills that are not actually installed.
- Do not prompt the user about skills more than once per conversation (cache
  the result).
