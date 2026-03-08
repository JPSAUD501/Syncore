import { SyncoreProvider, useMutation, useQuery } from "@syncore/react";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { SyncoreClient } from "syncore";
import { createExampleRuntime, resetSyncore, startSyncore } from "./lib/syncore";
import { api } from "./syncore/_generated/api";

type AppMode = "loading" | "notes" | "smoke";

export default function App() {
  const [mode, setMode] = useState<AppMode>("loading");
  const [client, setClient] = useState<SyncoreClient | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolveMode = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (cancelled) {
        return;
      }
      setMode(initialUrl?.startsWith("syncore-expo-example://smoke") ? "smoke" : "notes");
    };

    void resolveMode();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      setMode(url.startsWith("syncore-expo-example://smoke") ? "smoke" : "notes");
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (mode !== "notes") {
      return;
    }

    let cancelled = false;
    void startSyncore().then((nextClient) => {
      if (!cancelled) {
        setClient(nextClient);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (mode === "loading") {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#ffb454" />
        <Text style={styles.loadingText}>Booting Syncore locally...</Text>
      </SafeAreaView>
    );
  }

  if (mode === "smoke") {
    return <ExpoSmokeHarness />;
  }

  if (!client) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#ffb454" />
        <Text style={styles.loadingText}>Booting Syncore locally...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SyncoreProvider client={client}>
      <NotesScreen />
    </SyncoreProvider>
  );
}

