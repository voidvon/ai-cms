const PERMISSION_ALIAS_MAP = {
  'read:content': ['03'],
  'write:content': ['03'],
  'read:products': ['03'],
  'write:products': ['03'],
  'read:prices': ['03'],
  'write:prices': ['03'],
  'read:web': ['03'],
  'read:documents': ['03'],
  'write:documents': ['03'],
  'read:all': ['10'],
  'write:all': ['10'],
};

function normalizeFlags(permissionFlags) {
  return String(permissionFlags || '')
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

export function resolvePermissionCandidates(permission) {
  const normalized = String(permission || '').trim();
  if (!normalized) {
    return [];
  }

  const aliases = PERMISSION_ALIAS_MAP[normalized];
  if (Array.isArray(aliases)) {
    return aliases.length > 0 ? aliases : [normalized];
  }

  return [normalized];
}

export function hasAiPermissions(user, requiredPermissions = []) {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  const flags = new Set(normalizeFlags(user?.permission_flags));
  const namedPermissions = new Set(
    Array.isArray(user?.permissions)
      ? user.permissions.map((item) => String(item || '').trim()).filter(Boolean)
      : []
  );

  return requiredPermissions.every((permission) => {
    const candidates = resolvePermissionCandidates(permission);
    if (candidates.length === 0) {
      return true;
    }

    return candidates.some((candidate) => namedPermissions.has(candidate) || flags.has(candidate));
  });
}
