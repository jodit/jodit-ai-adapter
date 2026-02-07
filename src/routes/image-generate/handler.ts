import type { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Boom from '@hapi/boom';
import type {
	AuthenticatedRequest,
	IImageGenerationRequest,
	IImageGenerationAdapter
} from '../../types';
import { OpenAIImageAdapter } from '../../adapters/openai-image-adapter';
import { logger } from '../../helpers/logger';

/**
 * Image generation handler
 * Processes image generation requests through configured providers
 */
export const imageGenerateHandler = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const authReq = req as AuthenticatedRequest;
		const { provider, request: imageRequest } = req.body as {
			provider: string;
			request: IImageGenerationRequest;
		};

		// Validate request
		if (!provider) {
			throw Boom.badRequest('Provider is required');
		}

		if (!imageRequest?.prompt) {
			throw Boom.badRequest('Image generation request with prompt is required');
		}

		logger.info('Image generation request received', {
			provider,
			promptLength: imageRequest.prompt.length,
			size: imageRequest.size,
			n: imageRequest.n,
			userId: authReq.userId
		});

		// Get provider configuration
		const config = req.app.locals.config;
		const providerConfig = config.providers[provider];

		if (!providerConfig) {
			throw Boom.badRequest(`Provider '${provider}' is not configured`);
		}

		// Create adapter based on provider
		let adapter: IImageGenerationAdapter;

		try {
			switch (providerConfig.type) {
				case 'openai':
					adapter = new OpenAIImageAdapter({
						apiKey: providerConfig.apiKey || '',
						apiEndpoint: providerConfig.apiEndpoint,
						defaultModel: providerConfig.defaultModel || 'dall-e-3',
						httpProxy: providerConfig.httpProxy
					});
					break;

				default:
					throw Boom.badRequest(
						`Image generation not supported for provider type: ${providerConfig.type}`
					);
			}
		} catch (error) {
			logger.error('Failed to create image generation adapter:', error);
			throw Boom.badImplementation('Failed to initialize image generation adapter');
		}

		// Create abort controller for request cancellation
		const abortController = new AbortController();

		// Handle connection close
		req.on('close', () => {
			if (!res.writableEnded) {
				logger.warn('Client disconnected, aborting image generation');
				abortController.abort();
			}
		});

		try {
			const startTime = Date.now();

			// Generate image
			const result = await adapter.generateImage(imageRequest, abortController.signal);

			const duration = Date.now() - startTime;

			logger.info('Image generation completed', {
				provider,
				imageCount: result.images.length,
				duration,
				userId: authReq.userId
			});

			// Track usage if callback is configured
			if (config.onUsage && authReq.apiKey) {
				try {
					await config.onUsage({
						userId: authReq.userId || 'anonymous',
						apiKey: authReq.apiKey,
						provider,
						model: result.metadata?.model || 'unknown',
						conversationId: 'image-generation',
						responseId: `img-${Date.now()}`,
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

			// Send response
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
	}
);
