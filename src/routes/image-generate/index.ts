import { Router } from 'express';
import type { AppConfig } from '../../types';
import { imageGenerateHandler } from './handler';

export function createImageGenerateRouter(config: AppConfig): Router {
	const router = Router();

	/**
	 * POST /image/generate
	 * Generate images from text prompts
	 */
	router.post('/generate', imageGenerateHandler(config));

	return router;
}
