import fs from 'node:fs';
import path from 'node:path';
import { createManualColumn, listColumns, updateManualColumn } from '../src/services/columns.mjs';
import { getDefaultLanguage } from '../src/services/languages.mjs';

const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';

const sourceDocsRoot = path.join(sourceRoot, 'docs', 'zh-cn');
const sourceDistRoot = path.join(sourceRoot, 'dist', 'zh-cn');
const outputRoot = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), '../../..', 'html'));
const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
const joinHtml = (lines) => lines.join('\n');

const singlePages = [
  {
    slug: 'digital-services',
    routePath: '/digital-services/',
    sourceFile: path.join(sourceDocsRoot, 'digital-services.mdx')
  },
  {
    slug: 'product-compliance',
    routePath: '/product-compliance/',
    sourceFile: path.join(sourceDocsRoot, 'product-compliance', 'index.mdx')
  },
  {
    slug: 'sustainability',
    routePath: '/sustainability/',
    sourceFile: null,
    pageData: {
      title: '可持续发展',
      summary: '可持续发展',
      items: [
        {
          title: '能源管理服务',
          description: '数据驱动的能源咨询、监测与减碳规划服务。',
          href: '/sustainability/energy-management-services/'
        }
      ]
    }
  },
  {
    slug: 'energy-management-services',
    routePath: '/sustainability/energy-management-services/',
    parentRoutePath: '/sustainability/',
    sourceFile: path.join(sourceDocsRoot, 'sustainability', 'energy-management-services', 'index.mdx')
  },
  {
    slug: 'promo',
    routePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'index.mdx')
  },
  {
    slug: 'benefits-of-steam',
    routePath: '/promo/benefits-of-steam/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'benefits-of-steam', 'index.mdx')
  },
  {
    slug: 'best-in-class-steam-trap-monitoring',
    routePath: '/promo/best-in-class-steam-trap-monitoring/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'best-in-class-steam-trap-monitoring', 'index.mdx')
  },
  {
    slug: 'condensate-contamination-detection',
    routePath: '/promo/condensate-contamination-detection/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'condensate-contamination-detection', 'index.mdx')
  },
  {
    slug: 'diagnostic-kits',
    routePath: '/promo/diagnostic-kits/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'diagnostic-kits', 'index.mdx')
  },
  {
    slug: 'easiheat-insights',
    routePath: '/promo/easiheat-insights/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'easiheat-insights', 'index.mdx')
  },
  {
    slug: 'flowmetering-solutions',
    routePath: '/promo/flowmetering-solutions/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'flowmetering-solutions', 'index.mdx')
  },
  {
    slug: 'key-energy-saving-tips',
    routePath: '/promo/key-energy-saving-tips/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'key-energy-saving-tips', 'index.mdx')
  },
  {
    slug: 'sustainable-food-and-beverage-steam-systems',
    routePath: '/promo/sustainable-food-and-beverage-steam-systems/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'sustainable-food-and-beverage-steam-systems', 'index.mdx')
  },
  {
    slug: 'sustainable-steam-symposium',
    routePath: '/promo/sustainable-steam-symposium/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'sustainable-steam-symposium', 'index.mdx')
  },
  {
    slug: 'the-digitalisation-dilemma',
    routePath: '/promo/the-digitalisation-dilemma/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'the-digitalisation-dilemma', 'index.mdx')
  },
  {
    slug: 'wireless-steam-trap-monitoring',
    routePath: '/promo/wireless-steam-trap-monitoring/',
    parentRoutePath: '/promo/',
    sourceFile: path.join(sourceDocsRoot, 'promo', 'wireless-steam-trap-monitoring', 'index.mdx')
  }
];

