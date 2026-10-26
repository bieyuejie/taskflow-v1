import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// 只读取刚生成的 dist；构建由 npm run build 独立完成，避免把测量当作优化。
const root = fileURLToPath(new URL('../', import.meta.url));
const label = process.argv[2];
assert(/^[a-z][a-z0-9-]*$/.test(label ?? ''), '请提供记录名称，例如 baseline');
const destination = path.join(root, 'docs', 'stage1', `${label}-build.json`);
assert(!existsSync(destination), '指标已存在，请使用新的记录名称，不覆盖历史数据');

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  });
}

const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const dependencies = Object.fromEntries(
  Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .sort()
    .map((name) => [name, lock.packages[`node_modules/${name}`].version])
);
const assets = listFiles(path.join(root, 'dist'))
  .filter((file) => /\.(js|css)$/.test(file))
  .sort()
  .map((file) => {
    const content = readFileSync(file);
    return {
      file: path.relative(path.join(root, 'dist'), file).replaceAll('\\', '/'),
      bytes: content.length,
      gzipBytes: gzipSync(content).length,
      sha256: sha256(content),
    };
  });
const js = assets.filter((asset) => asset.file.endsWith('.js'));
assert(js.length > 0, 'dist 中未找到 JS，请先执行 npm run build');
const largest = js.reduce((max, asset) => (asset.bytes > max.bytes ? asset : max));
const inputs = [
  ...listFiles(path.join(root, 'src')),
  ...['index.html', 'vite.config.js', 'package.json', 'package-lock.json'].map((file) =>
    path.join(root, file)
  ),
].sort();
const record = {
  label,
  measuredAt: new Date().toISOString(),
  buildCommand: 'npm run build',
  units: 'bytes; kB = bytes / 1000; gzip is the sum of individually compressed JS files',
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    npm: process.env.npm_config_user_agent ?? 'not run through npm',
  },
  dependencies,
  inputSha256: Object.fromEntries(
    inputs.map((file) => [
      path.relative(root, file).replaceAll('\\', '/'),
      sha256(readFileSync(file)),
    ])
  ),
  dataConditions: 'Mock seeds unchanged; no browser or persistent data affects the build',
  javascript: {
    chunks: js.length,
    totalBytes: js.reduce((sum, asset) => sum + asset.bytes, 0),
    totalGzipBytes: js.reduce((sum, asset) => sum + asset.gzipBytes, 0),
    largestChunk: largest,
  },
  assets,
};
mkdirSync(path.dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ record: destination, ...record.javascript }, null, 2));
