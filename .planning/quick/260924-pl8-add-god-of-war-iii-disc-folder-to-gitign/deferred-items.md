# Deferred Items — 260924-pl8

## Pre-existing: 123 tracked files under `extracted/` are ignored by `extracted/**`

- **Found during:** Task 1 verify (`git ls-files -ci --exclude-standard` expected empty, was not)
- **Scope check:** NOT caused by this task — before/after comparison using HEAD's
  `.gitignore` vs the new one produced byte-identical tracked-ignored lists
  (123 files both times). The matching pattern is the pre-existing `extracted/**`
  rule; these files were committed before that rule was added.
- **Why it matters:** CLAUDE.md states "the full `extracted/` set is local-only/gitignored"
  and `assets/` is the only tracked game-data subset — yet `extracted/kratos/`,
  `extracted/perm/`, `extracted/wads/`, `extracted/weapon/` binaries (including
  R_HERO*.WAD, R_PERM.WAD, R_WPN0_0.WAD) are in the git index. This contradicts the
  stated curated-subset policy and may mean copyrighted disc-derived data is already
  in repo history.
- **Deferred action:** Decide whether these should be untracked (`git rm --cached`)
  to match the stated policy, or whether the policy/README should be updated to
  acknowledge them as intentionally tracked. Untracking 123 files is an
  architectural/policy decision (Rule 4 territory) and far outside this quick
  task's "commit only .gitignore" scope.
