#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const MODES = new Set(['catalog-redraw', 'background-only', 'transparent-cutout', 'industrial-scene']);
const TARGET_ASPECT_RATIO = 16 / 10;
const REQUIRED_PROMPT_LABELS = [
  'Use case:',
  'Asset type:',
  'Primary request:',
  'Input images:',
  'Scene/backdrop:',
  'Subject:',
  'Composition/framing:',
  'Lighting/mood:',
  'Constraints:',
  'Avoid:'
];

function usage() {
  console.log(`用法:
  node inspect-image-pair.mjs --source <源图> --output <结果图>
       --prompt <提示词文件> --mode <模式> [--product-code <型号>]`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const output = { source: '', result: '', prompt: '', mode: '', productCode: '', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') output.help = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail(`${token} 缺少参数值`);
      if (token === '--source') output.source = value;
      else if (token === '--output') output.result = value;
      else if (token === '--prompt') output.prompt = value;
      else if (token === '--mode') output.mode = value;
      else if (token === '--product-code') output.productCode = value;
      else fail(`未知参数: ${token}`);
      index += 1;
    }
  }
  if (!output.help) {
    for (const key of ['source', 'result', 'prompt', 'mode']) {
      if (!output[key]) fail(`缺少 --${key === 'result' ? 'output' : key}`);
    }
    if (!MODES.has(output.mode)) fail(`不支持的模式: ${output.mode}`);
  }
  return output;
}

async function inspectImage(file) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail(`图片不存在: ${absolute}`);
  const buffer = fs.readFileSync(absolute);
  if (buffer.length === 0) fail(`图片为空文件: ${absolute}`);
  const metadata = await sharp(buffer, { animated: true, failOn: 'error' }).metadata();
  if (!metadata.width || !metadata.height) fail(`无法读取图片尺寸: ${absolute}`);
  return {
    file: absolute,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    format: metadata.format || '',
    width: metadata.width,
    height: metadata.height,
    aspectRatio: Number((metadata.width / metadata.height).toFixed(4)),
    hasAlpha: Boolean(metadata.hasAlpha),
    pages: Number(metadata.pages || 1)
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exit(0);
  }
  const errors = [];
  const warnings = [];
  const source = await inspectImage(options.source);
  const output = await inspectImage(options.result);
  const promptPath = path.resolve(process.cwd(), options.prompt);
  if (!fs.existsSync(promptPath)) fail(`提示词文件不存在: ${promptPath}`);
  const prompt = fs.readFileSync(promptPath, 'utf8');

  for (const label of REQUIRED_PROMPT_LABELS) {
    if (!prompt.includes(label)) errors.push(`提示词缺少字段: ${label}`);
  }
  if (!prompt.includes('edit target and sole visual source of truth')) {
    errors.push('提示词没有把源图声明为 edit target 和产品视觉真值');
  }
  if (!prompt.includes('16:10 landscape')) errors.push('提示词没有明确要求 16:10 横向网站产品预览图');
  if (!prompt.includes('Do not add any headline')) errors.push('提示词没有明确禁止新增图片文案');
  if (options.productCode && !prompt.includes(options.productCode)) {
    errors.push(`提示词缺少产品型号: ${options.productCode}`);
  }
  if (source.sha256 === output.sha256) errors.push('输出文件与源图完全相同，没有形成独立重绘结果');
  if (Math.min(output.width, output.height) < 800) {
    errors.push(`输出较短边只有 ${Math.min(output.width, output.height)}px，未达到 800px 的发布检查门槛`);
  }
  if (output.pages > 1) errors.push('重绘结果不能是多帧动态图');
  if (Math.abs(output.aspectRatio - TARGET_ASPECT_RATIO) > 0.002) {
    errors.push(`输出比例不是 16:10: ${output.width}x${output.height} (${output.aspectRatio})`);
  }
  if (options.mode === 'transparent-cutout' && !output.hasAlpha) {
    errors.push('transparent-cutout 结果缺少 alpha 通道');
  }
  const report = {
    success: errors.length === 0,
    mode: options.mode,
    productCode: options.productCode || null,
    prompt: promptPath,
    source,
    output,
    targetCanvas: { width: 1600, height: 1000, aspectRatio: TARGET_ASPECT_RATIO },
    visualValidationRequired: true,
    warnings,
    errors
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0) process.exit(1);
} catch (error) {
  console.error(error.message || error);
  usage();
  process.exit(1);
}
