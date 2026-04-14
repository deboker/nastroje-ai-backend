import { Router } from 'express';
import type { AuthedRequest } from '../types/site-context.js';
import { ChatService } from '../services/chat-service.js';

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

      const result = await chatService.sendMessage(siteContext, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
