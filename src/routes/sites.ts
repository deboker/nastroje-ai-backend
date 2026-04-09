import { Router, type RequestHandler } from 'express';
import type { AuthedRequest } from '../types/site-context.js';
import { SiteService } from '../services/site-service.js';

export function createSiteRoutes(siteService: SiteService, authenticateSite: RequestHandler) {
  const router = Router();

  router.post('/register', async (req, res, next) => {
    try {
      const result = await siteService.registerSite(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/validate', authenticateSite, async (req: AuthedRequest, res, next) => {
    try {
      res.json({
        status: 'ok',
        site: req.siteContext?.site ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/settings', authenticateSite, async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const settings = await siteService.updateSiteSettings(siteContext.site.id, req.body);
      res.json({ settings });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
