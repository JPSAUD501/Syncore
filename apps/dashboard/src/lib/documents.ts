export function parseDocumentImportText(
  text: string
): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Paste at least one document to import.");
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => stripSystemFields(assertDocument(item)));
    }
    return [stripSystemFields(assertDocument(parsed))];
  } catch {
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      throw new Error("Paste at least one document to import.");
    }

    return lines.map((line, index) => {
      try {
        return stripSystemFields(assertDocument(JSON.parse(line) as unknown));
      } catch (err) {
        throw new Error(
          err instanceof Error
            ? `Line ${index + 1}: ${err.message}`
            : `Line ${index + 1}: Invalid JSON`,
          { cause: err }
        );
      }
    });
  }
}

export function assertDocument(
  value: unknown,
  message = "Each imported item must be a JSON object."
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(message);
  }
  return value;
}

export function stripSystemFields(document: Record<string, unknown>) {
  const next = { ...document };
  delete next._id;
  delete next._creationTime;
  return next;
}

export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
