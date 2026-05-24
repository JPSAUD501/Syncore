import { getDocumentId } from "@/lib/dataValue";
import type { TableField } from "@syncore/devtools-protocol";

export interface ReferenceOption {
  id: string;
  preview: string;
  searchText: string;
  document: Record<string, unknown>;
}

export interface ReferenceFieldOptions {
  field: TableField;
  tableName: string;
  options: ReferenceOption[];
}

export function createReferenceOptions(
  field: TableField,
  rows: Record<string, unknown>[]
): ReferenceFieldOptions | null {
  if (!field.referenceTable) {
    return null;
  }
  return {
    field,
    tableName: field.referenceTable,
    options: rows.map((document) => {
      const id = getDocumentId(document);
      const preview = getReferencePreview(document);
      return {
        id,
        preview,
        searchText: createReferenceSearchText(id, preview, document),
        document
      };
    })
  };
}

export function getReferencePreview(document: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(document)) {
    if (key === "_id" || key === "_creationTime") {
      continue;
    }
    const preview = previewReferenceValue(value);
    if (preview) {
      parts.push(`${key}: ${preview}`);
    }
    if (parts.length === 3) {
      break;
    }
  }
  return parts.length > 0 ? parts.join(", ") : "No preview fields";
}

export function getReferenceDisplay(
  reference: ReferenceFieldOptions,
  value: unknown
): { id: string; preview: string; missing: boolean } | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const option = reference.options.find((candidate) => candidate.id === value);
  return {
    id: value,
    preview: option?.preview ?? "Referenced row is not present in this runtime",
    missing: !option
  };
}

function createReferenceSearchText(
  id: string,
  preview: string,
  document: Record<string, unknown>
): string {
  const primitiveValues = Object.entries(document)
    .filter(([key]) => key !== "_id" && key !== "_creationTime")
    .map(([, value]) => previewReferenceValue(value))
    .filter((value): value is string => Boolean(value));
  return [id, preview, ...primitiveValues].join(" ").toLowerCase();
}

function previewReferenceValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value).length}}`;
  }
  return null;
}
