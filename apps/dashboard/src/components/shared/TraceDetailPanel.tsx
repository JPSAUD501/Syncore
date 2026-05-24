import type {
  DevtoolsPreview,
  ExecutionTrace,
  SyncoreDevtoolsEvent
} from "@syncore/devtools-protocol";
import { ExternalLink, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JsonViewer } from "./JsonViewer";
import {
  EVENT_BADGE_VARIANTS,
  EVENT_LABELS,
  getEventDetailRows
} from "@/lib/eventPresentation";

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
  const functionName = "functionName" in event ? event.functionName : trace?.functionName;

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
          <PreviewBlock preview={trace?.argsPreview} empty="No args captured." />
        </TabsContent>

        <TabsContent value="result" className="mt-3">
          {trace?.error ? (
            <div className="rounded-md border border-error/20 bg-error/5 p-3 font-mono text-[12px] text-error">
              {trace.error}
            </div>
          ) : (
            <PreviewBlock preview={trace?.resultPreview} empty="No result captured." />
          )}
        </TabsContent>

        <TabsContent value="writes" className="mt-3 space-y-3">
          <ScopeList title="Read scopes" scopes={trace?.readScopes} />
          <ScopeList title="Changed scopes" scopes={trace?.changedScopes ?? trace?.writeScopes} />
          {trace?.changedDocumentsPreview?.length ? (
            <div className="space-y-2">
              <SectionTitle>Document changes</SectionTitle>
              {trace.changedDocumentsPreview.map((change) => (
                <div
                  key={`${change.table}-${change.id}-${change.operation}`}
                  className="rounded-md border border-border bg-bg-base p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <Badge variant="outline">{change.operation}</Badge>
                    <button
                      type="button"
                      className="font-mono text-accent hover:underline"
                      onClick={() => onOpenTable?.(change.table)}
                    >
                      {change.table}
                    </button>
                    <span className="font-mono text-text-tertiary">{change.id}</span>
                  </div>
                  {change.fields?.length ? (
                    <div className="mb-2 text-[11px] text-text-tertiary">
                      Fields: {change.fields.join(", ")}
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    {change.beforePreview && (
                      <PreviewBlock label="Before" preview={change.beforePreview} />
                    )}
                    {change.afterPreview && (
                      <PreviewBlock label="After" preview={change.afterPreview} />
                    )}
                  </div>
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
            <ScopeList title="Invalidated queries" scopes={trace.invalidatedQueryIds} />
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
  const title = trace?.functionName ?? invalidation.causedByExecutionId ?? "Unknown execution";
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
            <Badge key={scope} variant="outline" className="font-mono text-[10px]">
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
            <Badge key={scope} variant="outline" className="font-mono text-[10px]">
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
      <span className={`${mono ? "font-mono" : ""} ${error ? "text-error" : "text-text-secondary"} break-all`}>
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
  return <div className="text-[11px] font-semibold text-text-tertiary">{children}</div>;
}
