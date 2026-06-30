import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '..');
const cwd = process.cwd();
const candidateRoots = Array.from(
  new Set([
    cwd,
    repoRoot,
    path.join(repoRoot, 'system/server'),
  ]),
);
const targets = candidateRoots.flatMap((baseDir) => [
  path.join(baseDir, 'node_modules/@openai/agents-core/dist/types/protocol.mjs'),
  path.join(baseDir, 'node_modules/@openai/agents-core/dist/types/protocol.js'),
]);

const patchers = [
  {
    pattern: /status:\s*z\.enum\(\[[^\]]+\]\)\.optional\(\)/g,
    replacer: 'status: z.string().optional()',
  },
  {
    pattern: /status:\s*zod_1\.z\.enum\(\[[^\]]+\]\)\.optional\(\)/g,
    replacer: 'status: zod_1.z.string().optional()',
  },
  {
    pattern: /status:\s*z\.enum\(\[[^\]]+\]\)/g,
    replacer: 'status: z.string().optional()',
  },
  {
    pattern: /status:\s*zod_1\.z\.enum\(\[[^\]]+\]\)/g,
    replacer: 'status: zod_1.z.string().optional()',
  },
  {
    pattern: /status:\s*z\.string\(\)(?!\.optional\(\))/g,
    replacer: 'status: z.string().optional()',
  },
  {
    pattern: /status:\s*zod_1\.z\.string\(\)(?!\.optional\(\))/g,
    replacer: 'status: zod_1.z.string().optional()',
  },
];

const existingTargets = targets.filter((filePath) => existsSync(filePath));
if (existingTargets.length === 0) {
  throw new Error(
    `Could not find @openai/agents-core protocol files from cwd=${cwd} or repoRoot=${repoRoot}`,
  );
}

for (const filePath of existingTargets) {
  if (!existsSync(filePath)) {
    continue;
  }

  const source = readFileSync(filePath, 'utf8');
  let patched = source;

  for (const { pattern, replacer } of patchers) {
    patched = patched.replace(pattern, replacer);
  }

  if (patched !== source) {
    writeFileSync(filePath, patched, 'utf8');
    process.stdout.write(`patched ${path.relative(repoRoot, filePath)}\n`);
  }
}
