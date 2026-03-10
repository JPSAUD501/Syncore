# Codebase Files

Brief description of each file in the Syncore skills directory.

## Root Files

| File        | Description                                                 |
| ----------- | ----------------------------------------------------------- |
| `AGENTS.md` | Passive Syncore context, doc index, and cross-cutting rules |
| `README.md` | Overview of the Syncore skills set                          |
| `docs.md`   | Documentation index for this directory                      |
| `files.md`  | This file                                                   |

## Skills Directory (`skills/`)

Each skill includes a `SKILL.md` plus `agents/openai.yaml` metadata used by
skill pickers.

| Skill                                | Description                                 |
| ------------------------------------ | ------------------------------------------- |
| `syncore/SKILL.md`                   | Umbrella index for all Syncore skills       |
| `syncore-best-practices/SKILL.md`    | Recommended structure and DX rules          |
| `syncore-functions/SKILL.md`         | Queries, mutations, actions, and references |
| `syncore-schema-migrations/SKILL.md` | Schema modeling and migration workflow      |
| `syncore-react-realtime/SKILL.md`    | React provider and hook usage               |
| `syncore-cli-codegen/SKILL.md`       | CLI and generated file workflow             |
| `syncore-platform-adapters/SKILL.md` | Web, Electron, Expo, and Next wiring        |
| `syncore-scheduler-storage/SKILL.md` | Scheduler and storage APIs                  |

## Metadata Files

| File Pattern                  | Description                                      |
| ----------------------------- | ------------------------------------------------ |
| `skills/*/agents/openai.yaml` | Display name and short description for skill UIs |

## Design Notes

- These skills are authored in-tree, next to the existing Syncore reference material.
- Content is intentionally aligned to current repo APIs instead of speculative future APIs.
- When Syncore public APIs change, update the relevant skill and the linked package guides together.
