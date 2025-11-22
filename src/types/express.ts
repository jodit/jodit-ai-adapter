/**
 * Express types extensions
 */

import type { Request } from 'express';

/**
 * Extended Express Request with authentication data
 */
export interface AuthenticatedRequest extends Request {
	userId?: string;
	apiKey?: string;
}

/**
 * Usage data from AI provider
 */
export interface ProviderUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	input_tokens?: number;
	output_tokens?: number;
}

/**
 * Vercel AI SDK tool call format
 */
export interface VercelToolCall {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

/**
 * Vercel AI SDK response format
 */
export interface VercelAIResponse {
	toolCalls?: VercelToolCall[];
	usage?: ProviderUsage;
}

/**
 * Stream parameters for Vercel AI SDK
 * Uses unknown[] for messages as they map to CoreMessage[] from AI SDK
 */
export interface StreamTextParams {
	model: {
		modelId: string;
	};
	messages: unknown[]; // CoreMessage[] from AI SDK
	temperature?: number;
	maxTokens?: number;
	abortSignal?: AbortSignal;
	tools?: Record<string, AISDKToolDefinition>;
}

/**
 * AI SDK Message format (CoreMessage from Vercel AI SDK)
 */
export type AISDKMessage =
	| {
			role: 'system';
			content: string;
	  }
	| {
			role: 'user';
			content: string;
	  }
	| {
			role: 'assistant';
			content: string;
			toolInvocations?: AISDKToolInvocation[];
	  }
	| {
			role: 'tool';
			content: string;
			toolCallId: string;
	  };

/**
 * AI SDK Tool Invocation format
 */
export interface AISDKToolInvocation {
	state: 'result' | 'call' | 'partial-call';
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	result?: unknown;
}

/**
 * AI SDK Tool Definition format
 */
export interface AISDKToolDefinition {
	description: string;
	parameters: AISDKToolParameters;
}

/**
 * AI SDK Tool Parameters schema
 */
export interface AISDKToolParameters {
	type: 'object';
	properties: Record<string, AISDKPropertyDefinition>;
	required: string[];
}

/**
 * AI SDK Property Definition
 */
export interface AISDKPropertyDefinition {
	type: string;
	description: string;
	enum?: string[];
}

/**
 * Vercel AI SDK tool call from response
 */
export interface VercelAIToolCallResult {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

/**
 * Tool call raw format (before conversion)
 */
export interface RawToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

/**
 * Vercel AI SDK stream text result
 */
export interface AISDKStreamTextResult {
	textStream: AsyncIterable<string>;
	response: Promise<AISDKResponse>;
}

/**
 * Vercel AI SDK response
 */
export interface AISDKResponse {
	messages?: unknown[];
	usage?: ProviderUsage;
	[key: string]: unknown;
}

/**
 * Vercel AI SDK generate text result
 */
export interface AISDKGenerateTextResult {
	text: string;
	usage?: ProviderUsage;
	[key: string]: unknown;
}
