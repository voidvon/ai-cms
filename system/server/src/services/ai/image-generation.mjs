import fs from 'node:fs';
import { tool } from '@openai/agents';
import { imageGenerationTool } from '@openai/agents-openai';
import { z } from 'zod';
import { uploadMediaAsset } from '../media-assets.mjs';
import { getMediaAssetById } from '../media-assets.mjs';
import { listAiConversationMessages } from './conversations.mjs';
import { getAiRuntimeConfig, getOpenAIClient } from './runtime.mjs';
import { normalizeText } from './shared.mjs';

export function createImageGenerationHostedTool() {
  const imageModel = normalizeText(getAiRuntimeConfig()?.image_model);
  return imageGenerationTool({
    ...(imageModel ? { model: imageModel } : {}),
  });
}

export function createPreviousGeneratedImageEditTool(imageContext, { prompt } = {}) {
  if (!imageContext?.asset_id) {
    return null;
  }
  if (!Array.isArray(imageContext.generated_images)) {
    imageContext.generated_images = [];
  }

  return tool({
    name: 'edit_previous_generated_image',
    description: '仅当用户要求修改、延续或重绘上一张生成图片时调用。该工具会按用户本轮要求编辑最近生成的图片；普通问答或生成无关的新图片时不要调用。',
    parameters: z.object({}),
    strict: true,
    async execute() {
      const runtimeConfig = getAiRuntimeConfig();
      const sourceImage = readGeneratedImageAsDataUrl(imageContext.asset_id);
      if (!sourceImage) {
        return { type: 'text', text: '上一张生成图片已不存在，无法继续编辑。' };
      }

      const response = await getOpenAIClient().responses.create({
        model: runtimeConfig.model,
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `请按照以下要求编辑输入图片，只修改用户明确要求改变的部分，并尽量保持其他主体、构图和风格不变：\n${normalizeText(prompt)}`,
            },
            { type: 'input_image', image_url: sourceImage, detail: 'high' },
          ],
        }],
        tools: [{ type: 'image_generation', action: 'edit' }],
        tool_choice: { type: 'image_generation' },
        store: false,
      });
      const imageOutput = response.output?.find((item) => item?.type === 'image_generation_call' && item.result);
      if (!imageOutput?.result) {
        return { type: 'text', text: '图片编辑服务没有返回新的图片。' };
      }

      const generatedImage = await saveGeneratedImageBase64(imageOutput.result, prompt);
      imageContext.generated_images.push(generatedImage);
      return {
        type: 'image',
        image: `data:image/png;base64,${normalizeBase64Image(imageOutput.result)}`,
        detail: 'high',
      };
    },
  });
}

export function createUploadedImagesEditTool(uploadContext, { prompt } = {}) {
  if (!Array.isArray(uploadContext?.images) || uploadContext.images.length === 0) {
    return null;
  }

  return tool({
    name: 'edit_uploaded_images',
    description: '当用户要求根据本轮上传的一张或多张图片进行修改、组合、重绘或风格变换时调用。该工具会同时读取本轮全部上传图片；普通问答或生成无关新图片时不要调用。',
    parameters: z.object({}),
    strict: true,
    async execute() {
      const runtimeConfig = getAiRuntimeConfig();
      const sourceImages = uploadContext.images
        .map((image) => readGeneratedImageAsDataUrl(image.asset_id))
        .filter(Boolean);
      if (sourceImages.length === 0) {
        return { type: 'text', text: '本轮上传的图片已不存在，无法进行编辑。' };
      }

      const response = await getOpenAIClient().responses.create({
        model: runtimeConfig.model,
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `请使用本轮提供的 ${sourceImages.length} 张输入图片，按照用户要求进行编辑或组合，并尽量保留未被要求改变的内容：\n${normalizeText(prompt)}`,
            },
            ...sourceImages.map((imageUrl) => ({
              type: 'input_image',
              image_url: imageUrl,
              detail: 'high',
            })),
          ],
        }],
        tools: [{ type: 'image_generation', action: 'edit' }],
        tool_choice: { type: 'image_generation' },
        store: false,
      });
      const imageOutput = response.output?.find((item) => item?.type === 'image_generation_call' && item.result);
      if (!imageOutput?.result) {
        return { type: 'text', text: '图片编辑服务没有返回新的图片。' };
      }

      const generatedImage = await saveGeneratedImageBase64(imageOutput.result, prompt);
      uploadContext.generated_images.push(generatedImage);
      return {
        type: 'image',
        image: `data:image/png;base64,${normalizeBase64Image(imageOutput.result)}`,
        detail: 'high',
      };
    },
  });
}

