import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/**
 * Image size schema
 */
export const ImageSizeSchema = z
	.enum(['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'])
	.openapi({
		description: 'Size of the generated image',
		example: '1024x1024'
	});

/**
 * Image quality schema
 */
export const ImageQualitySchema = z.enum(['standard', 'hd']).openapi({
	description: 'Quality of the generated image (DALL-E 3 only)',
	example: 'standard'
});

/**
 * Image style schema
 */
export const ImageStyleSchema = z.enum(['vivid', 'natural']).openapi({
	description: 'Style of the generated image (DALL-E 3 only)',
	example: 'vivid'
});

/**
 * Response format schema
 */
export const ResponseFormatSchema = z.enum(['url', 'b64_json']).openapi({
	description: 'Format of the response (URL or base64-encoded JSON)',
	example: 'url'
});

/**
 * Image generation request schema
 */
export const ImageGenerationRequestSchema = z
	.object({
		prompt: z.string().min(1).max(4000).openapi({
			description: 'Text prompt describing the image to generate',
			example: 'A white siamese cat with blue eyes sitting on a red cushion'
		}),
		model: z.string().optional().openapi({
			description: 'Model to use for image generation (e.g., dall-e-2, dall-e-3)',
			example: 'dall-e-3'
		}),
		n: z.number().int().min(1).max(10).optional().openapi({
			description: 'Number of images to generate (1-10, default: 1)',
			example: 1
		}),
		size: ImageSizeSchema.optional(),
		quality: ImageQualitySchema.optional(),
		style: ImageStyleSchema.optional(),
		responseFormat: ResponseFormatSchema.optional(),
		user: z.string().optional().openapi({
			description: 'User identifier for tracking purposes',
			example: 'user-123'
		})
	})
	.openapi('ImageGenerationRequest');

/**
 * Generated image schema
 */
export const GeneratedImageSchema = z
	.object({
		url: z.string().url().optional().openapi({
			description: 'URL of the generated image (if responseFormat is url)',
			example: 'https://example.com/generated-image.png'
		}),
		b64_json: z.string().optional().openapi({
			description: 'Base64-encoded image data (if responseFormat is b64_json)'
		}),
		revisedPrompt: z.string().optional().openapi({
			description: 'Revised prompt that was actually used by the model',
			example: 'A white siamese cat with striking blue eyes...'
		})
	})
	.openapi('GeneratedImage');

/**
 * Image generation response schema
 */
export const ImageGenerationResponseSchema = z
	.object({
		images: z.array(GeneratedImageSchema).openapi({
			description: 'Array of generated images'
		}),
		created: z.number().openapi({
			description: 'Unix timestamp when images were created',
			example: 1700000000
		}),
		metadata: z
			.object({
				model: z.string().optional().openapi({
					description: 'Model used for generation',
					example: 'dall-e-3'
				}),
				prompt: z.string().optional().openapi({
					description: 'Original prompt used',
					example: 'A white siamese cat'
				})
			})
			.catchall(z.unknown())
			.optional()
			.openapi({
				description: 'Provider-specific metadata'
			})
	})
	.openapi('ImageGenerationResponse');

/**
 * Image generation success response schema
 */
export const ImageGenerationSuccessResponseSchema = z
	.object({
		success: z.literal(true).openapi({
			description: 'Success flag',
			example: true
		}),
		result: ImageGenerationResponseSchema
	})
	.openapi('ImageGenerationSuccessResponse');

/**
 * Image generation API request schema
 */
export const ImageGenerationAPIRequestSchema = z
	.object({
		provider: z.string().min(1).openapi({
			description: 'Image generation provider name',
			example: 'openai'
		}),
		request: ImageGenerationRequestSchema
	})
	.openapi('ImageGenerationAPIRequest');
