import type { Response } from 'express';
import asyncHandler from 'express-async-handler';
import Boom from '@hapi/boom';
import { z } from 'zod';
import type {
	AppConfig,
	IAIRequestContext,
	IAIResponse,
	UsageStats,
	AuthenticatedRequest,
	ProviderUsage
} from '../../types';
import { AdapterFactory } from '../../adapters/adapter-factory';
import { logger } from '../../helpers/logger';

/**
 * Zod schemas for validation
 */
const ToolParameterSchema = z.object({
	name: z.string(),
	type: z.string(),
	description: z.string(),
	required: z.boolean(),
	enum: z.array(z.string()).optional(),
	default: z.unknown().optional()
});

const ToolDefinitionSchema = z.object({
	name: z.string(),
	description: z.string(),
	parameters: z.array(ToolParameterSchema)
});

const SelectionContextSchema = z.object({
	html: z.string(),
	blockIndex: z.number().optional(),
	rangeInfo: z
		.object({
			startContainer: z.string(),
			startOffset: z.number(),
			endContainer: z.string(),
			endOffset: z.number()
		})
		.optional()
});

const MessageSchema = z.object({
	id: z.string(),
	role: z.enum(['user', 'assistant', 'system', 'tool']),
	content: z.string(),
	timestamp: z.number(),
	toolCalls: z.array(z.unknown()).optional(),
	toolResults: z.array(z.unknown()).optional(),
	artifacts: z.array(z.unknown()).optional()
});

const ConversationOptionsSchema = z.object({
	model: z.string().optional(),
	temperature: z.number().optional()
});

/**
 * Request body schema validation
 */
const RequestSchema = z.object({
	provider: z.string().min(1),
	context: z.object({
		mode: z.enum(['full', 'incremental']),
		messages: z.array(MessageSchema).optional(),
		parentMessageId: z.string().optional(),
		tools: z.array(ToolDefinitionSchema),
		selectionContexts: z.array(SelectionContextSchema).optional(),
		conversationOptions: ConversationOptionsSchema.optional(),
		instructions: z.string().optional(),
		metadata: z.record(z.string(), z.unknown()).optional()
	})
});

/**
 * Adapt validated context to IAIRequestContext
 * This is necessary because Zod infers arrays as unknown[] but our interface expects specific types
 */
function adaptContext(
	validatedContext: z.infer<typeof RequestSchema>['context']
): IAIRequestContext {
	return {
		mode: validatedContext.mode,
		messages: validatedContext.messages,
		parentMessageId: validatedContext.parentMessageId,
		tools: validatedContext.tools,
		selectionContexts: validatedContext.selectionContexts,
		conversationOptions: validatedContext.conversationOptions,
		instructions: validatedContext.instructions,
		metadata: validatedContext.metadata
	} as IAIRequestContext;
}

/**
 * Track usage statistics
 */
async function trackUsage(
	config: AppConfig,
	params: {
		userId: string;
		apiKey: string;
		provider: string;
		context: z.infer<typeof RequestSchema>['context'];
		response: IAIResponse;
		startTime: number;
	}
): Promise<void> {
	if (!config.onUsage) {
		return;
	}

	const duration = Date.now() - params.startTime;

	const usage = params.response.metadata?.usage as ProviderUsage | undefined;

	const stats: UsageStats = {
		userId: params.userId,
		apiKey: params.apiKey,
		provider: params.provider,
		model: params.context.conversationOptions?.model || 'unknown',
		responseId: params.response.responseId,
		promptTokens: usage?.prompt_tokens || usage?.input_tokens,
		completionTokens: usage?.completion_tokens || usage?.output_tokens,
		totalTokens: usage?.total_tokens,
		timestamp: params.startTime,
		duration,
		metadata: params.response.metadata
	};

	logger.debug('Tracking usage', {
		userId: stats.userId,
		provider: stats.provider,
		model: stats.model,
		totalTokens: stats.totalTokens
	});

	await config.onUsage(stats);
}

/**
 * AI request handler factory
 * Processes AI requests through the configured provider
 */
export const aiRequestHandler = (config: AppConfig) =>
	asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
		// Validate request body
		const parseResult = RequestSchema.safeParse(req.body);

		if (!parseResult.success) {
			throw Boom.badRequest('Invalid request body', {
				errors: parseResult.error.issues
			});
		}

		const { provider, context } = parseResult.data;

		// Check if provider is configured
		const providerConfig = config.providers[provider];
		if (!providerConfig) {
			throw Boom.badRequest(`Provider not configured: ${provider}`);
		}

		// Check if provider is supported and enabled
		if (!AdapterFactory.isProviderSupported(provider, providerConfig)) {
			throw Boom.badRequest(`Unsupported or disabled provider: ${provider}`);
		}

		// Create adapter
		const adapter = AdapterFactory.createAdapter(provider, providerConfig);

		// Create abort controller for timeout
		const abortController = new AbortController();
		const timeoutId = setTimeout(() => {
			abortController.abort();
		}, config.requestTimeout);

		const startTime = Date.now();

		try {
			// Handle the request
			const adaptedContext = adaptContext(context);

			const result = await adapter.handleRequest(
				adaptedContext,
				abortController.signal
			);

			// For streaming response
			if (result.mode === 'stream') {
				res.setHeader('Content-Type', 'text/event-stream');
				res.setHeader('Cache-Control', 'no-cache');
				res.setHeader('Connection', 'keep-alive');

				let finalResponse: IAIResponse | null = null;

				// Stream events
				for await (const event of result.stream) {
					const data = JSON.stringify(event);
					res.write(`event: ${event.type}\n`);
					res.write(`data: ${data}\n\n`);

					// Capture completed event for usage tracking
					if (event.type === 'completed') {
						finalResponse = event.response;
					}

					// Flush if available (compatibility with different Node versions)
					const flushableRes = res as {
						flush?: () => void;
					};
					if (typeof flushableRes.flush === 'function') {
						flushableRes.flush();
					}
				}

				res.end();

				// Track usage after stream completes
				if (finalResponse && config.onUsage) {
					await trackUsage(config, {
						userId: req.userId || 'anonymous',
						apiKey: req.apiKey || '',
						provider,
						context: parseResult.data.context,
						response: finalResponse,
						startTime
					}).catch((error) => {
						logger.error('Usage tracking error:', error);
					});
				}
			} else {
				// For final response
				res.json({
					success: true,
					result: result.response
				});

				// Track usage for non-streaming response
				if (config.onUsage) {
					await trackUsage(config, {
						userId: req.userId || 'anonymous',
						apiKey: req.apiKey || '',
						provider,
						context: parseResult.data.context,
						response: result.response,
						startTime
					}).catch((error) => {
						logger.error('Usage tracking error:', error);
					});
				}
			}
		} finally {
			clearTimeout(timeoutId);
		}
	});
