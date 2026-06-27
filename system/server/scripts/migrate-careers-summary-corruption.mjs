import { getDb } from '../src/db.mjs';

const WRITE = process.argv.includes('--write');
const TARGET_ROUTE = '/about-us/careers/';

const SUMMARY_BY_LANGUAGE = {
  en: 'Join one of the leading providers of steam and thermal energy solutions.',
  'zh-CN': '加入全球领先的蒸汽与热能解决方案提供商之一。我们欢迎对工程、服务、制造和商业岗位感兴趣的人才加入斯派莎克。',
  ru: 'Присоединяйтесь к международной инженерной компании, работающей с паровыми и тепловыми системами.',
  ar: 'انضم إلى أحد مزودي حلول البخار والطاقة الحرارية الرائدين.',
  'ar-me': 'انضم إلى أحد مزودي حلول البخار والطاقة الحرارية الرائدين.',
  es: 'Únase a uno de los principales proveedores de soluciones de vapor y energía térmica.',
  id: 'Bergabunglah dengan salah satu penyedia solusi uap dan energi termal terkemuka.',
  pt: 'Junte-se a um dos principais provedores de soluções de vapor e energia térmica.',
  fr: "Rejoignez l'un des principaux fournisseurs de solutions de vapeur et d'énergie thermique.",
  tr: 'Buhar ve termal enerji çözümlerinin lider sağlayıcılarından birine katılın.',
  th: 'เข้าร่วมหนึ่งในผู้ให้บริการโซลูชันพลังงานความร้อนและไอน้ำชั้นนำ',
  vi: 'Tham gia một trong những nhà cung cấp hàng đầu về giải pháp hơi nước và năng lượng nhiệt.'
};

const db = getDb();
const rows = db.prepare(`
  SELECT ct.id, ct.column_id, l.code AS language_code, c.route_path, ct.summary, ct.template_data_json
  FROM column_translations ct
  JOIN languages l ON l.id = ct.language_id
  JOIN columns c ON c.id = ct.column_id
  WHERE c.route_path = ?
  ORDER BY l.sort_order ASC, l.id ASC
`).all(TARGET_ROUTE);

let changed = 0;
const details = [];

if (WRITE) {
  db.exec('BEGIN TRANSACTION;');
}

try {
  const updateStatement = db.prepare(`
    UPDATE column_translations
    SET summary = ?, template_data_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  for (const row of rows) {
    const languageCode = row.language_code;
    const nextSummary = SUMMARY_BY_LANGUAGE[languageCode];
    const originalSummary = String(row.summary || '');
    const originalTemplateDataJson = String(row.template_data_json || '').trim();

    if (!nextSummary || !originalTemplateDataJson) {
      details.push({
        id: row.id,
        columnId: row.column_id,
        languageCode,
        changed: false,
        reason: !nextSummary ? 'missing-summary-map' : 'missing-template-data-json'
      });
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(originalTemplateDataJson);
    } catch {
      details.push({
        id: row.id,
        columnId: row.column_id,
        languageCode,
        changed: false,
        reason: 'invalid-template-data-json'
      });
      continue;
    }

    if (parsed && typeof parsed === 'object') {
      parsed.summary = nextSummary;
      if (parsed.hero && typeof parsed.hero === 'object') {
        parsed.hero.summary = nextSummary;
      }
    }

    const nextTemplateDataJson = JSON.stringify(parsed, null, 2);
    const didChange =
      originalSummary !== nextSummary || originalTemplateDataJson !== nextTemplateDataJson;

    details.push({
      id: row.id,
      columnId: row.column_id,
      languageCode,
      changed: didChange
    });

    if (!didChange) {
      continue;
    }

    changed += 1;

    if (WRITE) {
      updateStatement.run(nextSummary, nextTemplateDataJson, row.id);
    }
  }

  if (WRITE) {
    db.exec('COMMIT;');
  }
} catch (error) {
  if (WRITE) {
    db.exec('ROLLBACK;');
  }
  throw error;
}

console.log(JSON.stringify({
  write: WRITE,
  scanned: rows.length,
  changed,
  details
}, null, 2));
