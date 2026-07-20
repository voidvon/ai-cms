import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const VERSION_PATTERN = /^(0|[1-9]\d?)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/;

export function parseVersion(value) {
  const normalized = String(value).trim();
  const match = VERSION_PATTERN.exec(normalized);

  if (!match) {
    throw new Error(`发布版本号“${normalized}”无效。版本格式必须为 X.Y.Z，且每一位都应在 0 到 99 之间。`);
  }

  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

export function incrementVersion(currentVersion) {
  let [major, minor, patch] = parseVersion(currentVersion);

  if (patch < 99) {
    patch += 1;
  } else if (minor < 99) {
    minor += 1;
    patch = 0;
  } else if (major < 99) {
    major += 1;
    minor = 0;
    patch = 0;
  } else {
    throw new Error('无法继续递增 99.99.99：已经达到允许的最高发布版本。');
  }

  return `${major}.${minor}.${patch}`;
}

export function selectLatestTaggedVersion(tags) {
  const versions = tags
    .map((tag) => tag.trim())
    .filter((tag) => /^v/.test(tag))
    .map((tag) => tag.slice(1))
    .filter((version) => VERSION_PATTERN.test(version));

  if (versions.length === 0) {
    return null;
  }

  return versions.sort(compareVersions).at(-1);
}

function readSeedVersion() {
  return fs.readFileSync(path.join(projectRoot, '.release-version'), 'utf8').trim();
}

function readGitTags() {
  const output = execFileSync('git', ['tag', '--list'], {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  return output.split(/\r?\n/).filter(Boolean);
}

function parseArguments(argv) {
  const options = {
    currentVersion: null,
    githubOutput: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--current') {
      options.currentVersion = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === '--github-output') {
      options.githubOutput = argv[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }

  if (argv.includes('--current') && !options.currentVersion) {
    throw new Error('--current 后必须提供版本号。');
  }

  if (argv.includes('--github-output') && !options.githubOutput) {
    throw new Error('--github-output 后必须提供文件路径。');
  }

  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const latestTagVersion = options.currentVersion
    ? null
    : selectLatestTaggedVersion(readGitTags());
  const currentVersion = options.currentVersion ?? latestTagVersion ?? readSeedVersion();
  const nextVersion = incrementVersion(currentVersion);
  const result = {
    currentVersion,
    nextVersion,
    tag: `v${nextVersion}`,
    source: options.currentVersion ? 'argument' : latestTagVersion ? 'git-tag' : 'seed'
  };

  if (options.githubOutput) {
    fs.appendFileSync(
      options.githubOutput,
      [
        `current_version=${result.currentVersion}`,
        `next_version=${result.nextVersion}`,
        `tag=${result.tag}`,
        `version_source=${result.source}`
      ].join('\n') + '\n'
    );
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
