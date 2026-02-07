import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/**
 * Tool parameter definition
 */
export const ToolParameterSchema = z.object({
	name: z.string().openapi({
		description: 'Parameter name',
		example: 'query'
	}),
	type: z.string().openapi({
		description: 'Parameter type (string, number, boolean, object, array)',
		example: 'string'
	}),
	description: z.string().openapi({
		description: 'Parameter description',
		example: 'Search query string'
	}),
	required: z.boolean().openapi({
		description: 'Whether the parameter is required',
		example: true
	}),
	enum: z.array(z.string()).optional().openapi({
		description: 'Allowed values for enum types',
		example: ['option1', 'option2']
	}),
	default: z.unknown().optional().openapi({
		description: 'Default value for the parameter'
	})
}).openapi('ToolParameter');

/**
 * Tool definition for AI function calling
 */
export const ToolDefinitionSchema = z.object({
	name: z.string().openapi({
		description: 'Tool/function name',
		example: 'search'
	}),
	description: z.string().openapi({
		description: 'Tool/function description',
		example: 'Search for information'
	}),
	parameters: z.array(ToolParameterSchema).openapi({
		description: 'Tool parameters'
	})
}).openapi('ToolDefinition');

/**
 * Selection context from editor
 */
export const SelectionContextSchema = z.object({
	html: z.string().openapi({
		description: 'Selected HTML content',
		example: '<p>Selected text</p>'
	}),
	blockIndex: z.number().optional().openapi({
		description: 'Block index in editor',
		example: 0
	}),
	rangeInfo: z
		.object({
			startContainer: z.string().openapi({
				description: 'Start container node path',
				example: '/0/0'
			}),
			startOffset: z.number().openapi({
				description: 'Start offset',
				example: 0
			}),
			endContainer: z.string().openapi({
				description: 'End container node path',
				example: '/0/0'
			}),
			endOffset: z.number().openapi({
				description: 'End offset',
				example: 10
			})
		})
		.optional()
		.openapi({
			description: 'Selection range information'
		})
}).openapi('SelectionContext');

/**
 * Message in conversation
 */
export const MessageSchema = z.object({
	id: z.string().openapi({
		description: 'Message ID',
		example: 'msg-123'
	}),
	role: z.enum(['user', 'assistant', 'system', 'tool']).openapi({
		description: 'Message role',
		example: 'user'
	}),
	content: z.string().openapi({
		description: 'Message content',
		example: 'Hello, how can I help you?'
	}),
	timestamp: z.number().openapi({
		description: 'Message timestamp (Unix milliseconds)',
		example: 1700000000000
	}),
	toolCalls: z.array(z.unknown()).optional().openapi({
		description: 'Tool calls made in this message'
	}),
	toolResults: z.array(z.unknown()).optional().openapi({
		description: 'Tool call results'
	}),
	artifacts: z.array(z.unknown()).optional().openapi({
		description: 'Message artifacts'
	})
}).openapi('Message');

/**
 * Conversation options
 */
export const ConversationOptionsSchema = z.object({
	model: z.string().optional().openapi({
		description: 'AI model to use',
		example: 'gpt-5.2'
	}),
	temperature: z.number().optional().openapi({
		description: 'Temperature parameter (0-2)',
		example: 0.7
	})
}).openapi('ConversationOptions');

/**
 * AI request context
 */
export const AIRequestContextSchema = z.object({
	mode: z.enum(['full', 'incremental']).openapi({
		description: 'Request mode - full or incremental',
		example: 'full'
	}),
	conversationId: z.string().openapi({
		description: 'Conversation ID',
		example: 'conv-123'
	}),
	messages: z.array(MessageSchema).optional().openapi({
		description: 'Conversation messages'
	}),
	parentMessageId: z.string().optional().openapi({
		description: 'Parent message ID for threading',
		example: 'msg-parent-123'
	}),
	tools: z.array(ToolDefinitionSchema).openapi({
		description: 'Available tools for function calling'
	}),
	selectionContexts: z.array(SelectionContextSchema).optional().openapi({
		description: 'Selected content from editor'
	}),
	conversationOptions: ConversationOptionsSchema.optional().openapi({
		description: 'Conversation options'
	}),
	instructions: z.string().optional().openapi({
		description: 'System instructions for AI',
		example: 'You are a helpful assistant.'
	}),
	metadata: z.record(z.string(), z.unknown()).optional().openapi({
		description: 'Additional metadata',
		example: { stream: true }
	})
}).openapi('AIRequestContext');

/**
 * AI request body
 */
export const AIRequestSchema = z.object({
	provider: z.string().min(1).openapi({
		description: 'AI provider name',
		example: 'openai'
	}),
	context: AIRequestContextSchema.openapi({
		description: 'Request context'
	})
}).openapi('AIRequest');

/**
 * AI response
 */
export const AIResponseSchema = z.object({
	responseId: z.string().openapi({
		description: 'Response ID',
		example: 'resp-123'
	}),
	content: z.string().openapi({
		description: 'Response content',
		example: 'Hello! How can I help you today?'
	}),
	finished: z.boolean().openapi({
		description: 'Whether response is complete',
		example: true
	}),
	toolCalls: z.array(z.unknown()).optional().openapi({
		description: 'Tool calls made by AI'
	}),
	metadata: z.record(z.string(), z.unknown()).optional().openapi({
		description: 'Response metadata',
		example: { usage: { total_tokens: 100 } }
	})
}).openapi('AIResponse');

/**
 * Successful AI request response
 */
export const AIRequestSuccessResponseSchema = z.object({
	success: z.literal(true).openapi({
		description: 'Success flag',
		example: true
	}),
	result: AIResponseSchema.openapi({
		description: 'AI response'
	})
}).openapi('AIRequestSuccessResponse');
