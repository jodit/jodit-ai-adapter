import { AIRequestSchema, AIRequestSuccessResponseSchema } from './schema';
import { ErrorResponseSchema } from '../error.schema';

export default {
	method: 'post' as const,
	path: '/ai/request',
	operationId: 'aiRequest',
	summary: 'Process AI request',
	description:
		'Processes an AI request through the configured provider. Supports both streaming and non-streaming responses.',
	tags: ['AI'],
	request: {
		body: {
			content: {
				'application/json': {
					schema: AIRequestSchema
				}
			}
		}
	},
	responses: {
		200: {
			description: 'Successful AI response',
			content: {
				'application/json': {
					schema: AIRequestSuccessResponseSchema
				},
				'text/event-stream': {
					schema: {
						type: 'string' as const,
						description: 'Server-sent events stream with AI responses'
					}
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
