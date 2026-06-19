import type {
  DevtoolsPreview,
  DocumentChangePreview,
  ExecutionTrace,
  SyncoreDevtoolsEvent
} from "@syncore/devtools-protocol";
import { motion } from "motion/react";
import { ExternalLink, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { JsonViewer } from "./JsonViewer";
import { InfoTooltip } from "./InfoTooltip";
import {
  EVENT_BADGE_VARIANTS,
  EVENT_LABELS,
  getEventDetailRows
} from "@/lib/eventPresentation";
import { stableStringify } from "@/lib/stable";

type InvalidationEvent = Extract<
  SyncoreDevtoolsEvent,
  { type: "query.invalidated" }
>;

interface QueryInvalidationSource {
  invalidation: InvalidationEvent;
  trace?: ExecutionTrace | null;
}

interface TraceDetailPanelProps {
  event: SyncoreDevtoolsEvent;
  trace?: ExecutionTrace | null;
  invalidations?: InvalidationEvent[];
  invalidatedBy?: QueryInvalidationSource[];
  causingTrace?: ExecutionTrace | null;
  onOpenExecution?: (executionId: string) => void;
  onOpenFunction?: (functionName: string) => void;
  onOpenTable?: (table: string) => void;
}

export function TraceDetailPanel({
  event,
  trace,
  invalidations = [],
  invalidatedBy = [],
  causingTrace,
  onOpenExecution,
  onOpenFunction,
  onOpenTable
}: TraceDetailPanelProps) {
  const detailRows = getEventDetailRows(event);
  const functionName =
    "functionName" in event ? event.functionName : trace?.functionName;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={EVENT_BADGE_VARIANTS[event.type]}>
          {EVENT_LABELS[event.type]}
        </Badge>
        {trace?.executionId && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {trace.executionId.slice(0, 12)}
          </Badge>
        )}
        <span className="text-[11px] text-text-tertiary">
          {new Date(event.timestamp).toLocaleString()}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {functionName && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => onOpenFunction?.(functionName)}
          >
            <ExternalLink size={11} />
            Function
          </Button>
        )}
        {event.type === "query.invalidated" && event.causedByExecutionId && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => onOpenExecution?.(event.causedByExecutionId!)}
          >
            <ExternalLink size={11} />
            Causing execution
          </Button>
        )}
        {event.type === "query.invalidated" && event.rerunExecutionId && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => onOpenExecution?.(event.rerunExecutionId!)}
          >
            <ExternalLink size={11} />
            Query rerun
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview" className="min-w-0">
        <TabsList variant="line" className="h-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="args">Args</TabsTrigger>
          <TabsTrigger value="result">Result</TabsTrigger>
          <TabsTrigger value="writes">Reads/Writes</TabsTrigger>
          <TabsTrigger value="invalidations">Invalidations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <div className="flex flex-col gap-2 text-[12px]">
            {detailRows.map((row) => (
              <TraceRow
                key={`${event.type}-${row.label}`}
                label={row.label}
                value={row.value}
                mono={row.mono}
                error={row.error}
              />
            ))}
            {trace?.parentExecutionId && (
              <TraceLinkRow
                label="Parent"
                value={trace.parentExecutionId}
                onClick={() => onOpenExecution?.(trace.parentExecutionId!)}
              />
            )}
            {causingTrace && (
              <TraceLinkRow
                label="Caused by"
                value={causingTrace.functionName ?? causingTrace.executionId}
                onClick={() => onOpenExecution?.(causingTrace.executionId)}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="args" className="mt-3">
          <PreviewBlock
            preview={trace?.argsPreview}
            empty="No args captured."
          />
        </TabsContent>

        <TabsContent value="result" className="mt-3">
          {trace?.error ? (
            <div className="rounded-md border border-error/20 bg-error/5 p-3 font-mono text-[12px] text-error">
              {trace.error}
            </div>
          ) : (
            <PreviewBlock
              preview={trace?.resultPreview}
              empty="No result captured."
            />
          )}
        </TabsContent>

        <TabsContent value="writes" className="mt-3 space-y-3">
          <ScopeList title="Read scopes" scopes={trace?.readScopes} />
          <ScopeList
            title="Changed scopes"
            scopes={trace?.changedScopes ?? trace?.writeScopes}
          />
          {trace?.changedDocumentsPreview?.length ? (
            <div className="space-y-2">
              <SectionTitle>Document changes</SectionTitle>
              {trace.changedDocumentsPreview.map((change) => (
                <div
                  key={`${change.table}-${change.id}-${change.operation}`}
                  className="rounded-md border border-border bg-bg-base p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <InfoTooltip
                      termSlug={
                        change.operation === "delete"
                          ? "op.mut-delete"
                          : `op.${change.operation}`
                      }
                      side="top"
                    >
                      <Badge variant="outline">{change.operation}</Badge>
                    </InfoTooltip>
                    <button
                      type="button"
                      className="font-mono text-accent hover:underline"
                      onClick={() => onOpenTable?.(change.table)}
                    >
                      {change.table}
                    </button>
                    <span className="font-mono text-text-tertiary">
                      {change.id}
                    </span>
                  </div>
                  <DocumentChangeDiff change={change} />
                </div>
              ))}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="invalidations" className="mt-3 space-y-3">
          {invalidatedBy.length > 0 && (
            <div className="space-y-2">
              <SectionTitle>Reran after invalidation by</SectionTitle>
              {invalidatedBy.map(({ invalidation, trace: sourceTrace }) => (
                <InvalidationSourceRow
                  key={`${invalidation.queryId}-${invalidation.timestamp}-${invalidation.causedByExecutionId ?? "unknown"}`}
                  invalidation={invalidation}
                  trace={sourceTrace ?? null}
                  onOpenExecution={onOpenExecution}
                />
              ))}
            </div>
          )}

          {trace?.invalidatedQueryIds?.length ? (
            <ScopeList
              title="Invalidated queries"
              scopes={trace.invalidatedQueryIds}
            />
          ) : null}

          {invalidations.length > 0 && (
            <div className="space-y-2">
              <SectionTitle>Invalidations caused</SectionTitle>
              {invalidations.map((item) => (
                <button
                  key={`${item.queryId}-${item.timestamp}`}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-border bg-bg-base px-3 py-2 text-left text-[12px] hover:border-border-hover"
                  onClick={() =>
                    item.rerunExecutionId
                      ? onOpenExecution?.(item.rerunExecutionId)
                      : undefined
                  }
                >
                  <span className="font-mono text-text-secondary">
                    {item.queryId}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {item.matchedScopes?.length ?? 0} scopes
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {invalidatedBy.length === 0 &&
            !trace?.invalidatedQueryIds?.length &&
            invalidations.length === 0 && (
              <div className="rounded-md border border-border bg-bg-base p-3 text-[12px] text-text-tertiary">
                No invalidation relationships captured.
              </div>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewBlock({
  preview,
  empty,
  label
}: {
  preview?: DevtoolsPreview | undefined;
  empty?: string | undefined;
  label?: string | undefined;
}) {
  if (!preview) {
    return (
      <div className="rounded-md border border-border bg-bg-base p-3 text-[12px] text-text-tertiary">
        {empty ?? "No preview captured."}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {label && <SectionTitle>{label}</SectionTitle>}
      <JsonViewer
        data={preview.kind === "value" ? preview.value : preview}
        defaultExpanded={false}
        maxDepth={4}
      />
      {preview.truncated && (
        <div className="text-[11px] text-warning">Preview was truncated.</div>
      )}
    </div>
  );
}

function InvalidationSourceRow({
  invalidation,
  trace,
  onOpenExecution
}: {
  invalidation: InvalidationEvent;
  trace?: ExecutionTrace | null;
  onOpenExecution?: ((executionId: string) => void) | undefined;
}) {
  const canOpen = Boolean(invalidation.causedByExecutionId);
  const title =
    trace?.functionName ??
    invalidation.causedByExecutionId ??
    "Unknown execution";
  return (
    <button
      type="button"
      disabled={!canOpen}
      className="flex w-full flex-col gap-2 rounded-md border border-border bg-bg-base px-3 py-2 text-left text-[12px] transition-colors enabled:hover:border-border-hover disabled:cursor-default"
      onClick={() =>
        invalidation.causedByExecutionId
          ? onOpenExecution?.(invalidation.causedByExecutionId)
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-text-secondary">
          {title}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {trace?.kind && (
            <Badge variant="secondary" className="text-[10px]">
              {trace.kind}
            </Badge>
          )}
          {canOpen && <ExternalLink size={11} className="text-text-tertiary" />}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
        <Badge variant="outline" className="font-mono text-[10px]">
          {invalidation.reason}
        </Badge>
        <span>{new Date(invalidation.timestamp).toLocaleTimeString()}</span>
      </div>
      {invalidation.matchedScopes?.length ? (
        <div className="flex flex-wrap gap-1">
          {invalidation.matchedScopes.map((scope) => (
            <Badge
              key={scope}
              variant="outline"
              className="font-mono text-[10px]"
            >
              {scope}
            </Badge>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function ScopeList({
  title,
  scopes
}: {
  title: string;
  scopes?: string[] | undefined;
}) {
  return (
    <div className="space-y-1">
      <SectionTitle>{title}</SectionTitle>
      {scopes?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {scopes.map((scope) => (
            <Badge
              key={scope}
              variant="outline"
              className="font-mono text-[10px]"
            >
              {scope}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-text-tertiary">None captured.</div>
      )}
    </div>
  );
}

function TraceRow({
  label,
  value,
  mono,
  error
}: {
  label: string;
  value: string;
  mono?: boolean | undefined;
  error?: boolean | undefined;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-text-tertiary">{label}</span>
      <span
        className={`${mono ? "font-mono" : ""} ${error ? "text-error" : "text-text-secondary"} break-all`}
      >
        {value}
      </span>
    </div>
  );
}

function TraceLinkRow({
  label,
  value,
  onClick
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-text-tertiary">{label}</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 break-all font-mono text-accent hover:underline"
        onClick={onClick}
      >
        {value}
        <Copy size={10} className="opacity-60" />
      </button>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-semibold text-text-tertiary">
      {children}
    </div>
  );
}

function formatPreviewValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") {
    const s = value.length > 40 ? `${value.slice(0, 40)}…` : value;
    return `"${s}"`;
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  const s = JSON.stringify(value);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function DocumentChangeDiff({ change }: { change: DocumentChangePreview }) {
  const before =
    change.beforePreview?.kind === "value" &&
    typeof change.beforePreview.value === "object" &&
    change.beforePreview.value !== null
      ? (change.beforePreview.value as Record<string, unknown>)
      : null;
  const after =
    change.afterPreview?.kind === "value" &&
    typeof change.afterPreview.value === "object" &&
    change.afterPreview.value !== null
      ? (change.afterPreview.value as Record<string, unknown>)
      : null;

  // INSERT: only after
  if (after && !before) {
    return (
      <motion.div
        variants={staggerContainer(0.03)}
        initial="hidden"
        animate="visible"
        className="rounded border border-success/20 overflow-hidden"
      >
        {Object.entries(after).map(([key, value]) => (
          <motion.div
            key={key}
            variants={fadeUp}
            className="flex items-baseline gap-2 border-b border-success/10 bg-success/5 px-3 py-1.5 last:border-b-0"
          >
            <span className="w-32 shrink-0 truncate font-mono text-[11px] text-success/80">
              {key}
            </span>
            <span className="min-w-0 truncate font-mono text-[11px] text-success">
              {formatPreviewValue(value)}
            </span>
          </motion.div>
        ))}
      </motion.div>
    );
  }

  // DELETE: only before
  if (before && !after) {
    return (
      <motion.div
        variants={staggerContainer(0.03)}
        initial="hidden"
        animate="visible"
        className="rounded border border-error/20 overflow-hidden"
      >
        {Object.entries(before).map(([key, value]) => (
          <motion.div
            key={key}
            variants={fadeUp}
            className="flex items-baseline gap-2 border-b border-error/10 bg-error/5 px-3 py-1.5 last:border-b-0"
          >
            <span className="w-32 shrink-0 truncate font-mono text-[11px] text-error/80">
              {key}
            </span>
            <span className="min-w-0 truncate font-mono text-[11px] text-error line-through">
              {formatPreviewValue(value)}
            </span>
          </motion.div>
        ))}
      </motion.div>
    );
  }

  // PATCH / REPLACE: field-level diff
  if (before && after) {
    type DiffEntry =
      | { key: string; kind: "changed"; before: unknown; after: unknown }
      | { key: string; kind: "added"; after: unknown }
      | { key: string; kind: "removed"; before: unknown }
      | { key: string; kind: "unchanged" };

    const allKeys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)])
    );
    const entries: DiffEntry[] = allKeys.map((key) => {
      const inBefore = key in before;
      const inAfter = key in after;
      if (inBefore && inAfter) {
        return stableStringify(before[key]) !== stableStringify(after[key])
          ? { key, kind: "changed", before: before[key], after: after[key] }
          : { key, kind: "unchanged" };
      }
      return inAfter
        ? { key, kind: "added", after: after[key] }
        : { key, kind: "removed", before: before[key] };
    });

    const changed = entries.filter((e) => e.kind !== "unchanged");
    const unchangedCount = entries.length - changed.length;

    if (changed.length === 0) {
      return (
        <div className="text-[11px] text-text-tertiary">
          No field-level changes detected.
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <motion.div
          variants={staggerContainer(0.03)}
          initial="hidden"
          animate="visible"
          className="rounded border border-border overflow-hidden"
        >
          {changed.map((entry) => {
            if (entry.kind === "changed") {
              return (
                <motion.div
                  key={entry.key}
                  variants={fadeUp}
                  className="flex items-baseline border-b border-warning/10 bg-warning/5 last:border-b-0"
                >
                  <span className="w-32 shrink-0 truncate px-3 py-1.5 font-mono text-[11px] text-text-secondary">
                    {entry.key}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5">
                    <span className="max-w-[35%] truncate font-mono text-[11px] text-error/80 line-through">
                      {formatPreviewValue(entry.before)}
                    </span>
                    <span className="shrink-0 text-[10px] text-text-tertiary">
                      →
                    </span>
                    <span className="min-w-0 truncate font-mono text-[11px] text-success">
                      {formatPreviewValue(entry.after)}
                    </span>
                  </div>
                </motion.div>
              );
            }
            if (entry.kind === "added") {
              return (
                <motion.div
                  key={entry.key}
                  variants={fadeUp}
                  className="flex items-baseline border-b border-success/10 bg-success/5 last:border-b-0"
                >
                  <span className="w-32 shrink-0 truncate px-3 py-1.5 font-mono text-[11px] text-success/80">
                    {entry.key}
                  </span>
                  <span className="min-w-0 truncate px-3 py-1.5 font-mono text-[11px] text-success">
                    {formatPreviewValue(entry.after)}
                  </span>
                </motion.div>
              );
            }
            // removed
            return (
              <motion.div
                key={entry.key}
                variants={fadeUp}
                className="flex items-baseline border-b border-error/10 bg-error/5 last:border-b-0"
              >
                <span className="w-32 shrink-0 truncate px-3 py-1.5 font-mono text-[11px] text-error/80">
                  {entry.key}
                </span>
                <span className="min-w-0 truncate px-3 py-1.5 font-mono text-[11px] text-error line-through">
                  {formatPreviewValue(entry.before)}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
        {unchangedCount > 0 && (
          <div className="px-1 text-[11px] text-text-tertiary">
            +{unchangedCount} unchanged{" "}
            {unchangedCount === 1 ? "field" : "fields"}
          </div>
        )}
      </div>
    );
  }

  // Fallback for non-object previews (error previews, primitives, etc.)
  return (
    <div className="grid gap-2">
      {change.beforePreview && (
        <PreviewBlock label="Before" preview={change.beforePreview} />
      )}
      {change.afterPreview && (
        <PreviewBlock label="After" preview={change.afterPreview} />
      )}
    </div>
  );
}
