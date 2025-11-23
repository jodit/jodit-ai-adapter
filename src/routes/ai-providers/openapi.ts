import { ProvidersResponseSchema, ErrorResponseSchema } from '../../schemas';

export default {
	method: 'get' as const,
	path: '/ai/providers',
	operationId: 'getProviders',
	summary: 'Get available AI providers',
	description:
		'Returns list of configured AI providers and all supported provider types',
	tags: ['AI'],
	responses: {
		200: {
			description: 'List of providers',
			content: {
				'application/json': {
					schema: ProvidersResponseSchema
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
