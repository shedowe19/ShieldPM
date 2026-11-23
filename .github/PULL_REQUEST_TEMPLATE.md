## Summary

<!-- What changes, and why? Link the issue or review finding. -->

## Security impact

- [ ] No new trust boundary crossed
- [ ] Inputs that reach Nginx, Lua, shell or SQL are validated at the write boundary
- [ ] Authorization is checked server-side, not only in the UI
- [ ] Secrets are not logged, exported or returned in API responses
- [ ] New behaviour is covered by a regression test

## Verification

<!-- Commands run, test results, manual checks. -->

- [ ] `node backend/node_modules/typescript/bin/tsc --noEmit`
- [ ] Backend tests for the changed area
- [ ] Frontend tests for the changed area
- [ ] `node llm-wiki/tools/wiki-check.mjs`
- [ ] Documentation updated where behaviour or configuration changed

## Deployment notes

<!-- Breaking changes, environment variables, migrations, rollback. -->
