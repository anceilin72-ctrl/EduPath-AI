import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import roleRoutes from './routes/roles.routes.js';
import nodeRoutes from './routes/nodes.routes.js';
import roadmapRoutes from './routes/roadmap.routes.js';
import progressRoutes from './routes/progress.routes.js';
import resumeRoutes from './routes/resume.routes.js';
import analysisRoutes from './routes/analysis.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import skillsRoutes from './routes/skills.routes.js';
import assessmentRoutes from './routes/assessment.routes.js';
import agentRoutes from './routes/agent.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import simulatorRoutes from './routes/simulator.routes.js';
import tutorRoutes from './routes/tutor.routes.js';
import interviewRoutes from './routes/interview.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

/**
 * Builds the Express app.
 *
 * Kept separate from index.js — which loads env vars, connects to Mongo and
 * listens — so the app can be imported and exercised without opening a port or
 * requiring a database.
 */
export function createApp() {
  const app = express();

  /**
   * In development the Vite dev server on port 3000 calls the API on port 5000,
   * which is a cross-origin request. The allow-list is explicit rather than
   * `origin: true`, so that deploying this does not accidentally accept requests
   * from any site on the internet.
   */
  const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        // No origin header means a same-origin request, curl, or Postman.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
      },
    })
  );

  // Resume uploads are handled by multer on their own route; this limit applies
  // to JSON bodies, where the largest realistic payload is a list of known skills.
  app.use(express.json({ limit: '1mb' }));

  /** Liveness check — also the quickest way to confirm setup worked. */
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'career-roadmap-api',
      time: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/roles', roleRoutes);
  app.use('/api/nodes', nodeRoutes);
  app.use('/api/roadmaps', roadmapRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/resume', resumeRoutes);
  app.use('/api/analysis', analysisRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/skills', skillsRoutes);
  app.use('/api/assessments', assessmentRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/simulator', simulatorRoutes);
  app.use('/api/tutor', tutorRoutes);
  app.use('/api/interview', interviewRoutes);

  // These two must stay last: Express matches in order, so anything registered
  // after the 404 handler would never be reached.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
