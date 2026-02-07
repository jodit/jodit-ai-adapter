import { Router } from 'express';
import type { AppConfig } from '../../types';
import { aiProvidersHandler } from './handler';

export function createAiProvidersRouter(config: AppConfig): Router {
	const router = Router();

	/**
	 * GET /providers
	 * Get available AI providers
	 */
	router.get('/', aiProvidersHandler(config));

	return router;
}
