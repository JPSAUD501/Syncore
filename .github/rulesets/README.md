# Rulesets

This directory stores importable GitHub repository rulesets for Syncore.

## Recommended branch ruleset

Use [`default-branch-protection.json`](default-branch-protection.json) for the
repository default branch.

This is the balanced default for an open source maintainer-led project:

- no branch deletion
- no force pushes
- linear history required
- pull requests required for branch updates
- no approving review required
- stale approvals dismissed after new pushes
- all review threads must be resolved before merge
- required checks:
  - `quality`
  - `smoke`

## Import steps

1. Open `Settings > Rules > Rulesets`
2. Click `New ruleset > Import a ruleset`
3. Select [`default-branch-protection.json`](default-branch-protection.json)
4. Confirm that the target branch is the repository default branch
5. Review the required status checks and save the ruleset

## Recommended repository settings

For this ruleset to work cleanly, also enable:

- squash merge or rebase merge
- pull request reviews before merge
- GitHub Discussions, if you want to route questions away from Issues

## Important notes

- `bypass_actors` is intentionally empty. Add explicit bypass actors in the GitHub UI only if you want a documented exception path.
- The required checks are set to `quality` and `smoke`, which match the current job names in [`../workflows/ci.yml`](../workflows/ci.yml).
- If GitHub shows different status check context names in the import preview, update them there before saving.
- Linear history requires squash merge or rebase merge to be enabled at the repository level.
