import fs from 'node:fs';
import { DATABASE_PATH } from '../config.mjs';
import { getDb } from '../db.mjs';

function getFileSize(filePath) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  return fs.statSync(filePath).size;
}

export function checkpointDatabaseWal() {
  const walPath = `${DATABASE_PATH}-wal`;
  const shmPath = `${DATABASE_PATH}-shm`;
  const beforeWalSize = getFileSize(walPath);
  const beforeDbSize = getFileSize(DATABASE_PATH);
  const checkpointRow = getDb().prepare('PRAGMA wal_checkpoint(TRUNCATE);').get() || null;
  const afterWalSize = getFileSize(walPath);
  const afterDbSize = getFileSize(DATABASE_PATH);

  return {
    databasePath: DATABASE_PATH,
    walPath,
    shmPath,
    beforeWalSize,
    afterWalSize,
    beforeDbSize,
    afterDbSize,
    releasedBytes: Math.max(beforeWalSize - afterWalSize, 0),
    checkpoint: checkpointRow
  };
}
