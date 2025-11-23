import type {
	IAIRequestContext,
	IAIAssistantResult,
	IAIResponse,
	AIStreamEvent,
	IToolCall
} from '../types';
import { logger } from '../helpers/logger';

/**
 * Base adapter configuration
 */
export interface BaseAdapterConfig {
	apiKey: string;
	apiEndpoint?: string;
	defaultModel?: string;
	httpProxy?: string;
	options?: Record<string, unknown>;
}

/**
 * Base adapter class for AI providers
 * Provides common functionality and structure for specific provider implementations
 */
export abstract class BaseAdapter {
	protected config: BaseAdapterConfig;

	constructor(config: BaseAdapterConfig) {
		if (!config.apiKey) {
			throw new Error('API key is required');
		}
		this.config = config;
	}

	/**
	 * Main entry point for handling AI requests
	 * This method orchestrates the request flow
	 */
	async handleRequest(
		context: IAIRequestContext,
		signal: AbortSignal
	): Promise<IAIAssistantResult> {
		try {
			logger.debug('Handling AI request', {
				conversationId: context.conversationId,
				mode: context.mode,
				messageCount: context.messages?.length || 0,
				toolCount: context.tools.length
			});

			// Delegate to provider-specific implementation
			return await this.processRequest(context, signal);
		} catch (error) {
			logger.error('Error handling AI request:', error);
			return this.handleError(error);
		}
	}

	/**
	 * Provider-specific request processing
	 * Must be implemented by each provider adapter
	 */
	protected abstract processRequest(
		context: IAIRequestContext,
		signal: AbortSignal
	): Promise<IAIAssistantResult>;

	/**
	 * Handle errors gracefully
	 */
	protected handleError(error: unknown): IAIAssistantResult {
		let errorMessage = 'An error occurred while communicating with AI provider.';

		if (error instanceof Error) {
			errorMessage = error.message;
		}

		logger.error('Adapter error:', { error: errorMessage });

		return {
			mode: 'final',
			response: {
				responseId: `error_${Date.now()}`,
				content: `❌ Error: ${errorMessage}`,
				finished: true,
				metadata: {
					error: true
				}
			}
		};
	}

	/**
	 * Convert tool calls to the format expected by Jodit
	 */
	protected convertToolCalls(
		toolCalls: Array<{
			id: string;
			name: string;
			arguments: Record<string, unknown>;
		}>
	): IToolCall[] {
		return toolCalls.map((tc) => ({
			id: tc.id,
			name: tc.name,
			arguments: tc.arguments,
			status: 'pending' as const
		}));
	}

	/**
	 * Generate a unique response ID
	 */
	protected generateResponseId(prefix: string = 'resp'): string {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Validate response before returning to Jodit
	 */
	protected validateResponse(response: IAIResponse): void {
		if (!response.responseId) {
			throw new Error('Response missing responseId');
		}

		if (response.content === undefined) {
			throw new Error('Response missing content');
		}

		if (response.finished === undefined) {
			throw new Error('Response missing finished flag');
		}
	}

	/**
	 * Create streaming response generator
	 * Helper method for providers that support streaming
	 */
	protected async *createStreamGenerator<T>(
		streamSource: AsyncIterable<T>,
		transformChunk: (chunk: T) => AIStreamEvent | null
	): AsyncGenerator<AIStreamEvent> {
		try {
			for await (const chunk of streamSource) {
				const event = transformChunk(chunk);
				if (event) {
					yield event;
				}
			}
		} catch (error) {
			logger.error('Stream error:', error);
			yield {
				type: 'error',
				error:
					error instanceof Error
						? error
						: new Error(String(error))
			};
		}
	}
}
