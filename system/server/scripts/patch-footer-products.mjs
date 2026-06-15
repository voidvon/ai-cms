#!/usr/bin/env node
/**
 * 临时补丁：在footer产品section添加缺失的3个产品分类链接
 * 原因：模板渲染只显示8个，但应该显示11个
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 从脚本位置找到项目根目录（向上3级：scripts -> server -> system -> root）
const projectRoot = path.resolve(__dirname, '../../..');
const htmlFile = path.join(projectRoot, 'html/index.html');

if (!fs.existsSync(htmlFile)) {
  console.error('❌ html/index.html 不存在');
  process.exit(1);
}

let html = fs.readFileSync(htmlFile, 'utf-8');

// 查找产品section的</ul>标签
const pattern = /<h2[^>]*>产品<\/h2>.*?<ul[^>]*>(.*?)<\/ul>/s;
const match = html.match(pattern);

if (!match) {
  console.error('❌ 未找到产品section');
  process.exit(1);
}

// 检查是否已经有11个链接
const existingLinks = (match[1].match(/<li/g) || []).length;

if (existingLinks >= 11) {
  console.log('✅ Footer产品已有11个链接');
  process.exit(0);
}

// 添加缺失的3个产品分类
const additionalItems = `
          <li class="sg-site-footer__item"><a class="sg-site-footer__link" href="/products/isolation-valves/">关断阀</a></li>
          <li class="sg-site-footer__item"><a class="sg-site-footer__link" href="/products/pipeline-ancillaries/">管道附件</a></li>
          <li class="sg-site-footer__item"><a class="sg-site-footer__link" href="/products/steam-traps/">蒸汽疏水阀</a></li>`;

// 在</ul>之前插入
html = html.replace(
  /(<h2[^>]*>产品<\/h2>.*?<ul[^>]*>.*?)(<\/ul>)/s,
  `$1${additionalItems}\n        $2`
);

fs.writeFileSync(htmlFile, html, 'utf-8');
console.log('✅ Footer产品已补全至11个链接');
