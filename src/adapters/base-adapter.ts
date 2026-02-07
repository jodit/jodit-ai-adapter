import {
	tool,
	generateText,
	streamText,
	ModelMessage,
	ToolSet,
	Schema,
	jsonSchema,
	JSONSchema7,
	type LanguageModel,
	type JSONValue
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
	IImageGenerationResponse,
	StreamTextParams
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
			logger.error(error);
			return this.handleError(error);
		}
	}

	/**
	 * Request processing — builds params and routes to streaming/non-streaming
	 * Can be overridden by provider adapters for custom flow
	 */
	protected async processRequest(
		context: IAIRequestContext,
		signal: AbortSignal
	): Promise<IAIAssistantResult> {
		const model = this.resolveModel(context, this.getDefaultFallbackModel());
		const messages = this.buildMessages(context);
		const tools = this.buildTools(context.tools);

		const commonParams: StreamTextParams = {
			model: { modelId: model },
			messages,
			temperature: context.conversationOptions?.temperature,
			maxOutputTokens: 4000,
			abortSignal: signal,
			...(Object.keys(tools).length > 0 ? { tools } : {})
		};

		if (context.metadata?.stream === true) {
			return await this.handleStreaming(commonParams, context);
		}

		return await this.handleNonStreaming(commonParams, context);
	}


	/**
	 * Generate a unique response ID
	 */
	protected generateResponseId(prefix: string = 'resp'): string {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Handle streaming response using Vercel AI SDK streamText
	 */
	protected async handleStreaming(
		params: StreamTextParams,
		context: IAIRequestContext
	): Promise<IAIAssistantResult> {
		const result = streamText({
			model: this.createLanguageModel(params.model.modelId),
			messages: params.messages,
			temperature: params.temperature,
			abortSignal: params.abortSignal,
			maxOutputTokens: params.maxOutputTokens,
			tools: params.tools,
			providerOptions: this.getProviderOptions(context)
		});

		const responseId = this.generateResponseId('stream');
		const extractToolCalls = this.extractToolCalls.bind(this);
		const modelId = params.model.modelId;

		return {
			mode: 'stream',
			stream: (async function* (): AsyncGenerator<AIStreamEvent> {
				let fullText = '';

				try {
					yield {
						type: 'created',
						response: {
							responseId,
							content: '',
							finished: false
						}
					};

					for await (const part of result.fullStream) {
						switch (part.type) {
							case 'text-delta': {
								fullText += part.text;
								yield {
									type: 'text-delta',
									delta: part.text
								};
								break;
							}
						}
					}

					const finalResponse = await result.response;
					const resolvedToolCalls = await result.toolCalls;
					const toolCalls = extractToolCalls({ toolCalls: resolvedToolCalls });

					yield {
						type: 'completed',
						response: {
							responseId: finalResponse.id || responseId,
							content: fullText,
							toolCalls,
							finished: true,
							metadata: {
								model: modelId,
								usage: await result.usage
							}
						}
					};

					logger.debug('Stream completed', {
						responseId: finalResponse.id || responseId,
						textLength: fullText.length,
						toolCallsCount: toolCalls.length
					});
				} catch (error) {
					logger.error('Streaming error:', error);
					yield {
						type: 'error',
						error:
							error instanceof Error
								? error
								: new Error(String(error))
					};
				}
			})()
		};
	}

	/**
	 * Handle non-streaming response
	 */
	protected async handleNonStreaming(
		params: StreamTextParams,
		context: IAIRequestContext
	): Promise<IAIAssistantResult> {
		const result = await generateText({
			model: this.createLanguageModel(params.model.modelId),
			messages: params.messages,
			temperature: params.temperature,
			abortSignal: params.abortSignal,
			maxOutputTokens: params.maxOutputTokens,
			tools: params.tools,
			providerOptions: this.getProviderOptions(context)
		});

		const responseId = result.response.id;
		const extractedToolCalls = this.extractToolCalls(result);

		const response: IAIResponse = {
			responseId,
			content: result.text,
			toolCalls: extractedToolCalls,
			finished: true,
			metadata: {
				model: params.model.modelId,
				usage: result.usage
			}
		};

		this.validateResponse(response);

		logger.debug('Non-streaming response generated', {
			responseId,
			textLength: result.text.length,
			toolCallsCount: extractedToolCalls?.length || 0
		});

		return {
			mode: 'final',
			response
		};
	}

	/**
	 * Create a language model instance for the given model ID
	 * Must be implemented by each provider adapter
	 */
	protected abstract createLanguageModel(modelId: string): LanguageModel;

	/**
	 * Return the default fallback model ID for this provider
	 */
	protected abstract getDefaultFallbackModel(): string;

	/**
	 * Return provider-specific options for generateText/streamText
	 * Override in provider adapters (e.g. { openai: { instructions: ... } })
	 */
	protected getProviderOptions(
		_context: IAIRequestContext
	): Record<string, Record<string, JSONValue | undefined>> {
		return {};
	}

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

		if (context.instructions) {
			messages.push({
				role: 'system',
				content: context.instructions
			});
		}

		if (context.messages) {
			for (const msg of context.messages) {
				messages.push(...this.convertMessage(msg));
			}
		}

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

		if (message.role === 'tool' && message.toolResults) {
			for (const toolResult of message.toolResults) {
				result.push({
					role: 'tool',
					content: [
						{
							type: 'tool-result',
							toolCallId: toolResult.toolCallId,
							toolName: '',
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