const localizationOverrides = {
  'digital-services': {
    title: '用数字化服务优化蒸汽系统',
    seoTitle: '蒸汽系统数字化服务：降低成本与排放',
    seoDescription: '通过斯派莎克数字化服务提升蒸汽系统效率、可持续性与运行表现，降低成本并减少故障风险。',
    pageData: {
      title: '用数字化服务优化蒸汽系统'
    },
    bodyHtml: joinHtml([
      '<section class="imported-content-section">',
      '<h2>加速做出正确决策</h2>',
      '<p>工业现场对实时数据的要求越来越高。借助数字化监测与分析能力，企业可以更快识别问题、评估风险，并以数据驱动的方式采取行动。</p>',
      '<p>蒸汽系统的未来，不只是看见过去发生了什么，而是通过持续洞察预测下一步该怎么做，并把专业经验转化为更稳健的现场决策。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>CONNECT 平台驱动数字化服务</h2>',
      '<p>我们的数字化解决方案和服务通过 CONNECT 平台交付，为客户提供安全、可扩展、模块化的 IIoT 能力。</p>',
      '<p>该平台可帮助您获取实时运行数据、效率洞察、预测分析和可持续性指标，从而提升生产率、优化性能、减少停机，并支持关键工艺实现卓越运营。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>释放蒸汽系统的数据价值</h2>',
      '<p>斯派莎克利用互联设备与蒸汽系统专业知识，把热能过程数据转化为可以立即执行的改进措施，帮助企业兼顾效率、表现与可持续性。</p>',
      '<p>依托全球蒸汽专家网络，我们正在推动蒸汽与热能工业效率的创新发展。从诊断问题，到预测故障，再到给出更具针对性的改进建议，数字化能力正在不断升级。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>我们可以帮助您实现什么</h2>',
      '<ul>',
      '<li>在需要时提供蒸汽专业支持，帮助工厂稳定运行并控制预算。</li>',
      '<li>围绕企业目标制定更可执行的改进路径，支持优化、管理与减碳转型。</li>',
      '<li>以更系统的方式推动可持续发展，让现场改善与长期目标保持一致。</li>',
      '</ul>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>数字化服务组合</h2>',
      '<ul>',
      '<li><a href="/sustainability/energy-management-services/">能源管理服务</a>：把现有数据转化为行动建议，从监测到碳减排规划，帮助企业稳步推进节能与减排。</li>',
      '<li><a href="/promo/diagnostic-kits/">蒸汽洞察服务</a>：通过对蒸汽和冷凝水回路的关键部件进行持续监测，识别常见问题并输出专业改进建议。</li>',
      '<li><a href="/promo/easiheat-insights/">EasiHeat Insights</a>：提升热水系统的可视化、可靠性和维护效率，减少突发停机。</li>',
      '<li>蒸汽疏水阀服务：帮助关键设备保持良好状态，兼顾能效、产线表现与可持续发展目标。</li>',
      '<li><a href="/promo/condensate-contamination-detection/">冷凝水污染检测</a>：更早识别污染源，保护锅炉与关键蒸汽资产。</li>',
      '</ul>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>精准洞察正在创造价值</h2>',
      '<p>最新的智能传感器已经在现场证明其价值。例如，某大型乳制品生产商通过监测冷凝水回水线和锅炉给水线，发现关键温度长期偏离最佳区间。</p>',
      '<p>基于这些数据，斯派莎克建议优化冷凝水回收网络并提升给水箱储存温度，从而提高锅炉效率、降低燃料消耗和排放，同时减少维护巡检压力。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>为什么选择数字化蒸汽服务</h2>',
      '<ul>',
      '<li>数字化蒸汽系统专长</li>',
      '<li>远程蒸汽团队支持</li>',
      '<li>更强的可持续发展影响力</li>',
      '<li>预测性智能分析</li>',
      '<li>持续的性能洞察</li>',
      '</ul>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>延伸阅读</h2>',
      '<ul>',
      '<li><a href="/promo/the-digitalisation-dilemma/">数字化两难：本地部署还是云端系统？</a></li>',
      '<li><a href="/promo/best-in-class-steam-trap-monitoring/">行业领先的蒸汽疏水阀监测</a></li>',
      '<li><a href="/promo/wireless-steam-trap-monitoring/">蒸汽疏水阀无线监测</a></li>',
      '</ul>',
      '</section>'
    ])
  },
  'benefits-of-steam': {
    seoTitle: '蒸汽优势 | Spirax Sarco 中国',
    seoDescription: '了解蒸汽为何能够高效满足工艺需求，并联系本地蒸汽专家获取更多建议。'
  },
  'best-in-class-steam-trap-monitoring': {
    title: '行业领先的蒸汽疏水阀监测',
    seoTitle: '行业领先的蒸汽疏水阀监测 | Spirax Sarco',
    seoDescription: '了解更智能的蒸汽疏水阀监测方式，减少停机和能量损失，简化日常维护。',
    pageData: {
      title: '行业领先的蒸汽疏水阀监测'
    },
    bodyHtml: joinHtml([
      '<section class="imported-content-section">',
      '<h2>为什么蒸汽疏水阀如此关键</h2>',
      '<p>在任何蒸汽系统中，蒸汽疏水阀都承担着至关重要的任务：排出冷凝水和不凝性气体，同时阻止新鲜蒸汽泄漏。</p>',
      '<p>凭借超过 200 年的发展历史，蒸汽疏水阀始终是保障热工艺效率和可持续性的核心部件。如今，它的重要性只增不减。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>传统维护方式的局限</h2>',
      '<p>任何负责蒸汽系统的人都知道蒸汽疏水阀性能的重要性。疏水阀失效会造成计划外停机、能源成本上升等一系列问题。</p>',
      '<p>对重视可持续发展与盈利能力的企业来说，定期进行蒸汽疏水阀检测和审计是成熟做法。检测频率通常取决于系统运行压力。</p>',
      '<ul>',
      '<li>高压（150 psig 及以上）：每周至每月</li>',
      '<li>中压（30 至 150 psig）：每月至每季度</li>',
      '<li>低压（30 psig 以下）：每年</li>',
      '</ul>',
      '<p>这些频率属于建议值，并非强制标准。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>为什么需要更智能的监测</h2>',
      '<p>蒸汽疏水阀迟早会发生故障，可能常开，也可能常闭。统计数据有所差异，但这一点始终明确无误。</p>',
      '<p>相比仅依赖人工巡检，更智能的无线蒸汽疏水阀监测能够帮助您持续掌握设备状态，让维护更有针对性，降低传统监测的局限性。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>立即连接您的蒸汽系统</h2>',
      '<p>蒸汽疏水阀会一直是蒸汽系统中不可替代的一环，而管理方式可以不断进化。借助更智能的监测方案，您可以让互联疏水阀持续保持高效运行。</p>',
      '<p>通过斯派莎克，进一步优化蒸汽的产生、输送与使用。</p>',
      '</section>'
    ])
  },
  'condensate-contamination-detection': {
    title: '冷凝水污染检测（CCD）洞察',
    seoTitle: '冷凝水污染检测（CCD） | 保护蒸汽系统',
    seoDescription: '实时监测冷凝水品质，更早发现污染源，保护关键蒸汽设备并提升冷凝水回收效率。',
    pageData: {
      title: '冷凝水污染检测（CCD）洞察'
    },
    bodyHtml: joinHtml([
      '<section class="imported-content-section">',
      '<h2>为什么冷凝水监测很重要</h2>',
      '<p>许多工业蒸汽系统仍依赖人工取样、周期性检测或单点报警。这些方法往往发现污染太晚，也难以告诉您污染究竟来自哪里。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>CCD Insights：更主动的冷凝水监测</h2>',
      '<p>CCD Insights 在更接近问题发生位置的地方持续监测冷凝水品质。与传统末端检测方式相比，它能帮助工程团队更快锁定污染源，并尽早采取措施。</p>',
      '<ul>',
      '<li>连续监测电导率与温度</li>',
      '<li>阈值超限时触发可配置警报</li>',
      '<li>提供用于诊断的历史趋势数据</li>',
      '<li>与现有冷凝水保护系统协同工作，更早识别根因，减少重复事件</li>',
      '</ul>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>提升蒸汽系统可视化水平</h2>',
      '<p>CCD Insights 可帮助维护团队更早发现污染、更快找到根因，并保护锅炉及其他关键蒸汽资产。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>常见问题</h2>',
      '<p>如需了解 CCD 在您现场的适用方式，欢迎联系斯派莎克团队进一步沟通。</p>',
      '</section>'
    ])
  },
  'diagnostic-kits': {
    title: '蒸汽洞察服务',
    seoTitle: '蒸汽洞察服务 | Spirax Sarco',
    seoDescription: '通过有目的的数字化连接监测蒸汽与热能系统，识别常见问题并获得专业改进建议。',
    pageData: {
      title: '蒸汽洞察服务'
    },
    bodyHtml: joinHtml([
      '<section class="imported-content-section">',
      '<h2>有目的的数字化连接</h2>',
      '<p>这套方案把蒸汽与冷凝水回路中的关键部件连接起来，持续显示各部件的运行状态。通过一次简单连接，就能识别部件是否正常、是否失效，或验证大型蒸汽资产的效率表现。</p>',
      '<p>基于这些连接与数据，我们的蒸汽专家能够围绕具体问题给出有意义的洞察和建议。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>重点帮助您改善四个方面</h2>',
      '<ul>',
      '<li>降低能源与二氧化碳排放，明确能量损失发生在哪里以及如何减少。</li>',
      '<li>提升蒸汽系统可靠性，识别正常、故障或即将失效的部件，并指导修复。</li>',
      '<li>保护工艺产出，监测关键应用表现，减少对生产的影响。</li>',
      '<li>降低安全风险，及时发现对人员、环境和工艺不利的蒸汽系统状态。</li>',
      '</ul>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>从监测到建议</h2>',
      '<p>方案会突出潜在根因以及需要采取的改进措施，帮助企业在提升蒸汽系统表现和效率的同时，减少能量损失、碳排放和运行风险。</p>',
      '<p>斯派莎克专家会先了解您当前面对的问题，再协助完成必要连接。经过一段时间监测后，我们将评估资产健康状态，并提供带有建议的技术报告。连接设备还可以继续留在现场，用于持续监测并验证整改成效。</p>',
      '</section>'
    ])
  },
  'easiheat-insights': {
    seoTitle: 'EasiHeat Insights 助力工艺升级',
    seoDescription: '借助数字化互联的换热设备，提升热能系统可靠性、效率与可视化能力，同时降低运营成本。',
    bodyHtml: joinHtml([
      '<section class="imported-content-section">',
      '<h2>用互联 EasiHeat 释放洞察价值</h2>',
      '<p>通过近实时运行洞察，EasiHeat Insights 帮助现场保障连续供水、满足法规要求，并支持系统长期高效运行。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>提升系统在线率与可靠性</h2>',
      '<p>许多行业依赖连续热水供应支撑关键工艺，突发故障会带来高昂损失。EasiHeat Insights 能在系统失效前识别关键部件的潜在问题，帮助您降低非计划停机并延长设备寿命。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>降低风险并改善合规表现</h2>',
      '<p>水温稳定性对卫生标准至关重要，控制不当会带来包括军团菌在内的健康风险。EasiHeat Insights 会针对不安全工况发出预警，提醒团队主动干预，确保水温保持在安全范围内。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>提升性能与能效监测</h2>',
      '<p>面对上涨的能源价格和紧张的维护预算，持续优化效率尤为重要。EasiHeat Insights 可追踪运行表现并识别节能机会，帮助您在降低能耗和运营成本的同时延长系统寿命。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>准备好切换到更智能的运维方式了吗？</h2>',
      '<p>联系斯派莎克团队，了解 EasiHeat Insights 如何帮助您的现场获得更可靠、更可视化的热水系统表现。</p>',
      '</section>'
    ])
  },
  'flowmetering-solutions': {
    seoTitle: '流量计量解决方案 | Spirax Sarco 中国',
    seoDescription: '通过精确可靠的蒸汽计量，帮助工厂理解能源使用情况、降低成本并提升蒸汽系统生产力。'
  },
  'key-energy-saving-tips': {
    seoTitle: '重要节能提示 | Spirax Sarco 中国',
    seoDescription: '借助蒸汽系统专业知识，采用成熟方法降低能耗并持续提升整体能源表现。'
  },
  'sustainable-food-and-beverage-steam-systems': {
    title: '优化食品饮料热能系统',
    seoTitle: '为什么优化是食品饮料行业实现可持续运营的关键',
    seoDescription: '面对成本压力与可持续发展目标，食品饮料企业可通过蒸汽系统优化同时实现效率提升和减碳改进。',
    pageData: {
      title: '优化食品饮料热能系统'
    },
    bodyHtml: joinHtml([
      '<section class="imported-content-section">',
      '<h2>在多重压力下实现双赢</h2>',
      '<p>食品饮料行业正同时面对经济不确定性、通胀压力和可持续发展要求。对许多企业而言，提升效率、减少浪费已经成为最优先事项。</p>',
      '<p>可持续发展也是另一项核心主题。好消息是，效率提升与成本节约本身就与减碳目标高度一致。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>为什么现在就要行动</h2>',
      '<p>食品饮料行业因直接关系到消费者健康与安全而备受关注，而蒸汽正是许多食品饮料工艺中广泛使用的关键能源介质。</p>',
      '<p>越来越多客户开始要求供应商提供年度温室气体盘查或公开披露气候相关风险，因此，降低能源和水资源消耗已成为推动可持续发展的重要抓手。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>等待未来，还是先优化当下</h2>',
      '<p>把能源效率当作一次性项目，通常意味着高资本投入，却未必能形成长期连续的效率收益。相比之下，从工艺优化入手，可以更快降低能耗成本，并为未来脱碳打下基础。</p>',
      '<p>即使未来采用电蒸汽发生器、生物质、沼气或氢能等方案，当前仍然存在大量可以立即落实的蒸汽系统优化机会。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>把能源效率当作持续过程</h2>',
      '<p>另一种更有效的方式，是把能源效率当作持续改进过程，而不是一次性改造项目。通过更系统的运营投入和结构化方法，企业可以获得更持久的节能效果，并逐步建立持续改善文化。</p>',
      '<p>对于蒸汽仍将长期作为主要热能来源的应用场景，这种方式往往更适合回应可持续发展挑战。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>优化是蒸汽系统迈出的第一步</h2>',
      '<p>准确判断蒸汽系统最佳运行状态并识别改进机会，并不是大多数企业内部天然具备的能力。尤其在食品饮料行业，蒸汽应用形式多样、要求严格，更需要外部专业伙伴的支持。</p>',
      '<p>借助独立专业团队的指导与洞察，企业能够制定更贴合现场的改进策略，并更快收获可量化的成果。</p>',
      '</section>'
    ])
  },
  'sustainable-steam-symposium': {
    title: '可持续蒸汽研讨会观察',
    seoTitle: '可持续蒸汽研讨会：聚焦最新工程进展',
    seoDescription: '从高温热泵到氢氧制蒸汽，第二届可持续蒸汽研讨会集中讨论了蒸汽工程领域的最新进展。',
    pageData: {
      title: '可持续蒸汽研讨会观察'
    },
    bodyHtml: joinHtml([
      '<section class="imported-content-section">',
      '<h2>在研讨会中审视可持续蒸汽</h2>',
      '<p>在这场聚焦蒸汽未来的活动上，演讲者用“卓越地完成艰难之事”来形容工程师在工业脱碳中的角色。脱碳不会一蹴而就，但持续创新与协作，是推动行业向前的关键。</p>',
      '<p>作为更大范围可持续能源与环境保护会议的一部分，超过 200 位参与者围绕热能技术的最新进展进行了全天讨论。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>热点主题</h2>',
      '<p>上午多场议题聚焦高温热泵技术，反映出工业界对务实电气化路径的浓厚兴趣。不过，演讲也指出，这条路径并不如想象中简单。</p>',
      '<p>下午的讨论则延续了同样的主题：要让蒸汽生产摆脱化石燃料仍然充满挑战，但越来越多企业正通过测试新技术、分享最佳实践和复盘失败经验来共同推进这一目标。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>从蒸汽工程到新技术尝试</h2>',
      '<p>会议还讨论了陶瓷行业辐射余热回收、工业蒸汽应用中的热能储存、板式换热器结垢控制，以及数字化监测蒸汽设备时如何降低背景噪声等主题。</p>',
      '<p>最后的分享还介绍了一项利用氢气与氧气燃烧生成清洁蒸汽的专利应用。和任何新兴减碳技术一样，规模化、成本和与现有工艺的整合，仍然是下一步需要跨越的门槛。</p>',
      '</section>'
    ])
  },
  'the-digitalisation-dilemma': {
    title: '数字化两难：数据该存在哪里？',
    seoTitle: '数字化两难：数据应该存放在哪里？',
    seoDescription: '面对安全、扩展性、成本与集成要求，企业需要在本地部署、云端系统或混合模式之间做出合适选择。',
    pageData: {
      title: '数字化两难：数据该存在哪里？'
    },
    bodyHtml: joinHtml([
      '<section class="imported-content-section">',
      '<h2>本地部署还是云端系统？</h2>',
      '<p>随着数据量和复杂度持续上升，企业围绕本地部署与云端方案的讨论也越来越激烈。前者把数据和应用保留在企业自有基础设施中，后者则依托第三方托管服务器通过互联网访问。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>传统做法：本地部署系统</h2>',
      '<p>过去，许多企业通过微型 PLC、本地 SCADA 或 DCS 平台实现控制与数据管理。这种方式在安全感、控制权以及与本地系统集成方面有天然优势，也常被用来满足更严格的企业规则。</p>',
      '<p>但它通常需要较高的前期资本投入，而且实施周期较长；后续维护、软件升级和补丁管理也往往依赖现场专业人员，运营成本并不低。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>创新做法：云端系统</h2>',
      '<p>云端系统的明显优势在于部署速度和扩展能力。企业可以更快上线，并根据需求灵活扩展或缩减资源。</p>',
      '<p>虽然云服务存在订阅费用，但往往可通过更低的维护成本和更便捷的数据整合来抵消。借助 API、MQTT 等标准技术，云端也更适合跨系统共享数据。</p>',
      '<p>当然，云端方案依赖稳定的网络连接，而知识产权和敏感生产数据的担忧，则可以通过只上传必要数据或使用独立的 4G/LTE 通道来缓解。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>IT 与 OT 的不同视角</h2>',
      '<p>IT 团队通常更关注安全、软件审批和治理；OT 团队则更看重现场运行顺畅与生产连续性。新技术引入时，这种视角差异往往会带来一定摩擦。</p>',
      '</section>',
      '<section class="imported-content-section">',
      '<h2>什么选择更适合您？</h2>',
      '<p>最终选择取决于企业需求、预算和长期目标。无论您更倾向于本地部署、云端方案还是混合模式，都需要在充分理解各自特性的基础上做出决策，并为未来的数据管理演进保留灵活性。</p>',
      '</section>'
    ])
  },
  'wireless-steam-trap-monitoring': {
    title: '蒸汽疏水阀无线监测',
    seoTitle: '蒸汽疏水阀无线监测（WSTM）',
    seoDescription: '通过无线蒸汽疏水阀监测系统，更早发现问题、减少能量损失和非计划维护成本，并提升运行安全性。',
    pageData: {
      title: '蒸汽疏水阀无线监测'
    }
  }
};

