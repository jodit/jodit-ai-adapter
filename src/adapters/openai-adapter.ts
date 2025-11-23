import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText } from 'ai';
import type {
	IAIRequestContext,
	IAIAssistantResult,
	IAIMessage,
	IToolDefinition,
	AIStreamEvent,
	StreamTextParams,
	AISDKToolDefinition,
	AISDKToolParameters,
	AISDKPropertyDefinition,
	AISDKStreamTextResult,
	AISDKGenerateTextResult
} from '../types';
import { BaseAdapter, type BaseAdapterConfig } from './base-adapter';
import { logger } from '../helpers/logger';
import { createFetch } from '../helpers/proxy';

/**
 * OpenAI adapter using Vercel AI SDK
 */
export class OpenAIAdapter extends BaseAdapter {
	private provider: ReturnType<typeof createOpenAI>;
	private customFetch?: typeof fetch;

	constructor(config: BaseAdapterConfig) {
		super(config);

		// Create fetch with proxy support if configured
		if (config.httpProxy) {
			this.customFetch = createFetch(config.httpProxy);
			logger.info('OpenAI adapter initialized with proxy', {
				proxy: config.httpProxy
			});
		}

		// Initialize OpenAI provider with Vercel AI SDK
		this.provider = createOpenAI({
			apiKey: config.apiKey,
			baseURL: config.apiEndpoint || 'https://api.openai.com/v1',
			fetch: this.customFetch
		});
	}

	protected async processRequest(
		context: IAIRequestContext,
		signal: AbortSignal
	): Promise<IAIAssistantResult> {
		// Determine model to use
		const model =
			context.conversationOptions?.model ||
			this.config.defaultModel ||
			'gpt-4o';

		// Build messages for the AI
		const messages = this.buildMessages(context);

		// Build tools if any
		const tools = this.buildTools(context.tools);

		// Common parameters
		const commonParams = {
			model: this.provider(model),
			messages,
			temperature: context.conversationOptions?.temperature,
			maxTokens: 4000,
			abortSignal: signal,
			...(Object.keys(tools).length > 0 ? { tools } : {})
		};

		// For streaming mode
		if (context.metadata?.stream !== false) {
			return await this.handleStreaming(commonParams, context);
		}

		// For non-streaming mode
		return await this.handleNonStreaming(commonParams, context);
	}

	/**
	 * Extract tool calls from AI SDK response
	 */
	private extractToolCalls(response: Record<string, unknown>): Array<{
		toolCallId: string;
		toolName: string;
		args: Record<string, unknown>;
	}> {
		const toolCalls = response.toolCalls;
		if (!Array.isArray(toolCalls)) {
			return [];
		}

		return toolCalls.map((tc: unknown) => {
			const call = tc as Record<string, unknown>;
			return {
				toolCallId: String(call.toolCallId || ''),
				toolName: String(call.toolName || ''),
				args: (call.args as Record<string, unknown>) || {}
			};
		});
	}

