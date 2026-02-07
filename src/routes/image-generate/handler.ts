import type { Response } from 'express';
import asyncHandler from 'express-async-handler';
import Boom from '@hapi/boom';
import type { AppConfig, AuthenticatedRequest } from '../../types';
import { AdapterFactory } from '../../adapters/adapter-factory';
import { logger } from '../../helpers/logger';
import { ImageGenerationAPIRequestSchema } from './schema';

/**
 * Image generation handler factory
 * Processes image generation requests through configured providers
 */
export const imageGenerateHandler = (config: AppConfig) =>
	asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
		const parseResult = ImageGenerationAPIRequestSchema.safeParse(req.body);

		if (!parseResult.success) {
			throw Boom.badRequest('Invalid request body', {
				errors: parseResult.error.issues
			});
		}

		const { provider, request: imageRequest } = parseResult.data;

		logger.info('Image generation request received', {
			provider,
			promptLength: imageRequest.prompt.length,
			size: imageRequest.size,
			n: imageRequest.n,
			userId: req.userId
		});

		// Check if provider is configured
		const providerConfig = config.providers[provider];
		if (!providerConfig) {
			throw Boom.badRequest(`Provider '${provider}' is not configured`);
		}

		// Create adapter via factory
		if (!AdapterFactory.isProviderSupported(provider)) {
			throw Boom.badRequest(`Unsupported provider: ${provider}`);
		}

		const adapter = AdapterFactory.createAdapter(provider, providerConfig);

		// Create abort controller for request cancellation
		const abortController = new AbortController();

		res.on('close', () => {
			if (!res.writableFinished) {
				logger.warn('Client disconnected, aborting image generation');
				abortController.abort();
			}
		});

		const startTime = Date.now();

		try {
			const result = await adapter.handleImageGeneration(
				imageRequest,
				abortController.signal
			);

			const duration = Date.now() - startTime;

			logger.info('Image generation completed', {
				provider,
				imageCount: result.images.length,
				duration,
				userId: req.userId
			});

			// Track usage if callback is configured
			if (config.onUsage && req.apiKey) {
				const usage = result.metadata?.usage as {
					inputTokens?: number;
					outputTokens?: number;
					totalTokens?: number;
				} | undefined;

				try {
					await config.onUsage({
						userId: req.userId || 'anonymous',
						apiKey: req.apiKey,
						provider,
						model: result.metadata?.model || 'unknown',
						responseId: `img-${Date.now()}`,
						promptTokens: usage?.inputTokens,
						completionTokens: usage?.outputTokens,
						totalTokens: usage?.totalTokens,
						timestamp: Date.now(),
						duration,
						metadata: {
							imageCount: result.images.length,
							size: imageRequest.size,
							prompt: imageRequest.prompt
						}
					});
				} catch (usageError) {
					logger.error('Failed to track usage:', usageError);
				}
			}

			res.json({
				success: true,
				result
			});
		} catch (error) {
			logger.error('Image generation failed:', error);

			if (error instanceof Error && error.name === 'AbortError') {
				throw Boom.clientTimeout('Image generation request was cancelled');
			}

			throw Boom.internal(
				error instanceof Error ? error.message : 'Image generation failed'
			);
		}
	});
