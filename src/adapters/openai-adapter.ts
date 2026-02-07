import { createOpenAI } from '@ai-sdk/openai';
import {
	// streamText,
	generateText,
	generateImage
} from 'ai';
import type {
	IAIRequestContext,
	IAIAssistantResult,
	StreamTextParams,
	IAIResponse,
	IImageGenerationRequest,
	IImageGenerationResponse
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
			logger.info('OpenAI adapter initialized with proxy');
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
		const model = this.resolveModel(context, 'gpt-5.2');

		// Build messages for the AI
		const messages = this.buildMessages(context);

		// Build tools if any
		const tools = this.buildTools(context.tools);

		// Common parameters
		const commonParams: StreamTextParams = {
			model: {
				modelId: model
			},
			messages,
			temperature: context.conversationOptions?.temperature,
			maxOutputTokens: 4000,
			abortSignal: signal,
			...(Object.keys(tools).length > 0 ? { tools } : {})
		};

		// For streaming mode
		if (context.metadata?.stream === true) {
			return await this.handleStreaming(commonParams, context);
		}

		// For non-streaming mode
		return await this.handleNonStreaming(commonParams, context);
	}

	/**
	 * Handle streaming response
	 */
	private async handleStreaming(
		_: StreamTextParams,
		_context: IAIRequestContext
	): Promise<IAIAssistantResult> {
		// streamText returns a result compatible with AISDKStreamTextResult
		// const result: AISDKStreamTextResult = streamText(
		// params as Parameters<typeof streamText>[0]
		// ) as AISDKStreamTextResult;

		throw new Error('Streaming is not implemented yet for OpenAI adapter.');

		// async function* generateStream(
		// 	adapter: OpenAIAdapter
		// ): AsyncGenerator<AIStreamEvent> {
		// 	const responseId = adapter.generateResponseId('openai');
		// 	let fullText = '';
		// 	let isFirst = true;

		// 	try {
		// 		// Yield created event
		// 		yield {
		// 			type: 'created',
		// 			response: {
		// 				responseId,
		// 				content: '',
		// 				finished: false
		// 			}
		// 		};

		// 		// Stream text deltas
		// 		for await (const chunk of result.textStream) {
		// 			fullText += chunk;
		// 			yield {
		// 				type: 'text-delta',
		// 				delta: chunk
		// 			};

		// 			if (isFirst) {
		// 				isFirst = false;
		// 				logger.debug('First chunk received', { responseId });
		// 			}
		// 		}

		// 		// Wait for completion to get tool calls
		// 		const finalResult = await result.response;

		// 		// Build tool calls if any
		// 		const extractedToolCalls =
		// 			adapter.extractToolCalls(finalResult);
		// 		const toolCalls =
		// 			extractedToolCalls.length > 0
		// 				? adapter.convertToolCalls(
		// 						extractedToolCalls.map((tc) => ({
		// 							id: tc.toolCallId,
		// 							name: tc.toolName,
		// 							arguments: tc.args
		// 						}))
		// 					)
		// 				: undefined;

		// 		// Yield completed event
		// 		yield {
		// 			type: 'completed',
		// 			response: {
		// 				responseId,
		// 				content: fullText,
		// 				toolCalls,
		// 				finished: true,
		// 				metadata: {
		// 					model: params.model.modelId,
		// 					usage: finalResult.usage
		// 				}
		// 			}
		// 		};

		// 		logger.debug('Stream completed', {
		// 			responseId,
		// 			textLength: fullText.length,
		// 			toolCallsCount: toolCalls?.length || 0
		// 		});
		// 	} catch (error) {
		// 		logger.error('Streaming error:', error);
		// 		yield {
		// 			type: 'error',
		// 			error:
		// 				error instanceof Error
		// 					? error
		// 					: new Error(String(error))
		// 		};
		// 	}
		// }

		// return {
		// 	mode: 'stream',
		// 	stream: generateStream(this)
		// };
	}

	/**
	 * Handle non-streaming response
	 */
	private async handleNonStreaming(
		params: StreamTextParams,
		context: IAIRequestContext
	): Promise<IAIAssistantResult> {
		const result = await generateText({
			model: this.provider(params.model.modelId),
			messages: params.messages,
			temperature: params.temperature,
			abortSignal: params.abortSignal,
			maxOutputTokens: params.maxOutputTokens,
			tools: params.tools,
			providerOptions: {
				openai: {
					instructions: context.instructions,
					previousResponseId: context.parentMessageId
				}
			}
		});

		const responseId = result.response.id;

		// Build tool calls if any
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
	 * Generate images using Vercel AI SDK (OpenAI-specific)
	 */
	async handleImageGeneration(
		request: IImageGenerationRequest,
		signal?: AbortSignal
	): Promise<IImageGenerationResponse> {
		const model = request.model || this.config.defaultModel || 'dall-e-3';

		logger.debug('Generating image with OpenAI via Vercel AI SDK', {
			model,
			prompt: request.prompt.substring(0, 100),
			size: request.size,
			n: request.n
		});

		const result = await generateImage({
			model: this.provider.image(model),
			prompt: request.prompt,
			n: request.n || 1,
			size: request.size || '1024x1024',
			providerOptions: {
				openai: {
					...(request.quality ? { quality: request.quality } : {}),
					...(request.style ? { style: request.style } : {}),
					...(request.responseFormat
						? { response_format: request.responseFormat }
						: {}),
					...(request.user ? { user: request.user } : {})
				}
			},
			abortSignal: signal
		});

		logger.debug('Image generation completed', {
			imageCount: result.images.length,
			usage: result.usage
		});

		return {
			images: result.images.map((img) => ({
				b64_json: img.base64,
			})),
			created: Date.now(),
			metadata: {
				model,
				prompt: request.prompt,
				usage: result.usage
			}
		};
	}
}
