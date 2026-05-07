import cors from 'cors';
import express from 'express';
import { env } from './lib/env.js';
import { siteAuth } from './lib/site-auth.js';
import { ConversationRepository } from './repositories/conversation-repository.js';
import { DocumentRepository } from './repositories/document-repository.js';
import { LeadRepository } from './repositories/lead-repository.js';
import { OpsRepository } from './repositories/ops-repository.js';
import { SiteRepository } from './repositories/site-repository.js';
import { createChatRoutes } from './routes/chat.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createLeadRoutes } from './routes/leads.js';
import { createSiteRoutes } from './routes/sites.js';
import { createSyncRoutes } from './routes/sync.js';
import { ChatService } from './services/chat-service.js';
import { GroqProvider } from './services/groq-provider.js';
import { LeadService } from './services/lead-service.js';
import { MockAIProvider } from './services/mock-ai-provider.js';
import { RetrievalService } from './services/retrieval-service.js';
import { SiteService } from './services/site-service.js';
import { SyncService } from './services/sync-service.js';

const app = express();
app.set('trust proxy', 1);

const siteRepository = new SiteRepository();
const documentRepository = new DocumentRepository();
const conversationRepository = new ConversationRepository();
const opsRepository = new OpsRepository();
const leadRepository = new LeadRepository();
const authenticateSite = siteAuth(siteRepository);

const siteService = new SiteService(siteRepository, leadRepository);
const syncService = new SyncService(documentRepository, opsRepository);
const retrievalService = new RetrievalService(documentRepository);
const leadService = new LeadService(leadRepository, conversationRepository, opsRepository);
const aiProvider = env.GROQ_API_KEY ? new GroqProvider() : new MockAIProvider();
const chatService = new ChatService(
  conversationRepository,
  retrievalService,
  opsRepository,
  aiProvider,
);

app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
  }),
);
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/sites', createSiteRoutes(siteService, authenticateSite));
app.use('/api/sync', authenticateSite, createSyncRoutes(syncService));
app.use('/api/chat', authenticateSite, createChatRoutes(chatService));
app.use('/api/leads', authenticateSite, createLeadRoutes(leadService));
app.use('/api/dashboard', authenticateSite, createDashboardRoutes(siteService));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number') {
    res.status(error.statusCode).json({ error: error instanceof Error ? error.message : 'Request failed' });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  res.status(500).json({ error: message });
});

app.listen(env.PORT, () => {
  console.log(`Nastroje AI backend listening on http://localhost:${env.PORT}`);
});
