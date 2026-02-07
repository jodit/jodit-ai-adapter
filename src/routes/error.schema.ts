import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/**
 * Error response
 */
export const ErrorResponseSchema = z.object({
	success: z.literal(false).openapi({
		description: 'Success flag',
		example: false
	}),
	error: z.object({
		code: z.number().openapi({
			description: 'Error code',
			example: 400
		}),
		message: z.string().openapi({
			description: 'Error message',
			example: 'Invalid request body'
		}),
		details: z.unknown().optional().openapi({
			description: 'Error details'
		})
	}).openapi({
		description: 'Error details'
	})
}).openapi('ErrorResponse');
