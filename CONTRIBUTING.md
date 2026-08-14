# Contributing

Keep changes small, reviewable, and safe by default.

1. Do not commit real account IDs, plan IDs, store IDs, creator IDs, HAR files, logs, ledgers, screenshots, cookies, tokens, or absolute personal paths.
2. Preserve preview-only defaults. New write paths must require explicit execution, exact target confirmation, and fresh readback.
3. Keep `SKILL.md` concise and put deterministic behavior in tested scripts.
4. Add or update an offline self-test for every changed guard, selector, payload mutation, or readback rule.
5. Run `node scripts/validate-repository.mjs` before proposing a change.
6. Report vulnerabilities privately according to `SECURITY.md`.
