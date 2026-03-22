# Syncore Skills

The main Syncore documentation and agent guidance now live in a single public
skill:

- [syncore/SKILL.md](syncore/SKILL.md)

Use that skill as the entrypoint for:

- architecture and runtime model
- contributor workflow and validation commands
- functions, schema, migrations, React, adapters, scheduler, and storage
- quickstarts for React web, Next PWA, Expo, Electron, Svelte, and Node scripts
- maintainer policy and open source guidance

## Structure

```text
skills/
|- AGENTS.md
|- README.md
|- syncore/
|  |- SKILL.md
|  |- agents/openai.yaml
|  `- references/
`- skills/
```

## Notes

- `skills/syncore` is the single source of truth for Syncore docs and workflows.
- Detailed material lives under `skills/syncore/references/` to keep `SKILL.md` short.
- Component authoring and integration guidance now also live inside `skills/syncore`.
- Quickstarts should always include realistic code for every supported host.
