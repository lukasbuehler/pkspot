import { builtinModules } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ImportKind = "runtime" | "type";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface ImportRecord {
  file: string;
  kind: ImportKind;
  specifier: string;
}

const repoRoot = process.cwd();
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const sourceExtensions = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"] as const;
const ignoredDirectories = new Set([
  ".angular",
  ".git",
  "coverage",
  "dist",
  "lib",
  "node_modules",
  "playwright-report",
  "test-results",
]);

function readPackageJson(packageDir: string): PackageJson {
  return JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
}

function packageName(specifier: string): string | null {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    nodeBuiltins.has(specifier)
  ) {
    return null;
  }

  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function manifestNames(
  manifest: PackageJson,
  fields: readonly (keyof PackageJson)[],
): Set<string> {
  return new Set(
    fields.flatMap((field) => Object.keys(manifest[field] ?? {})),
  );
}

function scriptKind(filePath: string): ts.ScriptKind {
  switch (extname(filePath)) {
    case ".js":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".mjs":
      return ts.ScriptKind.JS;
    case ".mts":
      return ts.ScriptKind.TS;
    case ".cts":
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.TS;
  }
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

function parseImports(filePath: string): ImportRecord[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const imports: ImportRecord[] = [];

  function add(specifier: string, kind: ImportKind): void {
    imports.push({ file: filePath, kind, specifier });
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      add(
        node.moduleSpecifier.text,
        isTypeOnlyImportClause(node.importClause) ? "type" : "runtime",
      );
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier.text, node.isTypeOnly ? "type" : "runtime");
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      add(node.moduleReference.expression.text, "runtime");
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "require") ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword)
    ) {
      add(node.arguments[0].text, "runtime");
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return imports;
}

function hasIgnoredDirectory(filePath: string): boolean {
  return filePath
    .split(/[\\/]/)
    .some((part) => ignoredDirectories.has(part));
}

function collectFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const stat = statSync(root);
  if (stat.isFile()) {
    return sourceExtensions.includes(extname(root) as (typeof sourceExtensions)[number])
      ? [root]
      : [];
  }

  const out: string[] = [];
  const entries = ts.sys.readDirectory(
    root,
    [...sourceExtensions],
    Array.from(ignoredDirectories),
  );
  for (const entry of entries) {
    const resolvedEntry = resolve(entry);
    if (!hasIgnoredDirectory(resolvedEntry)) {
      out.push(resolvedEntry);
    }
  }
  return out;
}

function resolveLocalModule(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function collectReachableFiles(entryFiles: readonly string[]): string[] {
  const seen = new Set<string>();
  const pending = [...entryFiles];

  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);

    for (const entry of parseImports(file)) {
      const resolvedImport = resolveLocalModule(file, entry.specifier);
      if (resolvedImport && resolvedImport.startsWith(repoRoot)) {
        pending.push(resolvedImport);
      }
    }
  }

  return [...seen].sort();
}

function missingImports(options: {
  allowedRuntimePackages: Set<string>;
  allowedTypePackages?: Set<string>;
  includeTypeImports?: boolean;
  files: readonly string[];
}): string[] {
  const problems: string[] = [];
  for (const file of options.files) {
    for (const entry of parseImports(file)) {
      if (entry.kind === "type" && options.includeTypeImports === false) {
        continue;
      }

      const name = packageName(entry.specifier);
      if (!name) continue;

      const allowed =
        entry.kind === "type"
          ? (options.allowedTypePackages ?? options.allowedRuntimePackages)
          : options.allowedRuntimePackages;
      if (!allowed.has(name)) {
        problems.push(
          `${file.replace(`${repoRoot}/`, "")} imports "${entry.specifier}" but "${name}" is not declared`,
        );
      }
    }
  }
  return Array.from(new Set(problems)).sort();
}

describe("package manifests", () => {
  it("root package declares every bare import used by repo source and scripts", () => {
    const manifest = readPackageJson(repoRoot);
    const allowed = manifestNames(manifest, [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]);
    const files = [
      ...collectFiles(join(repoRoot, "src")),
      ...collectFiles(join(repoRoot, "scripts")),
      ...collectFiles(join(repoRoot, "e2e")),
      ...collectFiles(join(repoRoot, "server.ts")),
      ...collectFiles(join(repoRoot, "test-server.mjs")),
      ...collectFiles(join(repoRoot, "copy-proxy-server.js")),
    ];

    expect(missingImports({ allowedRuntimePackages: allowed, files })).toEqual([]);
  });

  it("functions package declares every runtime import reachable from functions source", () => {
    const functionsDir = join(repoRoot, "functions");
    const manifest = readPackageJson(functionsDir);
    const runtimePackages = manifestNames(manifest, [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]);
    const typePackages = manifestNames(manifest, [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]);
    const files = collectReachableFiles([join(functionsDir, "src/index.ts")]);

    expect(
      missingImports({
        allowedRuntimePackages: runtimePackages,
        allowedTypePackages: typePackages,
        includeTypeImports: false,
        files,
      }),
    ).toEqual([]);
  });
});
