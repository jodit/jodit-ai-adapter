import { createOpenAI } from '@ai-sdk/openai';
import { generateImage, type LanguageModel } from 'ai';
import type {
	IAIRequestContext,
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

	protected createLanguageModel(modelId: string): LanguageModel {
		return this.provider(modelId);
	}

	protected getDefaultFallbackModel(): string {
		return 'gpt-5.2';
	}

	protected override getProviderOptions(
		context: IAIRequestContext
	): Record<string, Record<string, string | undefined>> {
		return {
			openai: {
				instructions: context.instructions,
				previousResponseId: context.parentMessageId
			}
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
