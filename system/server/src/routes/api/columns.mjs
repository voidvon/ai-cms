import { requireAuth } from '../../middleware/auth.mjs';
import { listColumns } from '../../services/columns.mjs';

export default async function columnsRoutes(app) {
  app.get('/columns', {
    onRequest: [requireAuth]
  }, async () => {
    return { success: true, data: listColumns() };
  });
}
