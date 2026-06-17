import ts from "typescript";

export interface ScannedFunctionEntry {
  pathParts: string[];
  exportName: string;
  kind: "query" | "mutation" | "action";
}

const FUNCTION_KINDS = new Set(["query", "mutation", "action"]);

export function scanSyncoreFunctionExports(
  source: string,
  pathParts: string[],
  fileName = pathParts.at(-1) ?? "functions.ts"
): ScannedFunctionEntry[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const entries: ScannedFunctionEntry[] = [];
  const exportedNames = new Set<string>();
  const localFunctionDeclarations = new Map<
    string,
    ScannedFunctionEntry["kind"]
  >();

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }
        const kind = getSyncoreFunctionKind(declaration.initializer);
        if (!kind) {
          continue;
        }
        localFunctionDeclarations.set(declaration.name.text, kind);
        if (hasExportModifier(statement)) {
          pushEntry(entries, exportedNames, pathParts, declaration.name.text, kind);
        }
      }
      continue;
    }

    if (!ts.isExportDeclaration(statement) || !statement.exportClause) {
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause) || statement.moduleSpecifier) {
      continue;
    }
    for (const specifier of statement.exportClause.elements) {
      if (specifier.propertyName) {
        continue;
      }
      const exportName = specifier.name.text;
      const kind = localFunctionDeclarations.get(exportName);
      if (!kind) {
        continue;
      }
      pushEntry(entries, exportedNames, pathParts, exportName, kind);
    }
  }

  return entries;
}

function pushEntry(
  entries: ScannedFunctionEntry[],
  exportedNames: Set<string>,
  pathParts: string[],
  exportName: string,
  kind: ScannedFunctionEntry["kind"]
): void {
  if (exportedNames.has(exportName)) {
    return;
  }
  exportedNames.add(exportName);
  entries.push({ pathParts, exportName, kind });
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    )
  );
}

function getSyncoreFunctionKind(
  expression: ts.Expression
): ScannedFunctionEntry["kind"] | null {
  const unwrapped = unwrapExpression(expression);
  if (!ts.isCallExpression(unwrapped)) {
    return null;
  }
  const callee = unwrapExpression(unwrapped.expression);
  if (!ts.isIdentifier(callee) || !FUNCTION_KINDS.has(callee.text)) {
    return null;
  }
  return callee.text as ScannedFunctionEntry["kind"];
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (true) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isSatisfiesExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    return current;
  }
}
