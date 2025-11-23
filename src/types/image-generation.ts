/**
 * Image generation types
 */

/**
 * Image size options
 */
export type ImageSize = '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';

/**
 * Image quality options
 */
export type ImageQuality = 'standard' | 'hd';

/**
 * Image style options
 */
export type ImageStyle = 'vivid' | 'natural';

/**
 * Image generation request
 */
export interface IImageGenerationRequest {
	/** Text prompt describing the image */
	prompt: string;

	/** Model to use for image generation (e.g., dall-e-2, dall-e-3) */
	model?: string;

	/** Number of images to generate (1-10) */
	n?: number;

	/** Size of the generated image */
	size?: ImageSize;

	/** Quality of the generated image */
	quality?: ImageQuality;

	/** Style of the generated image */
	style?: ImageStyle;

	/** User identifier for the request */
	user?: string;

	/** Response format (url or b64_json) */
	responseFormat?: 'url' | 'b64_json';
}

/**
 * Generated image data
 */
export interface IGeneratedImage {
	/** URL of the generated image (if responseFormat is 'url') */
	url?: string;

	/** Base64-encoded image data (if responseFormat is 'b64_json') */
	b64_json?: string;

	/** Revised prompt that was used (if any) */
	revisedPrompt?: string;
}

/**
 * Image generation response
 */
export interface IImageGenerationResponse {
	/** Array of generated images */
	images: IGeneratedImage[];

	/** Timestamp when the images were created */
	created: number;

	/** Provider-specific metadata */
	metadata?: {
		/** Model used for generation */
		model?: string;

		/** Original prompt */
		prompt?: string;

		/** Additional provider-specific data */
		[key: string]: unknown;
	};
}

/**
 * Image generation adapter interface
 */
export interface IImageGenerationAdapter {
	/**
	 * Generate images from text prompt
	 * @param request - Image generation request
	 * @param signal - Abort signal for cancellation
	 * @returns Generated images
	 */
	generateImage(
		request: IImageGenerationRequest,
		signal?: AbortSignal
	): Promise<IImageGenerationResponse>;
}
