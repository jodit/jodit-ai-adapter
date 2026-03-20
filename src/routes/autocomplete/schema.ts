import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/**
 * Autocomplete request query + body schema
 */
export const AutocompleteQuerySchema = z.object({
	query: z.string().min(1).openapi({
		description: 'The text query to autocomplete',
		example: 'How to make a'
	})
}).openapi('AutocompleteQuery');

export const AutocompleteBodySchema = z.object({
	provider: z.string().min(1).openapi({
		description: 'AI provider name',
		example: 'openai'
	}),
	context: z.object({
		instructions: z.string().optional().openapi({
			description: 'System instructions for autocomplete',
			example: 'You are a helpful writing assistant.'
		}),
		conversationOptions: z.object({
			model: z.string().optional().openapi({
				description: 'AI model to use',
				example: 'gpt-4.1-nano'
			}),
			temperature: z.number().optional().openapi({
				description: 'Temperature parameter (0-2)',
				example: 0.3
			})
		}).optional().openapi({
			description: 'Conversation options'
		}),
		maxSuggestions: z.number().min(1).max(10).optional().openapi({
			description: 'Maximum number of autocomplete suggestions (1-10, default 5)',
			example: 5
		}),
		metadata: z.record(z.string(), z.unknown()).optional().openapi({
			description: 'Additional metadata'
		})
	}).optional().openapi({
		description: 'Optional context for autocomplete'
	})
}).openapi('AutocompleteRequest');

/**
 * Autocomplete response schema
 */
export const AutocompleteResultSchema = z.object({
	responseId: z.string().openapi({
		description: 'Response ID',
		example: 'resp_123'
	}),
	suggestions: z.array(z.string()).openapi({
		description: 'Autocomplete suggestions',
		example: ['cake with chocolate', 'salad for dinner', 'presentation']
	}),
	metadata: z.record(z.string(), z.unknown()).optional().openapi({
		description: 'Response metadata'
	})
}).openapi('AutocompleteResult');

export const AutocompleteSuccessResponseSchema = z.object({
	success: z.literal(true).openapi({
		description: 'Success flag',
		example: true
	}),
	result: AutocompleteResultSchema
}).openapi('AutocompleteSuccessResponse');
