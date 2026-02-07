import { Router } from 'express';
import { healthHandler } from './handler';

const router = Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/', healthHandler);

export default router;
