import { Router } from 'express';
import type { AuthedRequest } from '../types/site-context.js';
import { LeadService } from '../services/lead-service.js';

export function createLeadRoutes(leadService: LeadService) {
  const router = Router();

  router.get('/form', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const form = await leadService.getActiveForm(siteContext);
      res.json({ form });
    } catch (error) {
      next(error);
    }
  });

  router.post('/submit', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const result = await leadService.submit(siteContext, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/submissions', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const page = Number(req.query.page || 1);
      const perPage = Number(req.query.per_page || 20);
      const result = await leadService.listSubmissions(siteContext, page, perPage);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/submissions/:submissionId', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const result = await leadService.getSubmission(siteContext, String(req.params.submissionId));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
