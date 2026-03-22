# Expo Quickstart

Use this setup when starting from a fresh Expo app and treating
`npx syncorejs dev` as the main local loop.

## 1. Create the app host

```bash
npx create-expo-app my-syncore-expo
cd my-syncore-expo
```

## 2. Install packages

```bash
npm install syncorejs expo expo-sqlite expo-file-system react react-native
```

## 3. Start the Syncore dev loop

```bash
npx syncorejs dev
```

For Expo apps, operational commands use connected `client:<id>` targets.

## 4. Create the Expo bootstrap

`lib/syncore.ts`

```ts
import { createExpoSyncoreBootstrap } from "syncorejs/expo";
import schema from "../syncore/_generated/schema";
import { resolvedComponents } from "../syncore/_generated/components";
import { functions } from "../syncore/_generated/functions";

export const syncore = createExpoSyncoreBootstrap({
  schema,
  functions,
  components: resolvedComponents,
  databaseName: "my-syncore-expo.db",
  storageDirectoryName: "my-syncore-expo-storage"
});
```

## 5. Mount the client

`App.tsx`

```tsx
import { Text, View } from "react-native";
import { useMutation, useQuery, useSyncoreStatus } from "syncorejs/react";
import { SyncoreExpoProvider } from "syncorejs/expo/react";
import { syncore } from "./lib/syncore";
import { api } from "./syncore/_generated/api";

export default function App() {
  return (
    <SyncoreExpoProvider
      bootstrap={syncore}
      fallback={<Text>Booting Syncore...</Text>}
    >
      <NotesScreen />
    </SyncoreExpoProvider>
  );
}

function NotesScreen() {
  const runtime = useSyncoreStatus();
  const tasks = useQuery(api.tasks.list) ?? [];
  const createTask = useMutation(api.tasks.create);
  if (runtime.kind !== "ready") {
    return <Text>Syncore status: {runtime.kind}</Text>;
  }
  return (
    <View>
      <Text onPress={() => void createTask({ text: "Capture on mobile" })}>
        Add task
      </Text>
      {tasks.map((task) => (
        <Text key={task._id}>{task.text}</Text>
      ))}
    </View>
  );
}
```

Expo boot should be modeled as runtime lifecycle from the provider, not as a
separate app-local loading system.

## 6. Run the app

```bash
npm start
```
