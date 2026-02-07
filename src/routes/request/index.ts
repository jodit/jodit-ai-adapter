import { Router } from 'express';
import type { AppConfig } from '../../types';
import { aiRequestHandler } from './handler';

export function createAiRequestRouter(config: AppConfig): Router {
	const router = Router();

	/**
	 * POST /request
	 * Process AI request
	 */
	router.post('/', aiRequestHandler(config));

	return router;
}