	/**
	 * Handle streaming response
	 */
	private async handleStreaming(
		params: StreamTextParams,
		_context: IAIRequestContext
	): Promise<IAIAssistantResult> {
		// streamText returns a result compatible with AISDKStreamTextResult
		const result: AISDKStreamTextResult = streamText(
			params as Parameters<typeof streamText>[0]
		) as AISDKStreamTextResult;

		async function* generateStream(
			adapter: OpenAIAdapter
		): AsyncGenerator<AIStreamEvent> {
			const responseId = adapter.generateResponseId('openai');
			let fullText = '';
			let isFirst = true;

			try {
				// Yield created event
				yield {
					type: 'created',
					response: {
						responseId,
						content: '',
						finished: false
					}
				};

				// Stream text deltas
				for await (const chunk of result.textStream) {
					fullText += chunk;
					yield {
						type: 'text-delta',
						delta: chunk
					};

					if (isFirst) {
						isFirst = false;
						logger.debug('First chunk received', { responseId });
					}
				}

				// Wait for completion to get tool calls
				const finalResult = await result.response;

				// Build tool calls if any
				const extractedToolCalls =
					adapter.extractToolCalls(finalResult);
				const toolCalls =
					extractedToolCalls.length > 0
						? adapter.convertToolCalls(
								extractedToolCalls.map((tc) => ({
									id: tc.toolCallId,
									name: tc.toolName,
									arguments: tc.args
								}))
							)
						: undefined;

				// Yield completed event
				yield {
					type: 'completed',
					response: {
						responseId,
						content: fullText,
						toolCalls,
						finished: true,
						metadata: {
							model: params.model.modelId,
							usage: finalResult.usage
						}
					}
				};

				logger.debug('Stream completed', {
					responseId,
					textLength: fullText.length,
					toolCallsCount: toolCalls?.length || 0
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
		}

		return {
			mode: 'stream',
			stream: generateStream(this)
		};
	}

	/**
	 * Handle non-streaming response
	 */
	private async handleNonStreaming(
		params: StreamTextParams,
		_context: IAIRequestContext
	): Promise<IAIAssistantResult> {
		// generateText returns a result compatible with AISDKGenerateTextResult
		const result: AISDKGenerateTextResult = (await generateText(
			params as Parameters<typeof generateText>[0]
		)) as unknown as AISDKGenerateTextResult;

		const responseId = this.generateResponseId('openai');

		// Build tool calls if any
		const extractedToolCalls = this.extractToolCalls(result);
		const toolCalls =
			extractedToolCalls.length > 0
				? this.convertToolCalls(
						extractedToolCalls.map((tc) => ({
							id: tc.toolCallId,
							name: tc.toolName,
							arguments: tc.args
						}))
					)
				: undefined;

		const response = {
			responseId,
			content: result.text,
			toolCalls,
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
			toolCallsCount: toolCalls?.length || 0
		});

		return {
			mode: 'final',
			response
		};
	}

	/**
	 * Build messages array for AI SDK
	 * Returns CoreMessage[] compatible with Vercel AI SDK
	 */
	private buildMessages(context: IAIRequestContext): unknown[] {
		const messages: unknown[] = [];

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
	 * Returns CoreMessage[] compatible with Vercel AI SDK
	 */
	private convertMessage(message: IAIMessage): unknown[] {
		const result: unknown[] = [];

		// Handle tool result messages
		if (message.role === 'tool' && message.toolResults) {
			for (const toolResult of message.toolResults) {
				result.push({
					role: 'tool',
					toolCallId: toolResult.toolCallId,
					content: toolResult.error
						? `Error: ${toolResult.error}`
						: JSON.stringify(toolResult.result)
				});
			}
			return result;
		}

		// Handle regular messages
		if (message.content && message.role !== 'tool') {
			const aiMessage: Record<string, unknown> = {
				role: message.role,
				content: message.content
			};

			// Add tool calls if present
			if (message.toolCalls && message.toolCalls.length > 0) {
				const toolInvocations = message.toolCalls.map((tc) => ({
					state: 'result',
					toolCallId: tc.id,
					toolName: tc.name,
					args: tc.arguments,
					result: tc.result?.result
				}));
				aiMessage.toolInvocations = toolInvocations;
			}

			result.push(aiMessage);
		}

		return result;
	}

	/**
	 * Build tools definition for AI SDK
	 */
	private buildTools(
		tools: readonly IToolDefinition[]
	): Record<string, AISDKToolDefinition> {
		if (tools.length === 0) {
			return {};
		}

		const aiTools: Record<string, AISDKToolDefinition> = {};

		for (const tool of tools) {
			aiTools[tool.name] = {
				description: tool.description,
				parameters: this.buildToolParameters(tool)
			};
		}

		return aiTools;
	}

	/**
	 * Build tool parameters schema
	 */
	private buildToolParameters(tool: IToolDefinition): AISDKToolParameters {
		const properties: Record<string, AISDKPropertyDefinition> = {};
		const requiredParams: string[] = [];

		for (const param of tool.parameters) {
			properties[param.name] = {
				type: param.type,
				description: param.description
			};

			if (param.enum) {
				properties[param.name].enum = [...param.enum];
			}

			if (param.required) {
				requiredParams.push(param.name);
			}
		}

		return {
			type: 'object',
			properties,
			required: requiredParams
		};
	}
}
