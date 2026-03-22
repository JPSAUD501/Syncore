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
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

export const syncore = createExpoSyncoreBootstrap({
  schema,
  functions,
  databaseName: "my-syncore-expo.db",
  storageDirectoryName: "my-syncore-expo-storage"
});
```

## 5. Mount the client

`App.tsx`

```tsx
import { Text, View } from "react-native";
import { useQuery } from "syncorejs/react";
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
  const tasks = useQuery(api.tasks.list) ?? [];
  return (
    <View>
      {tasks.map((task) => (
        <Text key={task._id}>{task.text}</Text>
      ))}
    </View>
  );
}
```

## 6. Run the app

```bash
npm start
```
