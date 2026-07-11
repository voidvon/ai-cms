import { createAiAgent } from '../runtime.mjs';
import {
  createImageGenerationHostedTool,
  createPreviousGeneratedImageEditTool,
  createUploadedImagesEditTool,
} from '../image-generation.mjs';
import { capabilityRegistry } from '../core/capability-registry.mjs';

/**
 * 通用对话能力
 * 支持多轮对话、栏目内容查询、价格查询的后台助手
 */
export const generalChatCapability = {
  key: 'general_chat',
  label: '通用对话',
  description: '支持多轮对话、栏目内容查询、价格查询和公开网页读取的 AI 助手',
  icon: '💬',
  category: 'general',
  visibleToolNames: ['query_columns', 'query_content_items', 'get_content_item_translation', 'update_content_item_translation_title', 'set_content_item_image_from_latest_generation', 'get_topic_profile_translation', 'update_topic_profile_translation', 'price_lookup', 'fetch_url'],

  // 匹配器：作为 fallback 能力，优先级最低
  matcher: {
    priority: -1, // fallback
    keywords: [],
  },

  // 创建 Agent
  createAgent: ({ tools, instructions, latestGeneratedImage, uploadedImageContext, message }) => {
    const previousImageTool = createPreviousGeneratedImageEditTool(latestGeneratedImage, { prompt: message });
    const uploadedImagesTool = createUploadedImagesEditTool(uploadedImageContext, { prompt: message });
    return createAiAgent({
      name: 'General AI Assistant',
      instructions:
        instructions ||
        [
          '你是后台里的 AI 助手，当前主要职责是查询栏目内容、价格信息，并读取用户给出的公开网页。',
          '你可以回答一般问题，但涉及系统数据时只围绕栏目、内容和价格三个方向工作。',
          '当用户询问站内内容时，优先调用 query_columns 和 query_content_items 工具查询栏目与内容。',
          '当用户 @信息 引用了内容项时，系统会提供该内容项的主表字段、默认语言详情和内容模型字段定义。',
          '如果用户询问非默认语言内容或多语言对比，调用 get_content_item_translation 读取指定语言详情。',
          '如果用户明确要求修改某个内容项某个语言版本的标题，调用 update_content_item_translation_title；语言必须来自数据库语言配置，无法确定时先追问。',
          '如果用户明确要求把本次会话最近生成的图片放到 @信息 引用的产品或内容项图片中，调用 set_content_item_image_from_latest_generation；不要只回复无法操作。',
          '当用户 @专题 时，可以读取和修改指定语言的专题配置；写入前必须确定专题栏目 ID、目标语言和明确的新值。',
          '如果用户提到价格，可以使用 price_lookup 工具获取报价。',
          '如果用户提供公开 http/https 网址并要求查看、总结或提取信息，使用 fetch_url 工具读取网页。',
          '如果用户请求联系方式、分类列表、新闻文章或其他未接入工具的数据，要明确说明当前入口暂不支持。',
          '保持友好、专业的语气，给出简洁明了的回复。',
        ].join('\n'),
      tools: [
        ...(tools || []),
        ...(uploadedImagesTool ? [uploadedImagesTool] : []),
        ...(previousImageTool ? [previousImageTool] : []),
        createImageGenerationHostedTool(),
      ],
    });
  },

  // 工具是否调用由 Agent 决定；这里仅声明本能力允许使用的工具，实际可用性由工具注册表按权限和数据源过滤。
  selectTools: () => generalChatCapability.visibleToolNames,

  // 增强上下文
  enhanceContext: (context) => {
    return {
      ...context,
      metadata: {
        capability: 'general_chat',
        timestamp: new Date().toISOString(),
      },
    };
  },

  // 构建动态指令
  buildInstructions: (context) => {
    const parts = [
      '你是后台里的 AI 助手，当前主要职责是查询栏目内容、价格信息，并读取用户给出的公开网页。',
    ];

    // 根据用户权限调整指令
    if (context.user?.role === 'admin') {
      parts.push('你拥有管理员权限，可以访问所有数据。');
    }

    // 根据业务数据调整指令
    if (context.businessData) {
      if (context.businessData.itemCount > 0) {
        parts.push(`系统中当前可查询到 ${context.businessData.itemCount} 条相关内容。`);
      }
    }

    if (Array.isArray(context.mentions) && context.mentions.length > 0) {
      const mentionSummary = context.mentions
        .slice(0, 5)
        .map((item) => {
          const suffix = item.type === 'column'
            ? '栏目'
            : item.type === 'topic'
              ? `专题${item.language_code ? `，语言 ${item.language_code}` : ''}`
              : `${item.column_name ? `，所属栏目 ${item.column_name}` : ''}${item.code ? `，编号 ${item.code}` : ''}`;
          return `${item.title}（${item.type}${suffix}）`;
        })
        .join('；');
      parts.push(`用户本轮明确引用了这些站内实体：${mentionSummary}。请优先围绕这些真实数据回答。`);
    }

    if (context.mentionContext?.content_items?.length > 0) {
      const contentContext = JSON.stringify(context.mentionContext.content_items, null, 2);
      parts.push([
        '系统已读取用户 @信息 引用内容项的详情上下文，包含主表字段、当前/默认语言翻译、内容模型字段定义和栏目路径信息。',
        '回答“详情内容是什么、正文是什么、字段是什么”时，优先基于下面的真实详情上下文。',
        '默认没有加载其他语言全文；如果用户询问其他语言或多语言对比，请调用 get_content_item_translation 读取对应语言。',
        '如果用户明确要求修改标题，且能从上下文确定内容模型、内容 ID、目标语言和新标题，可调用 update_content_item_translation_title。',
        `@信息详情上下文：\n${contentContext}`,
      ].join('\n'));
    }

    if (context.mentionContext?.topic_profiles?.length > 0) {
      const topicContext = JSON.stringify(context.mentionContext.topic_profiles, null, 2);
      parts.push([
        '系统已读取用户 @专题 引用的专题配置，包含专题栏目、语言、SEO 标题、关键词、简介和关联内容。',
        '回答时优先依据下面的真实专题数据，不要把专题当成普通栏目，也不要猜测未提供的信息。',
        '如果用户询问其他语言或要求多语言对比，调用 get_topic_profile_translation。',
        '如果用户明确要求修改某个语言版本，调用 update_topic_profile_translation；只传需要修改的字段。目标语言不明确时先追问，不要默认同时修改所有语言。',
        `@专题详情上下文：\n${topicContext}`,
      ].join('\n'));
    }

    if (Array.isArray(context.webPages) && context.webPages.length > 0) {
      const webPageContext = context.webPages
        .map((page, index) => formatWebPageContext(page, index + 1))
        .filter(Boolean)
        .join('\n\n');
      if (webPageContext) {
        parts.push([
          '用户本轮提供的网址已由系统预读取，下面是网页材料。回答时优先基于这些材料，不要再声称无法访问该网址。',
          webPageContext,
        ].join('\n'));
      }
    }

    if (context.latestGeneratedImage?.asset_id) {
      parts.push([
        '会话中有一张可按需编辑的最近生成图片，但当前尚未把图片内容发送给模型。',
        '请根据用户本轮意图自行判断：若用户要求修改、延续或重绘上一张图片，调用 edit_previous_generated_image；该工具会加载并编辑图片，不要再调用 image_generation 重复生成。',
        '若用户在普通问答或要求生成一张无关的新图片，不要调用 edit_previous_generated_image。不要仅凭固定关键词判断，要结合本轮表达和对话语境。',
      ].join('\n'));
    }

    if (context.uploadedImageContext?.images?.length > 0) {
      parts.push([
        `用户本轮上传了 ${context.uploadedImageContext.images.length} 张图片，当前只提供了轻量附件信息，尚未把图片内容发送给模型。`,
        '请结合用户本轮描述自行判断：若用户要求修改、组合、重绘或转换这些上传图片，调用 edit_uploaded_images；该工具会一次加载本轮全部图片并执行编辑，不要再调用 image_generation 重复生成。',
        '若用户的问题与上传图片编辑无关，不要调用 edit_uploaded_images。',
      ].join('\n'));
    }

    // 根据对话历史调整指令
    if (context.conversationHistory?.topics) {
      const topics = context.conversationHistory.topics;
      if (topics.includes('产品')) {
        parts.push('用户最近在讨论产品相关话题，优先先识别相关栏目，再用 query_content_items 查询栏目下的内容。');
      }
      if (topics.includes('价格')) {
        parts.push('用户最近在讨论价格相关话题，可以使用 price_lookup 工具提供报价。');
      }
    }

    parts.push('当用户提供公开网址并要求查看网页内容时，优先使用 fetch_url；不要声称已浏览未通过工具读取的网址。');
    parts.push('当用户明确要求生成图片时，调用 image_generation 工具；普通问答不要调用该工具。');
    parts.push('当用户明确要求把最近生成的图片放到 @信息 引用的产品/内容项图片中时，调用 set_content_item_image_from_latest_generation；目标实体以结构化 @引用为准。');
    parts.push('当用户询问被 @信息 引用的内容详情时，不要只根据标题或摘要猜测；优先使用已提供的详情上下文。');
    parts.push('专题是按栏目 ID 和语言分别存储的。读取其他语言使用 get_topic_profile_translation；明确修改专题时使用 update_topic_profile_translation，禁止跨语言批量覆盖。');
    parts.push('当用户要求修改内容时，只能在用户明确表达修改意图时调用写入工具；目标语言必须匹配数据库语言 code/name/native_name，无法确定语言或新标题时先追问。');
    parts.push('当前入口以栏目、内容、价格和公开网页读取为主，不提供联系方式等其他未接入工具。');
    parts.push('保持友好、专业的语气，给出简洁明了的回复。');

    return parts.join('\n');
  },

  // 可用性检查
  isAvailable: (context) => {
    // 通用对话能力始终可用
    return true;
  },
};

function formatWebPageContext(page, index) {
  if (page?.error) {
    return `网页 ${index}: ${page.url}\n读取失败: ${page.error}`;
  }

  const parts = [
    `网页 ${index}: ${page.final_url || page.url}`,
    page.title ? `标题: ${page.title}` : '',
    page.description ? `描述: ${page.description}` : '',
    page.text ? `正文摘录: ${String(page.text).slice(0, 5000)}` : '',
  ].filter(Boolean);

  return parts.join('\n');
}

/**
 * 注册通用对话能力
 */
export function registerGeneralChatCapability() {
  capabilityRegistry.register(generalChatCapability);
}
