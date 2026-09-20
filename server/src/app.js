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
   * CORS configuration
   *
   * Development:
   * - http://localhost:3000
   * - http://localhost:5173
   *
   * Production:
   * - https://edu-path-ai-ten.vercel.app
   *
   * CLIENT_ORIGIN can optionally override/extend this list using
   * comma-separated origins in the environment.
   */
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://edu-path-ai-ten.vercel.app',
  ];

  const configuredOrigins = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];

  const allowedOrigins = [
    ...new Set([...defaultOrigins, ...configuredOrigins]),
  ];

  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header are allowed.
        // This includes curl, Postman, server-to-server requests, etc.
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        console.warn(`CORS blocked origin: ${origin}`);

        return callback(
          new Error(`Origin ${origin} is not allowed by CORS.`)
        );
      },

      credentials: true,

      methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
      ],

      allowedHeaders: [
        'Content-Type',
        'Authorization',
      ],
    })
  );

  // Resume uploads are handled by multer on their own route.
  // This limit applies to JSON bodies.
  app.use(express.json({ limit: '1mb' }));

  /**
   * Liveness check.
   *
   * Quick way to confirm that the deployed backend is running.
   */
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'career-roadmap-api',
      time: new Date().toISOString(),
    });
  });

  // API routes
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

  // Keep these last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;