# Changesets

This directory stores Changesets release metadata. Each file becomes an entry
in `packages/syncore/CHANGELOG.md` and the GitHub release notes, so write it for
people who use `syncorejs`, not for reviewers of the pull request.

Run `npm run changeset` when a pull request changes published `syncorejs`
behavior, and `npm run changeset:check` to check it. CI runs the same check on
every pull request.

## Writing the summary

- Say what changed from the user's side: the API, command or behavior, and what
  they will notice. At least 8 words. "Improvements", "Fixes" or "Updates" on
  their own are rejected.
- One bullet per change when there is more than one.
- Name the APIs, options and commands involved, in code formatting.

Good:

```md
---
"syncorejs": patch
---

Normalize boolean SQL parameters to SQLite integer bindings in the Node runtime, so `true`/`false` args no longer fail with "cannot bind".
```

Not useful:

```md
---
"syncorejs": minor
---

Improvements
```

## Breaking changes

`syncorejs` is below 1.0, so a `minor` bump (0.3.x to 0.4.0) is a breaking
release, and so is `major`. Those changesets need a section that starts with
"Breaking changes" or "Migration" and tells users what to change:

```md
---
"syncorejs": minor
---

Object validators now reject fields they do not declare instead of dropping them silently.

### Breaking changes / Migration

- Mutation calls with extra fields now throw `SyncoreValidationError`. Remove the extra fields, or opt out with `s.object(shape, { unknownKeys: "strip" })`.
```

Use `patch` for additive features and fixes that don't require users to change
anything.

## Automatic changesets

If a push to `main` changes the published package without a changeset, the
release workflow writes `auto-syncorejs-release.md` with a `patch` bump that
lists the commit subjects since the last `syncorejs@*` tag. It is a fallback;
a hand-written changeset makes better release notes.
