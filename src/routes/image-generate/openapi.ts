import {
	ImageGenerationAPIRequestSchema,
	ImageGenerationSuccessResponseSchema,
	ErrorResponseSchema
} from '../../schemas';

export default {
	method: 'post' as const,
	path: '/image/generate',
	operationId: 'imageGenerate',
	summary: 'Generate images from text prompt',
	description:
		'Generates images from a text description using AI image generation models like DALL-E. Supports various sizes, qualities, and styles.',
	tags: ['Image Generation'],
	request: {
		body: {
			content: {
				'application/json': {
					schema: ImageGenerationAPIRequestSchema
				}
			}
		}
	},
	responses: {
		200: {
			description: 'Successful image generation',
			content: {
				'application/json': {
					schema: ImageGenerationSuccessResponseSchema
				}
			}
		},
		400: {
			description:
				'Bad request - invalid request body or unsupported provider',
			content: {
				'application/json': {
					schema: ErrorResponseSchema
				}
			}
		},
		401: {
			description: 'Unauthorized - invalid or missing API key',
			content: {
				'application/json': {
					schema: ErrorResponseSchema
				}
			}
		},
		403: {
			description: 'Forbidden - referer not allowed',
			content: {
				'application/json': {
					schema: ErrorResponseSchema
				}
			}
		},
		408: {
			description: 'Request timeout - image generation was cancelled',
			content: {
				'application/json': {
					schema: ErrorResponseSchema
				}
			}
		},
		500: {
			description: 'Internal server error',
			content: {
				'application/json': {
					schema: ErrorResponseSchema
				}
			}
		}
	}
};
