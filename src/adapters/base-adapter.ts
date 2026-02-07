import {
	tool,
	ModelMessage,
	ToolSet,
	Schema,
	jsonSchema,
	JSONSchema7
} from 'ai';
import type {
	IAIRequestContext,
	IAIAssistantResult,
	IAIResponse,
	AIStreamEvent,
	IAIMessage,
	IToolDefinition,
	IToolParameter,
	IToolCall,
	IImageGenerationRequest,
	IImageGenerationResponse
} from '../types';
import { logger } from '../helpers/logger';

type GenerateTextResult = { toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }> };

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
	 * Generate images — default implementation throws "not supported"
	 * Override in provider adapters that support image generation
	 */
	async handleImageGeneration(
		_request: IImageGenerationRequest,
		_signal?: AbortSignal
	): Promise<IImageGenerationResponse> {
		throw new Error('Image generation is not supported by this provider');
	}

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

	/**
	 * Resolve the model ID from context, config default, or a fallback
	 */
	protected resolveModel(context: IAIRequestContext, fallback: string): string {
		return context.conversationOptions?.model || this.config.defaultModel || fallback;
	}

	/**
	 * Build messages array for AI SDK
	 * Converts Jodit IAIMessage[] to Vercel AI SDK ModelMessage[]
	 */
	protected buildMessages(context: IAIRequestContext): ModelMessage[] {
		const messages: ModelMessage[] = [];

		// Add system instructions if provided
		if (context.instructions) {
			messages.push({
				role: 'system',
				content: context.instructions
			});
		}

		// Add conversation messages
		if (context.messages) {
			for (const msg of context.messages) {
				messages.push(...this.convertMessage(msg));
			}
		}

		// Add selection contexts as user messages if any
		if (context.selectionContexts && context.selectionContexts.length > 0) {
			const contextText = context.selectionContexts
				.map((ctx, idx) => `Context ${idx + 1}:\n${ctx.html}`)
				.join('\n\n');

			messages.push({
				role: 'user',
				content: `Here is the selected content from the editor:\n\n${contextText}`
			});
		}

		return messages;
	}

	/**
	 * Convert Jodit message to AI SDK format
	 * Returns ModelMessage[] compatible with Vercel AI SDK
	 */
	protected convertMessage(message: IAIMessage): ModelMessage[] {
		const result: ModelMessage[] = [];

		// Handle tool result messages
		if (message.role === 'tool' && message.toolResults) {
			for (const toolResult of message.toolResults) {
				result.push({
					role: 'tool',
					content: [
						{
							type: 'tool-result',
							toolCallId: toolResult.toolCallId,
							toolName: '', // Tool name is not provided in toolResults, can be enhanced if needed,
							output:
								'error' in toolResult
									? {
											type: 'text',
											value: `Error: ${toolResult.error}`
										}
									: { type: 'json', value: toolResult.result }
						}
					]
				});
			}

			return result;
		}

		// Handle regular messages
		if (message.content && message.role !== 'tool') {
			const aiMessage: ModelMessage = {
				role: message.role,
				content: message.content
			};

			result.push(aiMessage);
		}

		return result;
	}

	/**
	 * Build tools definition for AI SDK
	 * Converts Jodit IToolDefinition[] to Vercel AI SDK ToolSet
	 */
	protected buildTools(tools: readonly IToolDefinition[]): ToolSet {
		if (tools.length === 0) {
			return {};
		}

		const aiTools: ToolSet = {};

		for (const meta of tools) {
			aiTools[meta.name] = tool({
				description: meta.description,
				inputSchema: this.buildToolParameters(meta)
			});
		}

		return aiTools;
	}

	/**
	 * Build tool parameters schema
	 */
	private buildToolParameters(toolDef: IToolDefinition): Schema {
		const properties: Record<string, JSONSchema7> = {};
		const requiredParams: string[] = [];

		for (const param of toolDef.parameters) {
			properties[param.name] = this.__buildNestedToolParameters(param);

			if (param.required) {
				requiredParams.push(param.name);
			}
		}

		return jsonSchema({
			type: 'object',
			properties,
			required: requiredParams
		});
	}

	private __buildNestedToolParameters(param: IToolParameter): JSONSchema7 {
		const schema: JSONSchema7 = {
			type: param.type,
			description: param.description
		};

		if (param.enum) {
			schema.enum = [...param.enum];
		}

		if (param.parameters && param.parameters.length > 0) {
			const nestedProperties: Record<string, JSONSchema7> = {};
			const nestedRequired: string[] = [];

			for (const nestedParam of param.parameters) {
				nestedProperties[nestedParam.name] =
					this.__buildNestedToolParameters(nestedParam);

				if (nestedParam.required) {
					nestedRequired.push(nestedParam.name);
				}
			}

			schema.type = 'object';
			schema.properties = nestedProperties;
			schema.required = nestedRequired;
		}

		return schema;
	}

	/**
	 * Extract tool calls from AI SDK response
	 * Converts Vercel AI SDK toolCalls to Jodit IToolCall[]
	 */
	protected extractToolCalls(response: GenerateTextResult): Array<IToolCall> {
		const toolCalls = response.toolCalls;
		if (!Array.isArray(toolCalls)) {
			return [];
		}

		return toolCalls.map((tc): IToolCall => {
			return {
				id: tc.toolCallId,
				name: tc.toolName,
				arguments: tc.input as Record<string, unknown>,
				status: 'pending'
			};
		});
	}
}
