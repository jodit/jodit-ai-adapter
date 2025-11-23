import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/**
 * Provider information
 */
export const ProviderInfoSchema = z.object({
	name: z.string().openapi({
		description: 'Provider name',
		example: 'openai'
	}),
	type: z.string().openapi({
		description: 'Provider type',
		example: 'openai'
	}),
	defaultModel: z.string().optional().openapi({
		description: 'Default model for this provider',
		example: 'gpt-4o'
	}),
	configured: z.boolean().openapi({
		description: 'Whether provider is configured with API key',
		example: true
	})
}).openapi('ProviderInfo');

/**
 * Providers list response
 */
export const ProvidersResponseSchema = z.object({
	success: z.literal(true).openapi({
		description: 'Success flag',
		example: true
	}),
	providers: z.array(ProviderInfoSchema).openapi({
		description: 'List of configured providers'
	}),
	supported: z.array(z.string()).openapi({
		description: 'List of all supported provider types',
		example: ['openai', 'anthropic', 'google']
	})
}).openapi('ProvidersResponse');
