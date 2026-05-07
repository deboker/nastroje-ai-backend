import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../types/site-context.js';
import { LeadService } from '../services/lead-service.js';

const MAX_LEAD_ANSWERS = 20;
const MAX_LEAD_ANSWER_LENGTH = 2000;

const leadSubmitSchema = z.object({
  session_id: z.string().trim().max(120).optional().or(z.literal('')),
  source_page_url: z.string().trim().max(500).optional().or(z.literal('')),
  conversation_id: z.string().trim().max(80).optional().or(z.literal('')),
  answers: z
    .array(
      z.object({
        field_id: z.string().trim().min(1).max(80),
        label: z.string().trim().min(1).max(200),
        value: z.string().trim().min(1).max(MAX_LEAD_ANSWER_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_LEAD_ANSWERS),
});

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

      const parsed = leadSubmitSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: `Lead answers must be non-empty and each answer must be at most ${MAX_LEAD_ANSWER_LENGTH} characters.`,
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await leadService.submit(siteContext, parsed.data);
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

  router.delete('/submissions/:submissionId', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const result = await leadService.deleteSubmission(siteContext, String(req.params.submissionId));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
