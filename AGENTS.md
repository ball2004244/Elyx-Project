# AGENTS.md

## Discussion Guidelines

- ALWAYS read `memory/` first. Read `Persona.md` and `PROJECT.md` as entry points.
- Use markitdown MCP to read pdf. Docker mount `temp/markitdown-mcp/` → `/workdir/`
- Use built-in parser to read images.
- Store my prompt to `chat/thread-<ii>.md` and part/summarize of your response/action to that prompt. Check for template in `chat/_template.md`

## Implement Guidelines

- We use React + JavaScript + Tailwind. ALWAYS use bun.
- Update human-agent agreement to `DECISIONS.md` before implement.
- Write out your details plan to `PLAN.md` and `TODO.md`
- ALWAYS follow `CodeStyle.md` during coding.
- When performing Frontend UI/UX design, ALWAYS use `skills/taste-skill.md`
- When writing test cases, ALWAYS use 3-3-3 rules: 3 happy, 3 hard, 3 edge cases.
- MUST update `Implement.md` and `Lessons.md` and `TODO.md` after 1 iteration.