const staticDirsToSync = ['pagefind', 'pdfs'];

const existingColumns = listColumns({ includeTranslations: true });
const columnByRoutePath = new Map(
  existingColumns.map((item) => [String(item.route_path || '').trim(), item]).filter((item) => item[0])
);

const imported = [];

for (const definition of singlePages) {
  const parentId = definition.parentRoutePath
    ? Number(columnByRoutePath.get(definition.parentRoutePath)?.id || 0) || null
    : null;
  const parsed = definition.sourceFile ? parseSourceMdx(definition.sourceFile) : { title: '', seoTitle: '', seoDescription: '', bodyHtml: '', pageData: definition.pageData || null };
  const override = localizationOverrides[definition.slug] || null;
  const pageData = mergeImportedPageData(definition.pageData || parsed.pageData || null, override?.pageData || null);
  const bodyHtml = override?.bodyHtml ?? parsed.bodyHtml ?? '';
  const title = override?.title || pageData?.title || parsed.title || definition.slug;
  const seoTitle = override?.seoTitle || parsed.seoTitle || title;
  const seoDescription = override?.seoDescription || parsed.seoDescription || '';
  const summary = override?.summary || pageData?.summary || seoDescription || '';

  const payload = {
    base: {
      name: title,
      parent_id: parentId,
      column_type: 'single',
      route_path: definition.routePath,
      dir_name: definition.slug,
      content_html: bodyHtml,
      summary,
      seo_title: seoTitle,
      seo_description: seoDescription || summary,
      keywords: null,
      publish_status: 'published',
      published_at: null,
      is_visible: 1,
      sort_order: 0,
      legacy_extra: JSON.stringify({
        import_source: 'spirax-global',
        key: `column:${definition.slug}`,
        route_path: definition.routePath,
        page_data: pageData
      })
    },
    translations: {
      [defaultLanguageCode]: {
        name: title,
        summary,
        content_html: bodyHtml,
        keywords: null,
        seo_title: seoTitle,
        seo_description: seoDescription || summary,
        publish_status: 'published',
        published_at: null
      }
    }
  };

  const existing = columnByRoutePath.get(definition.routePath);
  const record = existing
    ? updateManualColumn(existing.id, payload)
    : createManualColumn(payload);
  columnByRoutePath.set(definition.routePath, record);
  imported.push({ routePath: definition.routePath, id: record.id, title });
}

