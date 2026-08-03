import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const databasePath = path.join(projectRoot, 'data', 'site.sqlite');
const db = new DatabaseSync(databasePath);

const dirNamesById = new Map([
  [103, 'privacy-policy'],
  [105, 'resources-and-design-tools'],
  [108, 'steam-expertise'],
  [111, 'training'],
  [112, 'your-goals'],
  [113, 'improve-or-expand-your-steam-system'],
  [114, 'improve-productivity'],
  [115, 'improve-system-reliability'],
  [116, 'saving-energy'],
  [319, 'control-hardware-self-acting-actuation'],
  [353, 'data-tables/test-list'],
]);

db.exec('BEGIN IMMEDIATE');
try {
  const updateDirName = db.prepare(`
    UPDATE columns
    SET dir_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  for (const [id, dirName] of dirNamesById) {
    const result = updateDirName.run(dirName, id);
    if (Number(result.changes) !== 1) {
      throw new Error(`栏目 ${id} 不存在，迁移已取消`);
    }
  }

  const hasRoutePath = db.prepare('PRAGMA table_info(columns)').all()
    .some((column) => String(column.name || '') === 'route_path');
  if (hasRoutePath) {
    db.exec('DROP INDEX IF EXISTS idx_columns_route_path');
    db.exec('ALTER TABLE columns DROP COLUMN route_path');
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}

console.log(`栏目目录迁移完成，共校正 ${dirNamesById.size} 个 dir_name，并已删除 route_path 字段。`);
