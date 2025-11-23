import { Router } from 'express';
import { imageGenerateHandler } from './handler';

const router = Router();

/**
 * POST /image/generate
 * Generate images from text prompts
 */
router.post('/generate', imageGenerateHandler);

export default router;