for (const relativeDir of staticDirsToSync) {
  syncDirectory(path.join(sourceDistRoot, relativeDir), path.join(outputRoot, relativeDir));
}

console.log(JSON.stringify({
  imported,
  synced_static_dirs: staticDirsToSync
}, null, 2));

function parseSourceMdx(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(raw);
  const pageData = parseExportObject(raw, 'pageData');
  const bodyHtml = extractBodyHtml(raw, pageData);
  return {
    title: String(frontmatter.title || pageData?.title || '').trim(),
    seoTitle: String(frontmatter.seoTitle || pageData?.title || '').trim(),
    seoDescription: String(frontmatter.seoDescription || frontmatter.description || pageData?.summary || '').trim(),
    bodyHtml,
    pageData
  };
}

function mergeImportedPageData(baseValue, overrideValue) {
  if (!overrideValue) {
    return baseValue;
  }
  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return Array.isArray(overrideValue) ? overrideValue : baseValue;
  }
  if (!baseValue || typeof baseValue !== 'object') {
    return overrideValue;
  }
  if (typeof overrideValue !== 'object') {
    return overrideValue;
  }
  const result = { ...baseValue };
  for (const [key, value] of Object.entries(overrideValue)) {
    result[key] = mergeImportedPageData(result[key], value);
  }
  return result;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }
  const result = {};
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1];
    let value = pair[2].trim();
    value = value.replace(/^['"]|['"]$/g, '');
    result[key] = value;
  }
  return result;
}

