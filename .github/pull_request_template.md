## What changed

Describe the smallest behavior change.

## Safety boundary

- [ ] Preview remains the default.
- [ ] Exact account and plan identity is verified before writes.
- [ ] No credentials, production IDs, personal paths, logs, HAR files, or business data are included.
- [ ] Readback still proves the requested outcome.

## Verification

- [ ] `node scripts/validate-repository.mjs`
- [ ] No live platform write was used for CI or routine review.
