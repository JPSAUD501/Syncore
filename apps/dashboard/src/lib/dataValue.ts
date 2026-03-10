const DATE_FIELD_PATTERN =
  /(date|time|timestamp|createdat|updatedat|deletedat|publishedat|expiresat|scheduledat|lastseenat|lastsyncedat|lastupdatedat)$/i;

function normalizeFieldName(field: string): string {
  return field.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isFiniteDate(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPlausibleTimestamp(value: number): boolean {
  if (!isFiniteDate(value)) {
    return false;
  }
  const milliseconds =
    value >= 1_000_000_000_000 ? value : value >= 1_000_000_000 ? value * 1000 : NaN;
  return Number.isFinite(milliseconds) && milliseconds >= 946684800000;
}

function toTimestampMs(value: number): number {
  return value >= 1_000_000_000_000 ? value : value * 1000;
}

export function isDateLikeField(field: string): boolean {
  return DATE_FIELD_PATTERN.test(normalizeFieldName(field));
}

export function inferDateValue(
  field: string,
  value: unknown
): { iso: string; rawTimestamp: number | string } | null {
  if (typeof value === "number" && isDateLikeField(field) && isPlausibleTimestamp(value)) {
    const timestampMs = toTimestampMs(value);
    return {
      iso: new Date(timestampMs).toISOString(),
      rawTimestamp: value
    };
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (isDateLikeField(field) && Number.isFinite(parsed)) {
      return {
        iso: new Date(parsed).toISOString(),
        rawTimestamp: value
      };
    }
  }

  return null;
}

export function toEditableCellText(field: string, value: unknown): string {
  const inferredDate = inferDateValue(field, value);
  if (inferredDate) {
    return inferredDate.iso;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return "";
}

export function parseEditableCellValue(
  field: string,
  text: string,
  originalValue: unknown
): unknown {
  const trimmed = text.trim();

  if (trimmed === "") {
    return "";
  }

  const inferredDate = inferDateValue(field, originalValue);
  if (inferredDate && Number.isFinite(Date.parse(trimmed))) {
    const nextDate = new Date(trimmed);
    if (typeof originalValue === "number") {
      const nextTimestamp = nextDate.getTime();
      return originalValue >= 1_000_000_000_000
        ? nextTimestamp
        : Math.floor(nextTimestamp / 1000);
    }
    return nextDate.toISOString();
  }

  try {
    return JSON.parse(text);
  } catch {
    const num = Number(text);
    if (!Number.isNaN(num) && trimmed !== "") {
      return num;
    }
    if (trimmed === "true") {
      return true;
    }
    if (trimmed === "false") {
      return false;
    }
    if (trimmed === "null") {
      return null;
    }
    return text;
  }
}

export function formatCellPreview(field: string, value: unknown): {
  kind: "date" | "text" | "number" | "boolean" | "null" | "empty" | "object";
  text: string;
  title?: string;
} {
  const inferredDate = inferDateValue(field, value);
  if (inferredDate) {
    return {
      kind: "date",
      text: inferredDate.iso,
      title:
        typeof inferredDate.rawTimestamp === "number"
          ? String(inferredDate.rawTimestamp)
          : inferredDate.rawTimestamp
    };
  }

  if (value === null) {
    return { kind: "null", text: "null" };
  }
  if (value === undefined) {
    return { kind: "empty", text: "-" };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean", text: String(value) };
  }
  if (typeof value === "number") {
    return { kind: "number", text: String(value) };
  }
  if (typeof value === "string") {
    return {
      kind: "text",
      text: value,
      title: value
    };
  }
  if (typeof value === "object") {
    return {
      kind: "object",
      text: Array.isArray(value)
        ? `[${value.length} item${value.length === 1 ? "" : "s"}]`
        : `{${Object.keys(value).length} key${Object.keys(value).length === 1 ? "" : "s"}}`
    };
  }
  if (typeof value === "bigint") {
    return { kind: "number", text: String(value) };
  }
  return { kind: "empty", text: "-" };
}
