import { Router } from 'express';
import { z } from 'zod';
import { InMemoryRateLimiter } from '../lib/rate-limit.js';
import { BLOCKED_CHAT_REPLY, checkMessageSecurity, createSafeMessagePreview } from '../lib/security-filter.js';
import type { AuthedRequest } from '../types/site-context.js';
import { ChatService } from '../services/chat-service.js';

const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_OPTIONAL_FIELD_LENGTH = 500;
const chatMessageLimiter = new InMemoryRateLimiter([
  { windowMs: 60_000, max: 10 },
  { windowMs: 60 * 60_000, max: 100 },
]);
const failedChatLimiter = new InMemoryRateLimiter([
  { windowMs: 60_000, max: 5 },
  { windowMs: 60 * 60_000, max: 20 },
]);

const chatMessageSchema = z.object({
  conversation_id: z.string().trim().max(80).optional().or(z.literal('')),
  session_id: z.string().trim().max(120).optional().or(z.literal('')),
  message: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
  language: z.string().trim().max(20).optional(),
  tone: z.string().trim().max(60).optional(),
  assistant_name: z.string().trim().max(120).optional(),
  source_page_url: z.string().trim().max(MAX_OPTIONAL_FIELD_LENGTH).optional().or(z.literal('')),
  user_identifier: z.string().trim().max(120).optional().or(z.literal('')),
});

export function createChatRoutes(chatService: ChatService) {
  const router = Router();

  router.post('/conversations', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const conversation = await chatService.createConversation(siteContext, req.body);
      res.status(201).json({ conversation });
    } catch (error) {
      next(error);
    }
  });

  router.get('/conversations', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const page = Number(req.query.page || 1);
      const perPage = Number(req.query.per_page || 20);
      const result = await chatService.listConversations(siteContext, page, perPage);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/conversations/:conversationId', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const result = await chatService.getConversation(siteContext, String(req.params.conversationId));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/conversations/:conversationId', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const result = await chatService.deleteConversation(siteContext, String(req.params.conversationId));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/message', async (req: AuthedRequest, res, next) => {
    try {
      const siteContext = req.siteContext;
      if (!siteContext) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const parsed = chatMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        const failedDecision = failedChatLimiter.consume(buildFailedRateLimitKey(req, siteContext.site.id));
        if (!failedDecision.allowed) {
          res.setHeader('Retry-After', String(failedDecision.retryAfterSeconds ?? 60));
          res.status(429).json({ error: 'Too many failed chat requests. Please try again later.' });
          return;
        }

        res.status(400).json({
          error: `Message must be 1-${MAX_CHAT_MESSAGE_LENGTH} characters.`,
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const decision = chatMessageLimiter.consume(
        buildChatRateLimitKey(req, siteContext.site.id, parsed.data.session_id || parsed.data.conversation_id || 'no-session'),
      );
      if (!decision.allowed) {
        res.setHeader('Retry-After', String(decision.retryAfterSeconds ?? 60));
        res.status(429).json({ error: 'Too many chat messages. Please wait a moment and try again.' });
        return;
      }

      const securityDecision = checkMessageSecurity(parsed.data.message);
      if (!securityDecision.allowed) {
        logSecurityEvent({
          category: securityDecision.category ?? 'unknown',
          risk: securityDecision.risk,
          siteId: siteContext.site.id,
          sessionId: parsed.data.session_id || parsed.data.conversation_id || 'no-session',
          ip: clientIp(req),
          message: parsed.data.message,
        });

        res.json({
          reply: BLOCKED_CHAT_REPLY,
          blocked: true,
        });
        return;
      }

      let result;
      try {
        result = await chatService.sendMessage(siteContext, parsed.data);
      } catch (error) {
        failedChatLimiter.consume(buildFailedRateLimitKey(req, siteContext.site.id));
        throw error;
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function buildChatRateLimitKey(req: AuthedRequest, siteId: string, sessionId: string) {
  return `chat:${clientIp(req)}:${siteId}:${sessionId}`;
}

function buildFailedRateLimitKey(req: AuthedRequest, siteId: string) {
  return `chat-failed:${clientIp(req)}:${siteId}`;
}

function clientIp(req: AuthedRequest) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function logSecurityEvent(input: {
  category: string;
  risk: string;
  siteId: string;
  sessionId: string;
  ip: string;
  message: string;
}) {
  console.warn({
    type: 'security_event',
    category: input.category,
    risk: input.risk,
    siteId: input.siteId,
    sessionId: input.sessionId,
    ip: input.ip,
    messagePreview: createSafeMessagePreview(input.message),
    createdAt: new Date().toISOString(),
  });
}
