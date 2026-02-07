import type { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import type { AppConfig } from '../../types';
import { AdapterFactory } from '../../adapters/adapter-factory';

/**
 * Provider info handler
 * Returns list of configured providers and supported provider types
 */
export const aiProvidersHandler = (config: AppConfig) =>
	asyncHandler(async (_req: Request, res: Response): Promise<void> => {
		const providersInfo = Object.entries(config.providers).map(
			([name, providerConfig]) => ({
				name,
				type: providerConfig.type,
				defaultModel: providerConfig.defaultModel,
				configured: !!providerConfig.apiKey
			})
		);

		res.json({
			success: true,
			providers: providersInfo,
			supported: AdapterFactory.getSupportedProviders()
		});
	});