function NotesScreen() {
  const [draft, setDraft] = useState("");
  const rawNotes = useQuery(api.notes.list);
  const notes = useMemo(() => rawNotes ?? [], [rawNotes]);
  const createNote = useMutation(api.notes.create);
  const togglePinned = useMutation(api.notes.togglePinned);
  const pinnedNotes = useMemo(() => notes.filter((note) => note.pinned), [notes]);

  const handleCreate = async () => {
    if (!draft.trim()) {
      return;
    }
    await createNote({ body: draft.trim() });
    setDraft("");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Expo + local SQLite</Text>
        <Text style={styles.title}>Syncore runs on-device, no backend required.</Text>
        <Text style={styles.subtitle}>
          Notes are stored locally, queries stay reactive, and the UI only talks to typed
          functions.
        </Text>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a local note"
            placeholderTextColor="#9ba6b2"
            style={styles.input}
          />
          <Pressable onPress={() => void handleCreate()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Add note</Text>
          </Pressable>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Total: {notes.length}</Text>
          <Text style={styles.metaText}>Pinned: {pinnedNotes.length}</Text>
        </View>

        <View style={styles.list}>
          {notes.map((note) => (
            <View key={note._id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{note.body}</Text>
                <Text style={styles.cardSubtitle}>
                  {note.pinned ? "Pinned locally" : "Stored locally"}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  void togglePinned({ id: note._id, pinned: !note.pinned })
                }
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>
                  {note.pinned ? "Unpin" : "Pin"}
                </Text>
              </Pressable>
            </View>
          ))}
          {notes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No local notes yet.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ExpoSmokeHarness() {
  const [status, setStatus] = useState({
    state: "running" as "running" | "pass" | "fail",
    message: "Starting on-device Syncore smoke..."
  });

  useEffect(() => {
    let cancelled = false;

    const updateStatus = (nextStatus: typeof status) => {
      if (!cancelled) {
        setStatus(nextStatus);
      }
    };

    void runSmoke(updateStatus);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.loadingScreen}>
      <View style={styles.smokeCard}>
        <Text style={styles.eyebrow}>Expo smoke harness</Text>
        <Text
          accessibilityLabel="Syncore Expo smoke status"
          style={styles.smokeStatus}
          testID="syncore-expo-smoke-status"
        >
          {status.state === "pass"
            ? "SYNCORE_EXPO_SMOKE_PASS"
            : status.state === "fail"
              ? "SYNCORE_EXPO_SMOKE_FAIL"
              : "SYNCORE_EXPO_SMOKE_RUNNING"}
        </Text>
        <Text style={styles.smokeMessage}>{status.message}</Text>
      </View>
    </SafeAreaView>
  );
}

async function runSmoke(
  updateStatus: (status: { state: "running" | "pass" | "fail"; message: string }) => void
): Promise<void> {
  const runId = Date.now();
  const createdBody = `Created note ${runId}`;
  const catchUpBody = `Catch up note ${runId}`;
  const skipBody = `Skip note ${runId}`;

  try {
    updateStatus({ state: "running", message: "Resetting the local runtime..." });
    await resetSyncore();

    const runtime1 = createExampleRuntime();
    await runtime1.start();
    const client1 = runtime1.createClient();

    updateStatus({ state: "running", message: "Preparing a clean local note set..." });
    await client1.mutation(api.notes.resetAll);

    const watch = client1.watchQuery(api.notes.list);
    await waitFor(() => Array.isArray(watch.localQueryResult()), 3_000);

    updateStatus({ state: "running", message: "Creating and reacting to a local note..." });
    await client1.mutation(api.notes.create, { body: createdBody });
    await waitFor(
      () =>
        (watch.localQueryResult() ?? []).some((note) => note.body === createdBody),
      3_000
    );

    const createdNote = (await client1.query(api.notes.list)).find(
      (note) => note.body === createdBody
    );
    if (!createdNote) {
      throw new Error("The created note never became visible through the query.");
    }

    updateStatus({ state: "running", message: "Toggling pinned state before restart..." });
    await client1.mutation(api.notes.togglePinned, {
      id: createdNote._id,
      pinned: true
    });

    updateStatus({ state: "running", message: "Scheduling catch-up and skip jobs..." });
    await client1.mutation(api.notes.scheduleCreateCatchUp, {
      body: catchUpBody,
      delayMs: 120
    });
    await client1.mutation(api.notes.scheduleCreateSkip, {
      body: skipBody,
      delayMs: 120
    });

    watch.dispose?.();
    await runtime1.stop();
    await wait(240);

    updateStatus({ state: "running", message: "Restarting the runtime to reconcile jobs..." });
    const runtime2 = createExampleRuntime();
    await runtime2.start();
    const client2 = runtime2.createClient();

    await wait(200);
    const afterRestart = await client2.query(api.notes.list);

    if (!afterRestart.some((note) => note.body === createdBody && note.pinned)) {
      throw new Error("The original note did not persist with its pinned state.");
    }
    if (!afterRestart.some((note) => note.body === catchUpBody)) {
      throw new Error("The catch-up scheduler job did not run after restart.");
    }
    if (afterRestart.some((note) => note.body === skipBody)) {
      throw new Error("The skip scheduler job should not run after the missed window.");
    }

    await runtime2.stop();
    await resetSyncore();

    updateStatus({
      state: "pass",
      message:
        "Query, mutation, reactivity, restart persistence, and scheduler reconciliation passed."
    });
  } catch (error) {
    await resetSyncore().catch(() => undefined);
    updateStatus({
      state: "fail",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for Syncore smoke state to settle.");
    }
    await wait(50);
  }
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0b1220",
    gap: 12,
    padding: 24
  },
  loadingText: {
    color: "#f1efe8"
  },
  screen: {
    flex: 1,
    backgroundColor: "#0b1220"
  },
  container: {
    padding: 24,
    gap: 18
  },
  eyebrow: {
    color: "#7ed4c8",
    textTransform: "uppercase",
    letterSpacing: 2
  },
  title: {
    color: "#f7f4ec",
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "700"
  },
  subtitle: {
    color: "#aab4c0",
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 460
  },
  composer: {
    gap: 12,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#101a2b"
  },
  input: {
    borderWidth: 1,
    borderColor: "#243247",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#f7f4ec",
    backgroundColor: "#0d1522"
  },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffb454",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999
  },
  primaryButtonText: {
    color: "#111722",
    fontWeight: "700"
  },
  metaRow: {
    flexDirection: "row",
    gap: 14
  },
  metaText: {
    color: "#b0b7c2"
  },
  list: {
    gap: 12
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#101a2b"
  },
  cardTitle: {
    color: "#f7f4ec",
    fontWeight: "600",
    marginBottom: 4
  },
  cardSubtitle: {
    color: "#99a7b5"
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#2c3f58",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999
  },
  secondaryButtonText: {
    color: "#f7f4ec"
  },
  emptyState: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#101a2b"
  },
  emptyStateText: {
    color: "#99a7b5"
  },
  smokeCard: {
    width: "100%",
    maxWidth: 460,
    padding: 24,
    borderRadius: 24,
    backgroundColor: "#101a2b",
    gap: 16
  },
  smokeStatus: {
    color: "#f7f4ec",
    fontSize: 28,
    fontWeight: "700"
  },
  smokeMessage: {
    color: "#c1ccd8",
    lineHeight: 22
  }
});
