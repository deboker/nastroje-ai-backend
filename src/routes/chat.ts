import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../types/site-context.js';
import { ChatService } from '../services/chat-service.js';

const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_OPTIONAL_FIELD_LENGTH = 500;

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
        res.status(400).json({
          error: `Message must be 1-${MAX_CHAT_MESSAGE_LENGTH} characters.`,
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await chatService.sendMessage(siteContext, parsed.data);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
