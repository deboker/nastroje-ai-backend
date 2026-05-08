import { Router } from 'express';
import { z } from 'zod';
import { InMemoryRateLimiter } from '../lib/rate-limit.js';
import type { AuthedRequest } from '../types/site-context.js';
import { LeadService } from '../services/lead-service.js';

const MAX_LEAD_ANSWERS = 20;
const MAX_LEAD_ANSWER_LENGTH = 2000;
const LEAD_RATE_LIMIT_MESSAGE = 'Príliš veľa odoslaní. Skúste to prosím neskôr.';

const leadSessionLimiter = new InMemoryRateLimiter([
  { windowMs: 10 * 60_000, max: 5 },
]);
const leadIpLimiter = new InMemoryRateLimiter([
  { windowMs: 60 * 60_000, max: 20 },
]);

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

      const sessionId = parsed.data.session_id || parsed.data.conversation_id || 'no-session';
      const sessionDecision = leadSessionLimiter.consume(buildLeadSessionRateLimitKey(req, siteContext.site.id, sessionId));
      const ipDecision = leadIpLimiter.consume(buildLeadIpRateLimitKey(req, siteContext.site.id));
      const retryAfterSeconds = Math.max(sessionDecision.retryAfterSeconds ?? 0, ipDecision.retryAfterSeconds ?? 0);

      if (!sessionDecision.allowed || !ipDecision.allowed) {
        if (retryAfterSeconds > 0) {
          res.setHeader('Retry-After', String(retryAfterSeconds));
        }

        logLeadRateLimitEvent({
          siteId: siteContext.site.id,
          sessionId,
          ip: clientIp(req),
        });

        res.status(429).json({
          success: false,
          message: LEAD_RATE_LIMIT_MESSAGE,
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

function buildLeadSessionRateLimitKey(req: AuthedRequest, siteId: string, sessionId: string) {
  return `lead-submit-session:${clientIp(req)}:${siteId}:${sessionId}`;
}

function buildLeadIpRateLimitKey(req: AuthedRequest, siteId: string) {
  return `lead-submit-ip:${clientIp(req)}:${siteId}`;
}

function clientIp(req: AuthedRequest) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function logLeadRateLimitEvent(input: { siteId: string; sessionId: string; ip: string }) {
  console.warn({
    type: 'lead_rate_limit',
    siteId: input.siteId,
    sessionId: input.sessionId,
    ip: input.ip,
    createdAt: new Date().toISOString(),
  });
}
