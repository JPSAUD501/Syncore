# Documentation Index

Quick reference to the Syncore skill documents in this directory.

## Getting Started

| Document               | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| [README.md](README.md) | Overview of the Syncore skills set       |
| [AGENTS.md](AGENTS.md) | Passive agent context and repo doc index |
| [docs.md](docs.md)     | This document                            |
| [files.md](files.md)   | Codebase structure for the skill set     |

## Skills Reference

| Skill                                                                  | What it teaches                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| [syncore](skills/syncore/SKILL.md)                                     | Routes an agent to the right Syncore sub-skill  |
| [syncore-best-practices](skills/syncore-best-practices/SKILL.md)       | Structure, DX principles, and safety rails      |
| [syncore-functions](skills/syncore-functions/SKILL.md)                 | Backend functions and typed references          |
| [syncore-schema-migrations](skills/syncore-schema-migrations/SKILL.md) | Schema design, drift checks, and migration flow |
| [syncore-react-realtime](skills/syncore-react-realtime/SKILL.md)       | Provider setup and reactive hooks               |
| [syncore-cli-codegen](skills/syncore-cli-codegen/SKILL.md)             | CLI commands and generated code workflow        |
| [syncore-platform-adapters](skills/syncore-platform-adapters/SKILL.md) | Runtime bootstrapping across supported targets  |
| [syncore-scheduler-storage](skills/syncore-scheduler-storage/SKILL.md) | Local scheduling and file storage patterns      |

## Primary Repo References

| Document                                                                  | Purpose                                     |
| ------------------------------------------------------------------------- | ------------------------------------------- |
| [`README.md`](../README.md)                                               | Product overview and workspace commands     |
| [`docs/architecture.md`](../docs/architecture.md)                         | Runtime model, storage, scheduler, devtools |
| [`docs/development.md`](../docs/development.md)                           | Dev loop, smoke tests, and reference policy |
| [`docs/guides/syncore-vs-convex.md`](../docs/guides/syncore-vs-convex.md) | Local-first differences from Convex         |
| [`examples/README.md`](../examples/README.md)                             | Working target-platform integrations        |

## Package Guides

| Guide                                                                     | Purpose                                   |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| [`packages/core/AGENTS.md`](../packages/core/AGENTS.md)                   | Typed runtime contracts and invariants    |
| [`packages/schema/AGENTS.md`](../packages/schema/AGENTS.md)               | Validators and migration planning         |
| [`packages/cli/AGENTS.md`](../packages/cli/AGENTS.md)                     | Codegen and devtools hub                  |
| [`packages/react/AGENTS.md`](../packages/react/AGENTS.md)                 | React hook inference and watch lifecycle  |
| [`packages/platform-node/AGENTS.md`](../packages/platform-node/AGENTS.md) | Node and Electron adapter concerns        |
| [`packages/platform-web/AGENTS.md`](../packages/platform-web/AGENTS.md)   | Worker bridge and browser persistence     |
| [`packages/testing/AGENTS.md`](../packages/testing/AGENTS.md)             | Cross-platform contract and smoke testing |

## Reference Material

| Document                                                    | Purpose                                               |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| [`references/convex-backend`](../references/convex-backend) | Behavioral reference material kept in-tree            |
| [`skills/README.md`](README.md)                             | Local conventions for this Syncore-specific skill set |