export function loadUploadedImageContext(inputImages) {
  const images = [];
  const seen = new Set();
  for (const input of Array.isArray(inputImages) ? inputImages.slice(0, 8) : []) {
    const assetId = Number.parseInt(String(input?.asset_id || input?.id || ''), 10);
    if (!Number.isFinite(assetId) || assetId <= 0 || seen.has(assetId)) {
      continue;
    }
    const asset = getMediaAssetById(assetId);
    if (!asset?.file_exists || asset.purpose !== 'ai_input_image') {
      continue;
    }
    seen.add(assetId);
    images.push({
      asset_id: asset.id,
      relative_path: asset.relative_path,
      public_url: asset.public_url,
      mime_type: asset.mime_type,
      alt: normalizeText(input?.alt) || normalizeText(asset.original_name) || '用户上传图片',
    });
  }
  return images.length > 0 ? { images, generated_images: [] } : null;
}

export function loadLatestGeneratedImageContext(conversationId, { user } = {}) {
  const messages = listAiConversationMessages(conversationId, { user, limit: 20 })
    .filter((message) => message.role === 'user' || message.role === 'assistant');
  const latestAssistantMessage = findLatestUsableImageMessage(messages);
  const latestImage = Array.isArray(latestAssistantMessage?.content?.images)
    ? latestAssistantMessage.content.images.at(-1)
    : null;
  if (!latestImage?.asset_id) {
    return null;
  }

  const asset = getMediaAssetById(latestImage.asset_id);
  if (!asset?.file_exists || !asset.fs_path) {
    return null;
  }
  return {
    asset_id: asset.id,
    relative_path: asset.relative_path,
    generated_images: [],
  };
}

function findLatestUsableImageMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') {
      continue;
    }
    if (Array.isArray(message.content?.images) && message.content.images.length > 0) {
      return message;
    }
  }
  return null;
}

export async function saveGeneratedImagesFromAgentResult(result, { prompt } = {}) {
  const outputs = Array.isArray(result?.rawResponses)
    ? result.rawResponses.flatMap((response) => Array.isArray(response?.output) ? response.output : [])
    : [];
  const base64Images = Array.from(new Set(
    outputs
      .filter((item) => item?.type === 'hosted_tool_call' && item.name === 'image_generation_call')
      .map((item) => normalizeBase64Image(item.output))
      .filter(Boolean),
  ));
  const images = [];

  for (const imageBase64 of base64Images) {
    images.push(await saveGeneratedImageBase64(imageBase64, prompt));
  }

  return images;
}

async function saveGeneratedImageBase64(value, prompt) {
  const buffer = Buffer.from(normalizeBase64Image(value), 'base64');
  if (buffer.length === 0) {
    throw new Error('图片服务返回了空图片');
  }
  const asset = await uploadMediaAsset({
    buffer,
    originalFilename: `ai-generated-${Date.now()}.png`,
    purpose: 'ai_generated_image',
  });
  return {
    asset_id: asset.id,
    relative_path: asset.relative_path,
    public_url: asset.public_url,
    mime_type: asset.mime_type,
    alt: normalizeText(prompt) || 'AI 生成图片',
  };
}

function normalizeBase64Image(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }
  return normalized.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
}

function normalizeImageMimeType(mimeType, extension) {
  const normalizedMimeType = normalizeText(mimeType).split(';')[0].toLowerCase();
  if (/^image\/(?:jpeg|png|webp|gif)$/.test(normalizedMimeType)) {
    return normalizedMimeType;
  }
  return String(extension || '').toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}

function readGeneratedImageAsDataUrl(assetId) {
  const asset = getMediaAssetById(assetId);
  if (!asset?.file_exists || !asset.fs_path) {
    return '';
  }
  const buffer = fs.readFileSync(asset.fs_path);
  if (buffer.length === 0) {
    return '';
  }
  const mimeType = normalizeImageMimeType(asset.mime_type, asset.file_ext);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
