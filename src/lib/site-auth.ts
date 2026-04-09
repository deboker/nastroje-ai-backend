import type { NextFunction, Response } from 'express';
import { SiteRepository } from '../repositories/site-repository.js';
import { TokenService } from '../services/token-service.js';
import type { AuthedRequest } from '../types/site-context.js';

export function siteAuth(siteRepository: SiteRepository) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const token = req.header('x-site-token');

      if (!token) {
        res.status(401).json({ error: 'Missing site token.' });
        return;
      }

      const siteContext = await siteRepository.findByTokenHash(TokenService.hashToken(token));

      if (!siteContext) {
        res.status(401).json({ error: 'Invalid site token.' });
        return;
      }

      req.siteContext = siteContext;
      next();
    } catch (error) {
      next(error);
    }
  };
}
