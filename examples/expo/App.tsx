import { SyncoreExpoProvider } from "syncore/expo/react";
import { useMutation, useQuery } from "syncore/react";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { syncore } from "./lib/syncore";
import { api } from "./syncore/_generated/api";

const NOTE_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8"
] as const;

export default function App() {
  return (
    <SyncoreExpoProvider
      bootstrap={syncore}
      fallback={
        <SafeAreaView style={styles.loadingScreen}>
          <View style={styles.loadingContent}>
            <View style={styles.loadingIcon}>
              <Text style={styles.loadingEmoji}>&#9998;</Text>
            </View>
            <ActivityIndicator size="small" color="#6C63FF" />
            <Text style={styles.loadingText}>Starting local engine...</Text>
          </View>
        </SafeAreaView>
      }
    >
      <NotesScreen />
    </SyncoreExpoProvider>
  );
}

function NotesScreen() {
  const [showComposer, setShowComposer] = useState(false);
  const [searchText, setSearchText] = useState("");

  const allNotesQuery = useQuery(api.notes.list);
  const searchResults = useQuery(api.notes.search, { query: searchText });
  const createNote = useMutation(api.notes.create);
  const togglePin = useMutation(api.notes.togglePin);
  const removeNote = useMutation(api.notes.remove);
  const allNotes = useMemo(() => allNotesQuery ?? [], [allNotesQuery]);

  const notes = useMemo(() => {
    if (searchText.trim() && searchResults) return searchResults;
    return allNotes;
  }, [searchText, searchResults, allNotes]);

  const pinnedNotes = useMemo(() => notes.filter((n) => n.pinned), [notes]);
  const unpinnedNotes = useMemo(() => notes.filter((n) => !n.pinned), [notes]);

  const handleCreate = useCallback(
    async (title: string, body: string) => {
      const color =
        NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)] ??
        NOTE_COLORS[0];
      await createNote({ title, body, color });
      setShowComposer(false);
    },
    [createNote]
  );

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notes</Text>
          <Text style={styles.headerSubtitle}>
            {allNotes.length} note{allNotes.length !== 1 ? "s" : ""} stored
            locally
          </Text>
        </View>
        <Pressable
          style={styles.addButton}
          onPress={() => setShowComposer(!showComposer)}
        >
          <Text style={styles.addButtonText}>{showComposer ? "x" : "+"}</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search notes..."
          placeholderTextColor="#999"
          style={styles.searchInput}
        />
      </View>

      {/* Composer */}
      {showComposer && <NoteComposer onCreate={handleCreate} />}

      {/* Notes List */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {pinnedNotes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PINNED</Text>
            {pinnedNotes.map((note) => (
              <NoteCard
                key={note._id}
                note={note}
                onTogglePin={() => void togglePin({ id: note._id })}
                onDelete={() => void removeNote({ id: note._id })}
              />
            ))}
          </View>
        )}

        {unpinnedNotes.length > 0 && (
          <View style={styles.section}>
            {pinnedNotes.length > 0 && (
              <Text style={styles.sectionLabel}>OTHERS</Text>
            )}
            {unpinnedNotes.map((note) => (
              <NoteCard
                key={note._id}
                note={note}
                onTogglePin={() => void togglePin({ id: note._id })}
                onDelete={() => void removeNote({ id: note._id })}
              />
            ))}
          </View>
        )}

        {notes.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>&#128221;</Text>
            <Text style={styles.emptyTitle}>
              {searchText ? "No results" : "No notes yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchText
                ? "Try a different search term"
                : "Tap + to create your first note"}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function NoteComposer({
  onCreate
}: {
  onCreate: (title: string, body: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <View style={styles.composer}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        placeholderTextColor="#999"
        style={styles.composerTitle}
        autoFocus
      />
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Start writing..."
        placeholderTextColor="#999"
        style={styles.composerBody}
        multiline
        numberOfLines={3}
      />
      <Pressable
        style={[
          styles.composerButton,
          (!title.trim() || !body.trim()) && styles.composerButtonDisabled
        ]}
        onPress={() =>
          title.trim() &&
          body.trim() &&
          void onCreate(title.trim(), body.trim())
        }
        disabled={!title.trim() || !body.trim()}
      >
        <Text style={styles.composerButtonText}>Save Note</Text>
      </Pressable>
    </View>
  );
}

interface NoteCardProps {
  note: {
    _id: string;
    title: string;
    body: string;
    color: string;
    pinned: boolean;
    updatedAt: number;
  };
  onTogglePin: () => void;
  onDelete: () => void;
}

function NoteCard({ note, onTogglePin, onDelete }: NoteCardProps) {
  const timeAgo = useMemo(() => {
    const diff = Date.now() - note.updatedAt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [note.updatedAt]);

  return (
    <View style={[styles.card, { borderLeftColor: note.color }]}>
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {note.title}
          </Text>
          <View style={styles.cardActions}>
            <Pressable
              onPress={onTogglePin}
              style={styles.cardAction}
              hitSlop={8}
            >
              <Text style={styles.cardActionText}>
                {note.pinned ? "\u{1F4CC}" : "\u{1F4CB}"}
              </Text>
            </Pressable>
            <Pressable onPress={onDelete} style={styles.cardAction} hitSlop={8}>
              <Text style={styles.cardActionText}>{"\u{1F5D1}"}</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.cardBody} numberOfLines={2}>
          {note.body}
        </Text>
        <Text style={styles.cardMeta}>{timeAgo}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: "#FAFAFA",
    justifyContent: "center",
    alignItems: "center"
  },
  loadingContent: {
    alignItems: "center",
    gap: 16
  },
  loadingIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#F0EEFF",
    justifyContent: "center",
    alignItems: "center"
  },
  loadingEmoji: {
    fontSize: 28
  },
  loadingText: {
    color: "#888",
    fontSize: 14
  },

  screen: {
    flex: 1,
    backgroundColor: "#FAFAFA"
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: "#1A1A2E",
    letterSpacing: -0.5
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#888",
    marginTop: 2
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#6C63FF",
    justifyContent: "center",
    alignItems: "center"
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 26
  },

  searchContainer: {
    paddingHorizontal: 24,
    paddingBottom: 12
  },
  searchInput: {
    backgroundColor: "#F0F0F0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1A1A2E"
  },

  composer: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3
  },
  composerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
    paddingVertical: 4
  },
  composerBody: {
    fontSize: 15,
    color: "#444",
    lineHeight: 22,
    minHeight: 60,
    textAlignVertical: "top"
  },
  composerButton: {
    alignSelf: "flex-end",
    backgroundColor: "#6C63FF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10
  },
  composerButtonDisabled: {
    opacity: 0.4
  },
  composerButtonText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14
  },

  listContainer: {
    flex: 1
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 40
  },

  section: {
    gap: 10,
    marginBottom: 20
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#AAA",
    letterSpacing: 1.5,
    marginBottom: 4
  },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  cardContent: {
    padding: 16,
    gap: 6
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A2E"
  },
  cardActions: {
    flexDirection: "row",
    gap: 4
  },
  cardAction: {
    padding: 4
  },
  cardActionText: {
    fontSize: 16
  },
  cardBody: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20
  },
  cardMeta: {
    fontSize: 12,
    color: "#BBB",
    marginTop: 2
  },

  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    gap: 8
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E"
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#999"
  }
});
