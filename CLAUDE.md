# Claude Code notes

The project's agent constitution lives in [AGENTS.md](AGENTS.md) — read it
first; everything there is binding.

@AGENTS.md

## Claude-specific

- The owner communicates in Chinese; reply in Chinese. Code, comments, commit
  messages, and specs stay in English.
- Use the Edit/Write tools for file changes — they are UTF-8 safe. Reserve
  the PowerShell tool for git/npm/docker; it corrupts CJK file content
  (see Environment gotchas in AGENTS.md).
- `npm run check` is the merge gate. Run it before reporting work as done,
  and report test counts honestly (currently ~307 tests; the number only
  grows).
- When the plan and the code disagree, trust the code, record the deviation
  in the commit message, and fix the document.
