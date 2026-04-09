import { Router } from 'express';
import type { AuthedRequest } from '../types/site-context.js';
import { SyncService } from '../services/sync-service.js';

export function createSyncRoutes(syncService: SyncService) {
  const router = Router();

  router.post('/batch', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const result = await syncService.ingestBatch(siteContext, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
