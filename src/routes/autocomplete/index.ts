import { Router } from 'express';
import type { AppConfig } from '../../types';
import { autocompleteHandler } from './handler';

export function createAutocompleteRouter(config: AppConfig): Router {
	const router = Router();

	/**
	 * POST /autocomplete?query=...
	 * Generate autocomplete suggestions
	 */
	router.post('/', autocompleteHandler(config));

	return router;
}
