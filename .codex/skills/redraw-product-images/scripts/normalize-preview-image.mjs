#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

function usage() {
  console.log(`用法:
  node normalize-preview-image.mjs --input <图片> --out <输出图片>
       [--width 1600] [--height 1000] [--background #ffffff] [--transparent]

说明:
  默认使用 contain 将产品完整放入 16:10 的 1600x1000 白色画布，不裁切、不添加文字。`);
}

function fail(message) {
  throw new Error(message);
}

function parsePositiveInt(value, flag) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${flag} 必须是正整数`);
  return parsed;
}

function parseArgs(argv) {
  const output = {
    input: '',
    out: '',
    width: 1600,
    height: 1000,
    background: '#ffffff',
    transparent: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') output.help = true;
    else if (token === '--transparent') output.transparent = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail(`${token} 缺少参数值`);
      if (token === '--input') output.input = value;
      else if (token === '--out') output.out = value;
      else if (token === '--width') output.width = parsePositiveInt(value, token);
      else if (token === '--height') output.height = parsePositiveInt(value, token);
      else if (token === '--background') output.background = value;
      else fail(`未知参数: ${token}`);
      index += 1;
    }
  }
  if (!output.help) {
    if (!output.input) fail('必须提供 --input');
    if (!output.out) fail('必须提供 --out');
    if (Math.abs(output.width / output.height - 1.6) > 0.0001) fail('输出画布必须保持 16:10 比例');
  }
  return output;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const input = path.resolve(process.cwd(), options.input);
  const output = path.resolve(process.cwd(), options.out);
  if (!fs.existsSync(input) || !fs.statSync(input).isFile()) fail(`输入图片不存在: ${input}`);
  if (input === output) fail('输出路径不能覆盖输入图片');

  const extension = path.extname(output).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
    fail('输出只支持 JPG、PNG 或 WebP');
  }
  if (options.transparent && (extension === '.jpg' || extension === '.jpeg')) {
    fail('透明输出不能使用 JPG');
  }

  const source = sharp(input, { animated: false, failOn: 'error' }).rotate();
  const metadata = await source.metadata();
  if (Number(metadata.pages || 1) > 1) fail('不支持多帧动态图作为产品预览图');
  const background = options.transparent
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : options.background;
  let pipeline = source.resize({
    width: options.width,
    height: options.height,
    fit: 'contain',
    position: 'centre',
    background
  });
  if (extension === '.webp') pipeline = pipeline.webp({ quality: 88, effort: 6, smartSubsample: true });
  else if (extension === '.png') pipeline = pipeline.png({ compressionLevel: 9, effort: 10 });
  else pipeline = pipeline.flatten({ background: options.background }).jpeg({ quality: 90, mozjpeg: true });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  await pipeline.toFile(output);
  const result = await sharp(output).metadata();
  if (result.width !== options.width || result.height !== options.height) fail('标准化后的图片尺寸不符合要求');
  console.log(JSON.stringify({
    success: true,
    input,
    output,
    width: result.width,
    height: result.height,
    aspectRatio: result.width / result.height,
    format: result.format,
    hasAlpha: Boolean(result.hasAlpha),
    textAdded: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  usage();
  process.exit(1);
});
