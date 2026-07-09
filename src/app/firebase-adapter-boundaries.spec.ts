import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const appRoot = resolve(repoRoot, "src/app");

const allowedRuntimeImportFiles = new Set([
  "src/app/app.config.ts",
  "src/app/services/firebase/firestore-adapter.service.ts",
  "src/app/services/firebase/functions-adapter.service.ts",
  "src/app/services/firebase/storage-adapter.service.ts",
]);

const restrictedNamedImportsByModule = new Map<string, Set<string>>([
  [
    "@angular/fire/firestore",
    new Set([
      "addDoc",
      "collection",
      "collectionGroup",
      "deleteDoc",
      "deleteField",
      "doc",
      "getDoc",
      "getDocs",
      "limit",
      "onSnapshot",
      "orderBy",
      "query",
      "setDoc",
      "startAfter",
      "updateDoc",
      "where",
    ]),
  ],
  [
    "firebase/firestore",
    new Set([
      "addDoc",
      "collection",
      "collectionGroup",
      "deleteDoc",
      "deleteField",
      "doc",
      "getDoc",
      "getDocs",
      "limit",
      "onSnapshot",
      "orderBy",
      "query",
      "setDoc",
      "startAfter",
      "updateDoc",
      "where",
    ]),
  ],
  [
    "@angular/fire/storage",
    new Set(["deleteObject", "getDownloadURL", "ref", "uploadBytesResumable"]),
  ],
  [
    "firebase/storage",
    new Set(["deleteObject", "getDownloadURL", "ref", "uploadBytesResumable"]),
  ],
  ["@angular/fire/functions", new Set(["httpsCallable"])],
  ["firebase/functions", new Set(["httpsCallable"])],
]);

const restrictedNamespaceModules = new Set([
  "@capacitor-firebase/firestore",
  "@capacitor-firebase/storage",
]);

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = resolve(dir, entry);
      return statSync(path).isDirectory() ? listTypeScriptFiles(path) : [path];
    })
    .filter(
      (path) =>
        path.endsWith(".ts") &&
        !path.endsWith(".spec.ts") &&
        !path.endsWith(".test.ts") &&
        !path.endsWith(".d.ts"),
    );
}

function relativePath(path: string): string {
  return relative(repoRoot, path);
}

function isTypeOnlyImportClause(importClause: ts.ImportClause | undefined): boolean {
  if (!importClause) return false;
  if (importClause.isTypeOnly) return true;

  const namedBindings = importClause.namedBindings;
  return (
    !!namedBindings &&
    ts.isNamedImports(namedBindings) &&
    namedBindings.elements.length > 0 &&
    namedBindings.elements.every((element) => element.isTypeOnly)
  );
}

function restrictedImports(filePath: string): string[] {
  const relPath = relativePath(filePath);
  if (allowedRuntimeImportFiles.has(relPath)) {
    return [];
  }

  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations: string[] = [];

  source.forEachChild((node) => {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier) ||
      isTypeOnlyImportClause(node.importClause)
    ) {
      return;
    }

    const moduleName = node.moduleSpecifier.text;
    const namedBindings = node.importClause?.namedBindings;
    const restrictedNames = restrictedNamedImportsByModule.get(moduleName);

    if (restrictedNames && namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        if (element.isTypeOnly) continue;
        const importedName = element.propertyName?.text ?? element.name.text;
        if (restrictedNames.has(importedName)) {
          violations.push(`${relPath}: ${importedName} from ${moduleName}`);
        }
      }
    }

    if (restrictedNamespaceModules.has(moduleName)) {
      violations.push(`${relPath}: runtime import from ${moduleName}`);
    }
  });

  return violations;
}

describe("Firebase adapter boundaries", () => {
  it("keeps Firestore, Storage, and callable operation imports inside adapters", () => {
    const violations = listTypeScriptFiles(appRoot).flatMap(restrictedImports);

    expect(violations).toEqual([]);
  });
});
