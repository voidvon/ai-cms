#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MODES = new Set(['catalog-redraw', 'background-only', 'transparent-cutout', 'industrial-scene']);

function usage() {
  console.log(`用法:
  node build-prompt.mjs --source <源图> --product-id <ID>
       --product-name <英文名称> --product-code <型号>
       [--mode catalog-redraw|background-only|transparent-cutout|industrial-scene]
       [--background <英文背景描述>] [--invariant <英文约束> ...]
       --out <提示词文件>`);
}

function fail(message) {
  throw new Error(message);
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail(`${flag} 缺少参数值`);
  return value;
}

function parseArgs(argv) {
  const output = {
    source: '',
    productId: null,
    productName: '',
    productCode: '',
    mode: 'catalog-redraw',
    background: '',
    invariants: [],
    out: '',
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') output.help = true;
    else if (token === '--source') output.source = valueAfter(argv, index++, token);
    else if (token === '--product-id') output.productId = Number.parseInt(valueAfter(argv, index++, token), 10);
    else if (token === '--product-name') output.productName = valueAfter(argv, index++, token);
    else if (token === '--product-code') output.productCode = valueAfter(argv, index++, token);
    else if (token === '--mode') output.mode = valueAfter(argv, index++, token);
    else if (token === '--background') output.background = valueAfter(argv, index++, token);
    else if (token === '--invariant') output.invariants.push(valueAfter(argv, index++, token));
    else if (token === '--out') output.out = valueAfter(argv, index++, token);
    else fail(`未知参数: ${token}`);
  }
  if (!output.help) {
    if (!output.source) fail('必须提供 --source');
    if (!Number.isInteger(output.productId) || output.productId <= 0) fail('--product-id 必须是正整数');
    if (!output.productName) fail('必须提供 --product-name');
    if (!output.productCode) fail('必须提供 --product-code');
    if (!MODES.has(output.mode)) fail(`不支持的模式: ${output.mode}`);
    if (!output.out) fail('必须提供 --out');
  }
  return output;
}

function modeSpec(options) {
  if (options.mode === 'background-only') {
    return {
      useCase: 'precise-object-edit',
      assetType: '16:10 landscape website product preview, background replacement only',
      request: 'Convert Image 1 into a 16:10 landscape website product preview and change only the background. Keep the product pixels, edges, orientation, lighting, surface texture, labels, and all visible geometry unchanged.',
      backdrop: options.background || 'clean neutral white background with even tone',
      composition: 'Use a 16:10 landscape canvas targeting 1600x1000. Keep the exact original camera angle, crop direction, product scale, and orientation; center the complete product with clean padding and no clipping.',
      lighting: 'Preserve the original product lighting; do not relight or restyle the product.'
    };
  }
  if (options.mode === 'transparent-cutout') {
    return {
      useCase: 'background-extraction',
      assetType: '16:10 landscape transparent website product preview',
      request: 'Convert Image 1 into a 16:10 landscape transparent website product preview and isolate the exact product without redesigning or redrawing any part of it.',
      backdrop: options.background || 'perfectly flat solid #00ff00 chroma-key background for local background removal, with no shadow, gradient, texture, reflection, or floor plane',
      composition: 'Use a 16:10 landscape canvas targeting 1600x1000. Keep the exact original camera angle and orientation; preserve the complete centered product with generous even padding and crisp edges.',
      lighting: 'Preserve the original product lighting and material appearance.'
    };
  }
  if (options.mode === 'industrial-scene') {
    return {
      useCase: 'compositing',
      assetType: '16:10 landscape website product gallery application scene',
      request: 'Convert Image 1 into a 16:10 landscape website product preview by compositing the exact visible product into a realistic industrial steam-system environment while keeping the product itself visually unchanged.',
      backdrop: options.background || 'credible clean industrial steam plant environment, softly out of focus and not presented as an installation diagram',
      composition: 'Use a 16:10 landscape canvas targeting 1600x1000. Keep the product at the same visible camera angle; make it the clear foreground subject without generating hidden sides or unverified connections.',
      lighting: 'Match the surrounding light conservatively without changing the product materials, colors, markings, or geometry.'
    };
  }
  return {
    useCase: 'precise-object-edit',
    assetType: '16:10 landscape website product preview and CMS primary-image candidate',
    request: 'Convert Image 1 into a 16:10 landscape website product preview. Redraw it as a clean high-fidelity industrial catalog photograph while treating the input image as the sole visual source of truth for the product.',
    backdrop: options.background || 'pure clean white catalog background, evenly lit, with no visible horizon or decorative elements',
    composition: 'Use a 16:10 landscape canvas targeting 1600x1000. Keep the exact original camera angle, orientation, visible faces, and product proportions; center the complete product with balanced safe padding and no clipping.',
    lighting: 'Neutral soft studio lighting with natural contrast; preserve the original material, finish, colors, and readable markings.'
  };
}