function parseExportObject(raw, exportName) {
  const marker = `export const ${exportName} =`;
  const start = raw.indexOf(marker);
  if (start < 0) {
    return null;
  }
  const braceStart = raw.indexOf('{', start);
  if (braceStart < 0) {
    return null;
  }
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  for (let index = braceStart; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if ((inSingle || inDouble || inTemplate) && char === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === '\'' ) {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) {
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const objectLiteral = raw.slice(braceStart, index + 1);
        return Function(`"use strict"; return (${objectLiteral});`)();
      }
    }
  }
  return null;
}

function extractBodyHtml(raw, pageData = null) {
  let content = stripFrontmatter(raw)
    .replace(/^import\s.+?;?\s*$/gmu, '')
    .trim();

  content = removeExportObjectBlock(content, 'pageData');
  content = replaceMdxLinks(content);
  content = transformInfoSections(content);
  content = content
    .replace(/<\/?StructuredInfoPage[^>]*>/g, '')
    .replace(/<\/?[A-Z][A-Za-z0-9]*(?:\s[^>]*)?\/?>/g, '')
    .trim();

  const directHtml = renderMarkdownLikeHtml(content);
  if (hasMeaningfulHtml(directHtml)) {
    return directHtml;
  }

  return renderBodyHtmlFromPageData(pageData);
}

