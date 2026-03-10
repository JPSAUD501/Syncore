import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface DeclarationDocExpectation {
  symbol: string;
  kind: "interface" | "function" | "class" | "const" | "type";
}

export async function readDeclarationFile(
  relativePathFromTest: string
): Promise<string> {
  const snapshotPath = path.resolve(
    import.meta.dirname,
    "..",
    ".declaration-artifacts",
    "packages",
    relativePathFromTest.replace(/^(\.\.\/)+/, "")
  );
  if (await fileExists(snapshotPath)) {
    return readFile(snapshotPath, "utf8");
  }

  return readFile(path.resolve(import.meta.dirname, relativePathFromTest), "utf8");
}

export function expectPublicDeclarationsToBeDocumented(
  declarations: string,
  expectations: DeclarationDocExpectation[]
): void {
  for (const expectation of expectations) {
    const documentedPattern = createDocumentedDeclarationPattern(expectation);
    if (!documentedPattern.test(declarations)) {
      throw new Error(
        `Expected public ${expectation.kind} ${JSON.stringify(expectation.symbol)} to have JSDoc in the published declaration output.`
      );
    }
  }
}

/**
 * Type-only re-export to give other workspace tests a stable import path.
 */
export type { DeclarationDocExpectation as PublicDeclarationDocExpectation };

function createDocumentedDeclarationPattern(
  expectation: DeclarationDocExpectation
): RegExp {
  const escapedSymbol = escapeRegExp(expectation.symbol);

  switch (expectation.kind) {
    case "interface":
      return new RegExp(
        String.raw`/\*\*[\s\S]*?\*/\s+(?:export\s+)?interface\s+${escapedSymbol}\b`
      );
    case "function":
      return new RegExp(
        String.raw`/\*\*[\s\S]*?\*/\s+(?:export\s+)?(?:declare\s+)?function\s+${escapedSymbol}\b`
      );
    case "class":
      return new RegExp(
        String.raw`/\*\*[\s\S]*?\*/\s+(?:export\s+)?(?:declare\s+)?class\s+${escapedSymbol}\b`
      );
    case "const":
      return new RegExp(
        String.raw`/\*\*[\s\S]*?\*/\s+(?:export\s+)?(?:declare\s+)?const\s+${escapedSymbol}\b`
      );
    case "type":
      return new RegExp(
        String.raw`/\*\*[\s\S]*?\*/\s+(?:export\s+)?type\s+${escapedSymbol}\b`
      );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
