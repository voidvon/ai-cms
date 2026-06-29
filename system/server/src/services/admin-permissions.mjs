export const ADMIN_PERMISSION_DEFINITIONS = [
  { flag: '01', label: '仪表盘', description: '查看后台概览与基础统计' },
  { flag: '02', label: '栏目管理', description: '管理栏目、栏目节点和模板绑定' },
  { flag: '03', label: '信息管理', description: '管理内容列表、详情和发布数据' },
  { flag: '04', label: '附件管理', description: '上传、删除和维护媒体资源' },
  { flag: '05', label: '主题管理', description: '管理模板主题、模板变体和组件' },
  { flag: '06', label: '数据模型', description: '管理内容模型和字段结构' },
  { flag: '07', label: '多语言', description: '管理语言站点和翻译配置' },
  { flag: '08', label: '网站配置', description: '修改站点基础配置和展示文案' },
  { flag: '09', label: '静态生成', description: '执行和查看静态发布任务' },
  { flag: '10', label: '管理员', description: '管理管理员账号、用户组与访问记录' },
  { flag: '11', label: '批量替换', description: '执行批量文本替换类工具操作' },
  { flag: '12', label: 'Sitemap 诊断', description: '查看和执行 Sitemap 诊断' },
  { flag: '13', label: 'LLMS 诊断', description: '查看和执行 LLMS 诊断' }
];

const VALID_PERMISSION_FLAGS = new Set(ADMIN_PERMISSION_DEFINITIONS.map((item) => item.flag));

export const ALL_ADMIN_PERMISSION_FLAGS = ADMIN_PERMISSION_DEFINITIONS.map((item) => item.flag).join(',');

export function listAdminPermissions() {
  return ADMIN_PERMISSION_DEFINITIONS;
}

export function hasAdminPermission(permissionFlags, requiredFlag) {
  if (!requiredFlag) {
    return true;
  }

  const normalizedFlags = normalizePermissionFlags(permissionFlags).split(',').filter(Boolean);
  return normalizedFlags.includes(String(requiredFlag).trim());
}

export function normalizePermissionFlags(value, options = {}) {
  const { fallbackToAll = false } = options;
  const source = Array.isArray(value) ? value : String(value ?? '').split(',');
  const flags = [];

  for (const entry of source) {
    const normalized = String(entry ?? '').trim();
    if (!normalized) {
      continue;
    }

    const parsed = Number.parseInt(normalized, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      continue;
    }

    const flag = String(parsed).padStart(2, '0');
    if (!VALID_PERMISSION_FLAGS.has(flag) || flags.includes(flag)) {
      continue;
    }
    flags.push(flag);
  }

  if (flags.length === 0 && fallbackToAll) {
    return ALL_ADMIN_PERMISSION_FLAGS;
  }

  return flags.join(',');
}
