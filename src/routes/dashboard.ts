import { Router } from 'express';
import type { AuthedRequest } from '../types/site-context.js';
import { SiteService } from '../services/site-service.js';

export function createDashboardRoutes(siteService: SiteService) {
  const router = Router();

  router.get('/summary', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const summary = await siteService.getDashboardSummary(siteContext.site.id);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.get('/analytics', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const summary = await siteService.getAnalyticsSummary(siteContext.site.id);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
