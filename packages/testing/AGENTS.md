# Testing Package Guide

## Scope

`packages/testing` contains cross-platform contract tests and smoke tests. Use it for behavior that every adapter must satisfy, not for package-specific details.

## Good Test Targets

- Query invalidation after mutations.
- Scheduler recovery and restart behavior.
- Storage persistence and metadata recovery.
- End-to-end offline behavior in examples.

## What Not To Put Here

- CLI template string assertions.
- Adapter-specific transport details.
- React hook unit behavior.

## Preferred Strategy

- Put package-local invariants in the owning package.
- Promote tests here only after the same behavior must hold across multiple adapters.
- Keep smoke tests expensive but focused on one durable product guarantee each.