function stripFrontmatter(raw) {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/u, '');
}

function removeExportObjectBlock(raw, exportName) {
  const marker = `export const ${exportName} =`;
  const start = raw.indexOf(marker);
  if (start < 0) {
    return raw;
  }
  const braceStart = raw.indexOf('{', start);
  if (braceStart < 0) {
    return raw;
  }
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  for (let index = braceStart; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if ((inSingle || inDouble || inTemplate) && char === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === '\'') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) {
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        let end = index + 1;
        while (end < raw.length && /\s/u.test(raw[end])) {
          end += 1;
        }
        if (raw[end] === ';') {
          end += 1;
        }
        while (end < raw.length && /\s/u.test(raw[end])) {
          end += 1;
        }
        return `${raw.slice(0, start)}${raw.slice(end)}`;
      }
    }
  }
  return raw;
}

function replaceMdxLinks(content) {
  return content.replace(/<Link\s+href=(['"])(.*?)\1>([\s\S]*?)<\/Link>/g, (_, __, href, label) => {
    return `<a href="${escapeAttribute(href)}">${label.trim()}</a>`;
  });
}

function transformInfoSections(content) {
  return content.replace(/<InfoSection([^>]*)>([\s\S]*?)<\/InfoSection>/g, (_, rawAttrs, inner) => {
    const title = extractQuotedAttribute(rawAttrs, 'title');
    const images = extractStringArrayAttribute(rawAttrs, 'images');
    const body = renderMarkdownLikeHtml(inner.trim());
    const parts = ['<section class="imported-content-section">'];
    if (title) {
      parts.push(`<h2>${escapeHtml(title)}</h2>`);
    }
    for (const image of images) {
      parts.push(`<p><img alt="${escapeAttribute(title || '')}" src="${escapeAttribute(image)}" /></p>`);
    }
    if (body) {
      parts.push(body);
    }
    parts.push('</section>');
    return parts.join('\n');
  });
}

function extractQuotedAttribute(rawAttrs, name) {
  const match = rawAttrs.match(new RegExp(`${name}=(['"])(.*?)\\1`, 'u'));
  return match ? String(match[2] || '').trim() : '';
}

function extractStringArrayAttribute(rawAttrs, name) {
  const match = rawAttrs.match(new RegExp(`${name}=\\{\\[(.*?)\\]\\}`, 'su'));
  if (!match) {
    return [];
  }
  return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g), (item) => String(item[1] || '').trim()).filter(Boolean);
}

