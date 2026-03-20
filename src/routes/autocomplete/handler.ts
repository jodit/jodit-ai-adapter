import type { RequestHandler, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Boom from '@hapi/boom';
import type { AppConfig, AuthenticatedRequest, ProviderUsage } from '../../types';
import { AdapterFactory } from '../../adapters/adapter-factory';
import { logger } from '../../helpers/logger';
import { AutocompleteBodySchema, AutocompleteQuerySchema } from './schema';

/**
 * Autocomplete handler factory
 * Processes autocomplete requests using structured output (non-streaming)
 */
export const autocompleteHandler = (config: AppConfig): RequestHandler =>
	asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
		// Validate query parameter
		const queryResult = AutocompleteQuerySchema.safeParse(req.query);
		if (!queryResult.success) {
			throw Boom.badRequest('Missing or invalid "query" parameter', {
				errors: queryResult.error.issues
			});
		}

		// Validate body (provider + optional context)
		const bodyResult = AutocompleteBodySchema.safeParse(req.body);
		if (!bodyResult.success) {
			throw Boom.badRequest('Invalid request body', {
				errors: bodyResult.error.issues
			});
		}

		const { query } = queryResult.data;
		const { provider, context } = bodyResult.data;

		// Check if provider is configured
		const providerConfig = config.providers[provider];
		if (!providerConfig) {
			throw Boom.badRequest(`Provider not configured: ${provider}`);
		}

		// Check if provider is supported and enabled
		if (!AdapterFactory.isProviderSupported(provider, providerConfig)) {
			throw Boom.badRequest(
				`Unsupported or disabled provider: ${provider}`
			);
		}

		const adapter = AdapterFactory.createAdapter(provider, providerConfig);

		// Create abort controller for timeout
		const abortController = new AbortController();
		const timeoutId = setTimeout(() => {
			abortController.abort();
		}, config.requestTimeout);

		const startTime = Date.now();

		try {
			const result = await adapter.handleAutocomplete(
				{
					query,
					instructions: context?.instructions,
					model: context?.conversationOptions?.model,
					temperature: context?.conversationOptions?.temperature,
					maxSuggestions: context?.maxSuggestions,
					metadata: context?.metadata
				},
				abortController.signal
			);

			res.json({
				success: true,
				result
			});

			// Track usage
			if (config.onUsage && req.apiKey) {
				const usage = (result.metadata?.usage ?? {}) as ProviderUsage;
				const model = (result.metadata?.model || 'unknown') as string;

				try {
					await config.onUsage({
						userId: req.userId || 'anonymous',
						apiKey: req.apiKey,
						provider,
						model,
						responseId: result.responseId,
						promptTokens: usage.inputTokens ?? usage.promptTokens,
						completionTokens: usage.outputTokens ?? usage.completionTokens,
						totalTokens: usage.totalTokens,
						timestamp: startTime,
						duration: Date.now() - startTime,
						metadata: result.metadata,
						credits: adapter.calculateCredits(model, usage)
					});
				} catch (usageError) {
					logger.error('Usage tracking error:', usageError);
				}
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw Boom.clientTimeout('Autocomplete request timed out');
			}

			throw Boom.internal(
				error instanceof Error ? error.message : 'Autocomplete failed'
			);
		} finally {
			clearTimeout(timeoutId);
		}
	});
