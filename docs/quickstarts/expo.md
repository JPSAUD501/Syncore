# Expo Quickstart

This quickstart runs Syncore directly inside the Expo app with `expo-sqlite`.

## 1. Install packages

```bash
npx create-expo-app my-app
cd my-app
npm install syncore @syncore/react @syncore/platform-expo
```

## 2. Create the backend

Create:

```text
syncore/
  schema.ts
  functions/
    notes.ts
```

Function files should import from `../_generated/server`.

Generate the typed API:

```bash
npx syncore codegen
```

## 3. Create the Expo bootstrap

`lib/syncore.ts`

```ts
import { createExpoSyncoreBootstrap } from "@syncore/platform-expo";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

export const syncore = createExpoSyncoreBootstrap({
  schema,
  functions,
  databaseName: "syncore.db",
  storageDirectoryName: "syncore-storage"
});
```

## 4. Mount the client

`App.tsx`

```tsx
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { SyncoreProvider, useQuery } from "@syncore/react";
import type { SyncoreClient } from "syncore";
import { syncore } from "./lib/syncore";
import { api } from "./syncore/_generated/api";

export default function App() {
  const [client, setClient] = useState<SyncoreClient | null>(null);

  useEffect(() => {
    void syncore.getClient().then(setClient);
  }, []);

  if (!client) {
    return <Text>Booting Syncore...</Text>;
  }

  return (
    <SyncoreProvider client={client}>
      <NotesScreen />
    </SyncoreProvider>
  );
}

function NotesScreen() {
  const notes = useQuery(api.notes.list) ?? [];
  return (
    <View>
      {notes.map((note: { _id: string; body: string }) => (
        <Text key={note._id}>{note.body}</Text>
      ))}
    </View>
  );
}
```

## 5. Run the app

```bash
npm start
```

See `examples/expo` for a larger app plus the on-device smoke harness.