function renderMarkdownLikeHtml(content) {
  if (!content) {
    return '';
  }

  const lines = content.split('\n');
  const html = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      continue;
    }
    if (trimmed.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${renderInlineHtml(trimmed.slice(2))}</li>`);
      continue;
    }
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (trimmed.startsWith('#### ')) {
      html.push(`<h4>${renderInlineHtml(trimmed.slice(5))}</h4>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      html.push(`<h3>${renderInlineHtml(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      html.push(`<h2>${renderInlineHtml(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (/^<(?:p|ul|ol|li|h[1-6]|section|div|figure|img|table|blockquote|a)\b[\s\S]*$/u.test(trimmed)) {
      html.push(trimmed);
      continue;
    }
    html.push(`<p>${renderInlineHtml(trimmed)}</p>`);
  }
  if (inList) {
    html.push('</ul>');
  }
  return html.join('\n');
}

function renderBodyHtmlFromPageData(pageData) {
  if (!pageData || typeof pageData !== 'object') {
    return '';
  }

  const ignoredKeys = new Set([
    'title',
    'summary',
    'heroImage',
    'heroSummary',
    'mastheadImage',
    'callToActionHeading',
    'pageKind',
    'iconAlt',
    'imageAlt',
    'posterAlt',
    'youtubeId'
  ]);

  const parts = [];
  for (const [key, value] of Object.entries(pageData)) {
    if (ignoredKeys.has(key)) {
      continue;
    }
    const rendered = renderStructuredValue(value, 2);
    if (rendered) {
      parts.push(rendered);
    }
  }
  return parts.join('\n');
}

function renderStructuredValue(value, headingLevel = 2) {
  if (value == null || value === false) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return `<section class="imported-content-section"><p>${renderInlineHtml(String(value))}</p></section>`;
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => renderStructuredValue(item, Math.min(headingLevel + 1, 6))).filter(Boolean);
    return items.join('\n');
  }

  if (typeof value !== 'object') {
    return '';
  }

  const consumedKeys = new Set();
  const parts = ['<section class="imported-content-section">'];
  const title = firstNonEmpty(value.title, value.heading, value.caption, value.label);
  if (title) {
    parts.push(`<h${headingLevel}>${escapeHtml(title)}</h${headingLevel}>`);
    consumedKeys.add('title');
    consumedKeys.add('heading');
    consumedKeys.add('caption');
    consumedKeys.add('label');
  }

  for (const imageKey of ['image', 'imageSrc', 'poster', 'posterImage', 'heroImage', 'featureImage', 'icon']) {
    if (value[imageKey]) {
      parts.push(`<p><img alt="${escapeAttribute(title || value.iconAlt || '')}" src="${escapeAttribute(value[imageKey])}" /></p>`);
      consumedKeys.add(imageKey);
    }
  }
  consumedKeys.add('iconAlt');
  consumedKeys.add('imageAlt');
  consumedKeys.add('posterAlt');
  consumedKeys.add('youtubeId');

  for (const textKey of ['description', 'body', 'summary', 'intro', 'statement', 'heroSummary', 'value']) {
    const textValue = value[textKey];
    if (typeof textValue === 'string' && textValue.trim()) {
      parts.push(`<p>${renderInlineHtml(textValue)}</p>`);
      consumedKeys.add(textKey);
    }
  }

  if (typeof value.href === 'string' && value.href.trim()) {
    const linkLabel = firstNonEmpty(value.cta, value.label, value.title, value.href);
    parts.push(`<p><a href="${escapeAttribute(value.href)}">${escapeHtml(linkLabel)}</a></p>`);
    consumedKeys.add('href');
    consumedKeys.add('cta');
    consumedKeys.add('label');
  }

  for (const listKey of ['paragraphs', 'introHeadings', 'performanceCopy']) {
    if (Array.isArray(value[listKey]) && value[listKey].length > 0) {
      parts.push(...value[listKey].filter(Boolean).map((item) => `<p>${renderInlineHtml(String(item))}</p>`));
      consumedKeys.add(listKey);
    }
  }

  for (const listKey of ['items']) {
    if (Array.isArray(value[listKey]) && value[listKey].every((item) => typeof item === 'string')) {
      parts.push('<ul>');
      for (const item of value[listKey]) {
        parts.push(`<li>${renderInlineHtml(String(item))}</li>`);
      }
      parts.push('</ul>');
      consumedKeys.add(listKey);
    }
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (consumedKeys.has(key)) {
      continue;
    }
    const rendered = renderStructuredValue(nestedValue, Math.min(headingLevel + 1, 6));
    if (rendered) {
      parts.push(rendered);
    }
  }

  parts.push('</section>');
  const html = parts.join('\n');
  return hasMeaningfulHtml(html) ? html : '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function hasMeaningfulHtml(html) {
  return Boolean(String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim());
}

function renderInlineHtml(value) {
  const source = String(value || '').trim();
  if (!source) {
    return '';
  }
  if (/<[a-z][\s\S]*>/iu.test(source)) {
    return source.replace(/\n/g, '<br />');
  }
  return escapeHtml(source).replace(/\n/g, '<br />');
}

function syncDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      continue;
    }
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      syncDirectory(sourcePath, targetPath);
      continue;
    }
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}
