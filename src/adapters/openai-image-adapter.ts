import type {
	IImageGenerationAdapter,
	IImageGenerationRequest,
	IImageGenerationResponse
} from '../types';
import { logger } from '../helpers/logger';
import { createFetch } from '../helpers/proxy';

/**
 * OpenAI image generation adapter configuration
 */
export interface OpenAIImageAdapterConfig {
	/** OpenAI API key */
	apiKey: string;

	/** Custom API endpoint (optional) */
	apiEndpoint?: string;

	/** Default model for image generation */
	defaultModel?: string;

	/** HTTP/SOCKS5 proxy URL (optional) */
	httpProxy?: string;
}

/**
 * OpenAI image generation adapter
 * Supports DALL-E models for generating images from text prompts
 */
export class OpenAIImageAdapter implements IImageGenerationAdapter {
	private apiKey: string;
	private apiEndpoint?: string;
	private defaultModel: string;
	private customFetch: typeof fetch;

	constructor(config: OpenAIImageAdapterConfig) {
		if (!config.apiKey) {
			throw new Error('API key is required');
		}

		this.apiKey = config.apiKey;
		this.apiEndpoint = config.apiEndpoint;
		this.defaultModel = config.defaultModel || 'dall-e-3';

		// Create fetch with proxy support if configured
		this.customFetch = createFetch(config.httpProxy);
		if (config.httpProxy) {
			logger.info('Image generation adapter initialized with proxy', {
				proxy: config.httpProxy
			});
		}
	}

	/**
	 * Generate images using OpenAI DALL-E
	 */
	async generateImage(
		request: IImageGenerationRequest,
		signal?: AbortSignal
	): Promise<IImageGenerationResponse> {
		try {
			// Use model from request or default
			const model = request.model || this.defaultModel;

			logger.debug('Generating image with OpenAI', {
				model,
				prompt: request.prompt.substring(0, 100),
				size: request.size,
				n: request.n,
				quality: request.quality,
				style: request.style
			});

			// Prepare request parameters
			const params: Record<string, unknown> = {
				model,
				prompt: request.prompt,
				n: request.n || 1,
				size: request.size || '1024x1024',
				response_format: request.responseFormat || 'url'
			};

			// Add quality and style for DALL-E 3
			if (model === 'dall-e-3') {
				if (request.quality) {
					params.quality = request.quality;
				}
				if (request.style) {
					params.style = request.style;
				}
			}

			if (request.user) {
				params.user = request.user;
			}

			// Make the API call using fetch with abort signal
			const response = await this.customFetch(
				`${this.apiEndpoint || 'https://api.openai.com/v1'}/images/generations`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${this.apiKey}`
					},
					body: JSON.stringify(params),
					signal
				}
			);

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as {
					error?: { message?: string };
				};
				throw new Error(
					errorData.error?.message || `API request failed with status ${response.status}`
				);
			}

			const data = (await response.json()) as {
				created: number;
				data: Array<{
					url?: string;
					b64_json?: string;
					revised_prompt?: string;
				}>;
			};

			const result: IImageGenerationResponse = {
				images: data.data.map(img => ({
					url: img.url,
					b64_json: img.b64_json,
					revisedPrompt: img.revised_prompt
				})),
				created: data.created,
				metadata: {
					model,
					prompt: request.prompt
				}
			};

			logger.debug('Image generation completed', {
				imageCount: result.images.length,
				created: result.created
			});

			return result;
		} catch (error) {
			logger.error('Error generating image:', error);

			// Handle abort errors
			if (error instanceof Error && error.name === 'AbortError') {
				throw error;
			}

			// Return error response
			throw new Error(
				error instanceof Error ? error.message : 'Unknown error during image generation'
			);
		}
	}
}
