export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderPage({ title, body, description = '' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f7fa; color: #1f2937; }
    .page { max-width: 980px; margin: 0 auto; padding: 32px 16px 64px; }
    .card { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 16px; font-size: 28px; }
    p { line-height: 1.7; }
    form { display: grid; grid-template-columns: 1fr auto; gap: 12px; margin: 20px 0 28px; }
    input[type="text"] { padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 16px; }
    button { border: 0; border-radius: 10px; padding: 12px 18px; background: #0f766e; color: #fff; font-size: 16px; cursor: pointer; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
    li { display: grid; grid-template-columns: 140px 1fr; gap: 16px; padding: 16px 0; border-top: 1px solid #e5e7eb; }
    li:first-child { border-top: 0; padding-top: 0; }
    img { width: 140px; height: 96px; object-fit: cover; border-radius: 8px; background: #e5e7eb; }
    a { color: #0f4c81; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .muted { color: #64748b; }
    .empty { padding: 24px 0; color: #64748b; }
    @media (max-width: 680px) {
      form { grid-template-columns: 1fr; }
      li { grid-template-columns: 1fr; }
      img { width: 100%; height: 180px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="card">
      ${body}
    </section>
  </main>
</body>
</html>`;
}
