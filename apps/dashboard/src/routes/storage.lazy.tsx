import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Download,
  FileArchive,
  FileText,
  HardDrive,
  Image,
  RefreshCw,
  Search,
  Trash2
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type {
  StorageEntry,
  SyncoreDevtoolsSubscriptionResultPayload
} from "@syncore/devtools-protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ConfirmActionDialog } from "@/components/data/ConfirmActionDialog";
import { EmptyState, TimestampCell } from "@/components/shared";
import { useDevtoolsSubscription } from "@/hooks/useReactiveData";
import { request, useActiveRuntime } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/storage")({
  component: StoragePage
});

type StorageListResult = Extract<
  SyncoreDevtoolsSubscriptionResultPayload,
  { kind: "storage.list.result" }
>;

const PAGE_SIZE = 100;

export function StoragePage() {
  const { pushToast } = useToast();
  const activeRuntime = useActiveRuntime();
  const storageCapability = activeRuntime?.capabilities?.storage;
  const storageAvailable = storageCapability?.browse !== false;
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageEntry | null>(null);

  const listPayload = useMemo(
    () => ({
      kind: "storage.list" as const,
      limit: PAGE_SIZE,
      offset: 0,
      ...(search.trim() ? { search: search.trim() } : {})
    }),
    [search]
  );

  const subscription = useDevtoolsSubscription<StorageListResult>(
    storageAvailable ? listPayload : null,
    { enabled: storageAvailable }
  );
  const entries = subscription.data?.entries ?? [];
  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;

  const selectEntry = useCallback((entry: StorageEntry) => {
    setSelectedId(entry.id);
  }, []);

  const handleDownload = useCallback(
    async (entry: StorageEntry) => {
      try {
        const result = await createStorageAccess(entry, "download");
        const link = document.createElement("a");
        link.href = result.url;
        link.download = result.entry.fileName ?? `${result.entry.id}.bin`;
        document.body.append(link);
        link.click();
        link.remove();
      } catch (error) {
        pushToast({
          tone: "error",
          title: "Download failed",
          description: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [pushToast]
  );

  const handleDelete = useCallback(
    async (entry: StorageEntry) => {
      try {
        const result = await request<"storage.delete.result">({
          kind: "storage.delete",
          id: entry.id
        });
        if (!result.success) {
          throw new Error(
            result.error ?? "Storage object could not be deleted."
          );
        }
        if (selectedId === entry.id) {
          setSelectedId(null);
        }
        pushToast({
          tone: "success",
          title: result.deleted
            ? "Storage object deleted"
            : "Storage object not found",
          description: result.deleted
            ? `${entry.fileName ?? entry.id} was removed.`
            : "The object was already absent."
        });
      } catch (error) {
        pushToast({
          tone: "error",
          title: "Delete failed",
          description: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [pushToast, selectedId]
  );

  if (!storageAvailable) {
    return (
      <EmptyState
        icon={HardDrive}
        title="Storage unavailable"
        description={
          storageCapability?.reason ??
          "The selected runtime does not expose storage browsing."
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-[620px] flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[14px] font-bold text-text-primary">Storage</h2>
          <p className="mt-1 text-[12px] text-text-tertiary">
            {subscription.data
              ? `${subscription.data.totalCount} object${subscription.data.totalCount === 1 ? "" : "s"}`
              : "Storage objects saved through ctx.storage"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-72">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search id, filename, type..."
              className="h-8 pl-8 text-[12px]"
            />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-h-0 overflow-hidden rounded-lg border border-border bg-bg-surface">
          {subscription.loading ? (
            <EmptyState
              icon={RefreshCw}
              title="Loading storage"
              description="Reading storage metadata from the selected runtime."
            />
          ) : subscription.error ? (
            <EmptyState
              icon={HardDrive}
              title="Storage failed to load"
              description={subscription.error}
            />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={HardDrive}
              title="No storage objects"
              description="Files written with ctx.storage.put will appear here."
            />
          ) : (
            <div className="h-full overflow-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-bg-surface">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-tertiary">
                    <th className="border-b border-border px-3 py-2 font-medium">
                      Object
                    </th>
                    <th className="border-b border-border px-3 py-2 font-medium">
                      Type
                    </th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">
                      Size
                    </th>
                    <th className="border-b border-border px-3 py-2 font-medium">
                      Created
                    </th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const active = selectedEntry?.id === entry.id;
                    return (
                      <tr
                        key={entry.id}
                        className={cn(
                          "cursor-pointer border-b border-border/60 text-[12px] hover:bg-bg-elevated/60",
                          active && "bg-bg-elevated"
                        )}
                        onClick={() => selectEntry(entry)}
                      >
                        <td className="border-b border-border/60 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <StorageTypeIcon entry={entry} />
                            <div className="min-w-0">
                              <div className="truncate text-text-primary">
                                {entry.fileName ?? entry.id}
                              </div>
                              <div className="truncate font-mono text-[11px] text-text-tertiary">
                                {entry.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-border/60 px-3 py-2">
                          <Badge
                            variant="secondary"
                            className="max-w-[180px] truncate"
                          >
                            {entry.contentType ?? "application/octet-stream"}
                          </Badge>
                        </td>
                        <td className="border-b border-border/60 px-3 py-2 text-right font-mono text-[11px] text-text-secondary">
                          {formatBytes(entry.size)}
                        </td>
                        <td className="border-b border-border/60 px-3 py-2">
                          <TimestampCell timestamp={entry.createdAt} />
                        </td>
                        <td className="border-b border-border/60 px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDownload(entry);
                              }}
                              aria-label="Download storage object"
                            >
                              <Download size={13} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteTarget(entry);
                              }}
                              aria-label="Delete storage object"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <StorageDetailPanel
          entry={selectedEntry}
          onDownload={handleDownload}
          onDelete={(entry) => setDeleteTarget(entry)}
        />
      </div>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete storage object"
        description={
          deleteTarget
            ? `Delete ${deleteTarget.fileName ?? deleteTarget.id}? This removes the stored bytes and metadata.`
            : "Delete this storage object?"
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) {
            void handleDelete(deleteTarget);
          }
        }}
      />
    </div>
  );
}

function StorageDetailPanel({
  entry,
  onDownload,
  onDelete
}: {
  entry: StorageEntry | null;
  onDownload: (entry: StorageEntry) => Promise<void>;
  onDelete: (entry: StorageEntry) => void;
}) {
  if (!entry) {
    return (
      <aside className="rounded-lg border border-border bg-bg-surface">
        <EmptyState
          icon={FileArchive}
          title="Select a storage object"
          description="Choose an object to inspect metadata and manage it."
        />
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-border bg-bg-surface">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-text-primary">
              {entry.fileName ?? entry.id}
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-text-tertiary">
              {entry.id}
            </div>
          </div>
          <StorageTypeIcon entry={entry} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
          <Meta label="Size" value={formatBytes(entry.size)} />
          <Meta label="Type" value={entry.contentType ?? "unknown"} />
          <Meta
            label="Created"
            value={new Date(entry.createdAt).toLocaleString()}
          />
          <Meta label="Path" value={entry.path} mono />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void onDownload(entry)}
          >
            <Download size={13} />
            Download
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(entry)}
          >
            <Trash2 size={13} />
            Delete
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <EmptyState
          icon={FileArchive}
          title="Preview temporarily disabled"
          description="Use Download to inspect this storage object outside the dashboard."
          className="py-10"
        />
      </div>
    </aside>
  );
}

function StorageTypeIcon({ entry }: { entry: StorageEntry }) {
  const contentType = entry.contentType ?? "";
  const Icon = contentType.startsWith("image/")
    ? Image
    : isTextPreview(entry)
      ? FileText
      : FileArchive;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-bg-base text-text-tertiary">
      <Icon size={15} />
    </div>
  );
}

function Meta({
  label,
  value,
  mono
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-bg-base p-2">
      <div className="text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate text-[12px] text-text-secondary",
          mono && "font-mono text-[11px]"
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function isTextPreview(entry: StorageEntry): boolean {
  const type = entry.contentType ?? "";
  return (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/xml" ||
    type.endsWith("+json")
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let next = value / 1024;
  for (const unit of units) {
    if (next < 1024) {
      return `${next.toFixed(next >= 10 ? 1 : 2)} ${unit}`;
    }
    next /= 1024;
  }
  return `${next.toFixed(1)} PB`;
}

async function createStorageAccess(
  entry: StorageEntry,
  purpose: "download"
): Promise<{
  entry: StorageEntry;
  url: string;
  supportsRange: boolean;
  maxPreviewBytes?: number;
}> {
  const result = await request<"storage.access.create.result">({
    kind: "storage.access.create",
    id: entry.id,
    purpose
  });
  if (result.error || !result.entry || !result.url) {
    throw new Error(result.error ?? "Storage object could not be accessed.");
  }
  return {
    entry: result.entry,
    url: result.url,
    supportsRange: result.supportsRange === true,
    ...(result.maxPreviewBytes
      ? { maxPreviewBytes: result.maxPreviewBytes }
      : {})
  };
}