function buildPrompt(options) {
  const spec = modeSpec(options);
  const invariants = [
    'Use Image 1 as the edit target and sole visual source of truth for the product.',
    'Preserve the exact silhouette, proportions, visible component count, component positions, ports, flanges, threads, fasteners, actuators, displays, cables, materials, surface finish, and colors.',
    'Preserve every visible logo, nameplate, label, and model marking exactly. If text is not legible in Image 1, keep it visually unresolved and do not invent readable text.',
    'Do not add any headline, subtitle, marketing copy, selling point, specification, badge, button, border, watermark, or decorative text anywhere in the image. Preserve only text already visible on the physical product.',
    'Do not reveal, infer, or generate hidden product faces or components.',
    ...options.invariants.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean)
  ];
  const avoid = [
    'no extra or missing parts, no altered connections, no changed viewing angle',
    'no added copy, headline, subtitle, selling point, specification, badge, button, border, invented text, certification mark, arrow, dimension, diagram, or watermark',
    'no brand redesign, no color substitution, no stylization, no CGI exaggeration',
    options.mode === 'industrial-scene'
      ? 'no unverified pipe connections and no claim of installation compliance'
      : 'no props, no scene objects, no dramatic shadow, no reflection, no caption'
  ];
  const prompt = [
    '--- IMAGE MODEL PROMPT ---',
    `Use case: ${spec.useCase}`,
    `Asset type: ${spec.assetType}`,
    `Primary request: ${spec.request}`,
    `Input images: Image 1: edit target and sole visual source of truth for the product.`,
    `Product reference: CMS product ID ${options.productId}; verified name "${options.productName}"; verified model/code "${options.productCode}". These identifiers are task metadata only: do not render them as captions or added text, and do not use them to invent unseen appearance.`,
    `Scene/backdrop: ${spec.backdrop}`,
    `Subject: the exact product visible in Image 1, not a generic or same-series substitute`,
    `Composition/framing: ${spec.composition}`,
    `Lighting/mood: ${spec.lighting}`,
    `Constraints: ${invariants.join(' ')}`,
    `Avoid: ${avoid.join('; ')}.`,
    '--- END IMAGE MODEL PROMPT ---',
    '',
    '中文摘要：',
    `对产品 ID ${options.productId}（${options.productName}，${options.productCode}）执行 ${options.mode}，输出 16:10 的网站产品预览图。以源图为唯一外观真值，保持产品结构、比例、接口、部件、材质、颜色、铭牌、品牌和型号不变；不在图片上新增任何文案，只完成该模式允许的背景、画布、光照或场景处理。`,
    '',
    '任务元数据：',
    `源图：${options.source}`,
    `产品 ID：${options.productId}`,
    `模式：${options.mode}`,
    ''
  ].join('\n');
  return prompt;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exit(0);
  }
  const source = path.resolve(process.cwd(), options.source);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) fail(`源图不存在: ${source}`);
  options.source = source;
  const output = path.resolve(process.cwd(), options.out);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, buildPrompt(options), 'utf8');
  console.log(JSON.stringify({
    success: true,
    source,
    output,
    productId: options.productId,
    productCode: options.productCode,
    mode: options.mode,
    invariants: options.invariants.length
  }, null, 2));
} catch (error) {
  console.error(error.message || error);
  usage();
  process.exit(1);
}
