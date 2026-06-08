import { requireAuth } from '../../middleware/auth.mjs';
import {
  listJobs,
  listJobsAdmin,
  getJobById,
  createJob,
  updateJob,
  deleteJob
} from '../../services/jobs.mjs';

export default async function jobRoutes(app) {
  // 公开 API：招聘列表
  app.get('/jobs', async (request, reply) => {
    const { limit, offset } = request.query;

    const jobs = listJobs({
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    return { success: true, data: jobs };
  });

  // 公开 API：招聘详情
  app.get('/jobs/:id', async (request, reply) => {
    const job = getJobById(parseInt(request.params.id));

    if (!job) {
      return reply.notFound('招聘信息不存在');
    }

    return { success: true, data: job };
  });

  // 管理 API：招聘列表
  app.get('/jobs/admin/list', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { limit, offset } = request.query;

    const jobs = listJobsAdmin({
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    return { success: true, data: jobs };
  });

  // 管理 API：创建招聘
  app.post('/jobs', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const job = createJob(request.body);
    return { success: true, data: job };
  });

  // 管理 API：更新招聘
  app.put('/jobs/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const updated = updateJob(parseInt(request.params.id), request.body);

    if (!updated) {
      return reply.notFound('招聘信息不存在');
    }

    return { success: true, data: updated };
  });

  // 管理 API：删除招聘
  app.delete('/jobs/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const deleted = deleteJob(parseInt(request.params.id));

    if (!deleted) {
      return reply.notFound('招聘信息不存在');
    }

    return { success: true, message: '招聘信息已删除' };
  });
}
