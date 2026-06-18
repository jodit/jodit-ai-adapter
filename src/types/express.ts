/**
 * Express types extensions
 */

import type { ModelMessage, ToolSet } from 'ai';
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
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	inputTokens?: number;
	outputTokens?: number;
	cachedInputTokens?: number;
	/**
	 * Audio input tokens (speech-to-text). Part of `inputTokens` but billed at
	 * the model's audio rate; the remainder of `inputTokens` is billed as text.
	 */
	audioInputTokens?: number;
}

export interface ModelPricing {
	input: number; // $ per 1M text input tokens
	cachedInput: number; // $ per 1M cached input tokens
	output: number; // $ per 1M output tokens
	audioInput?: number; // $ per 1M audio input tokens (transcription models)
}

export interface CreditsCost {
	credits: number;
	usdCost: number;
	inputTokens: number;
	outputTokens: number;
	cachedInputTokens: number;
	audioInputTokens?: number;
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
	messages: ModelMessage[]; // ModelMessage[] from AI SDK
	temperature?: number;
	maxOutputTokens?: number;
	abortSignal?: AbortSignal;
	tools?: ToolSet;
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
