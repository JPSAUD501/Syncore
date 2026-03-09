# Expo example

This example focuses on the app-side developer experience after you already understand the quickstart flow:

- Syncore runtime created during app bootstrap
- React components use `SyncoreProvider` and hooks
- all state remains local

The adapter now targets `expo-sqlite` plus local file storage. The example is still intentionally small and focused on wiring.

The app demonstrates:

- typed local `query` and `mutation`
- reactive note list updates
- local SQLite persistence
- device-local storage integration through the Expo adapter

## Smoke path

The example also includes an on-device smoke harness triggered through the deep link
`syncore-expo-example://smoke`.

Host-side automation lives in `@syncore/testing`:

```bash
bun run --filter @syncore/testing test:smoke:expo
```

Behavior:

- if `adb` is unavailable, the smoke run is skipped with exit code `0`
- if no Android device is connected and no emulator/AVD is available, the smoke run is skipped
- when Android tooling is available, the script builds and installs the Expo example, opens the
  deep link, and waits for the in-app smoke harness to render either
  `SYNCORE_EXPO_SMOKE_PASS` or `SYNCORE_EXPO_SMOKE_FAIL`
