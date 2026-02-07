import type { Request, Response } from 'express';
import { AdapterFactory } from '../../adapters/adapter-factory';

/**
 * Health check handler
 * Returns service status and supported providers
 */
export const healthHandler = (_req: Request, res: Response): void => {
	res.json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		providers: AdapterFactory.getSupportedProviders()
	});
};
