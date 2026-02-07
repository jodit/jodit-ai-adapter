/**
 * Types based on Jodit AI Assistant Pro interfaces
 * These match the contract that Jodit expects
 */

import { JSONValue } from 'ai';
import type { JSONSchema7TypeName } from 'json-schema';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type AIAssistantAPIMode = 'full' | 'incremental';

/**
 * Selection context from editor
 */
export interface ISelectionContext {
	readonly html: string;
	readonly blockIndex?: number;
	readonly rangeInfo?: {
		readonly startContainer: string;
		readonly startOffset: number;
		readonly endContainer: string;
		readonly endOffset: number;
	};
}

/**
 * Tool call from AI
 */
export interface IToolCall {
	readonly id: string;
	readonly name: string;
	readonly arguments: Record<string, unknown>;
	readonly status: 'pending' | 'executing' | 'completed' | 'error';
	readonly result?: {
		readonly result?: unknown;
		readonly error?: string;
	};
}

/**
 * Tool result message
 */
export type IToolResult = {
	readonly toolCallId: string;
	readonly result: JSONValue;
} | {
	readonly toolCallId: string;
	readonly error: string;
};

/**
 * AI message in conversation
 */
export interface IAIMessage {
	readonly id: string;
	readonly role: MessageRole;
	readonly content: string;
	readonly timestamp: number;
	readonly toolCalls?: readonly IToolCall[];
	readonly toolResults?: readonly IToolResult[];
	readonly artifacts?: IAIArtifact[];
}

/**
 * AI artifact (e.g., images)
 */
export interface IAIArtifact {
	readonly id: string;
	readonly status: 'pending' | 'ready' | 'error';
	readonly type: 'image' | 'audio' | 'video' | 'file';
	readonly mimeType: string;
	readonly data: {
		readonly kind: 'base64' | 'url';
		readonly base64?: string;
		readonly url?: string;
	};
	readonly metadata?: Record<string, unknown>;
}

/**
 * Tool parameter definition
 */
export interface IToolParameter {
	readonly name: string;
	readonly type: JSONSchema7TypeName;
	readonly description: string;
	readonly parameters?: readonly IToolParameter[];
	readonly required: boolean;
	readonly enum?: readonly string[];
	readonly default?: unknown;
}

/**
 * Tool definition
 */
export interface IToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly parameters: readonly IToolParameter[];
}

/**
 * Conversation options
 */
export interface IConversationOptions {
	readonly model?: string;
	readonly temperature?: number;
}

/**
 * Request context from Jodit
 */
export interface IAIRequestContext {
	readonly mode: AIAssistantAPIMode;
	readonly messages?: readonly IAIMessage[];
	readonly parentMessageId?: string;
	readonly tools: readonly IToolDefinition[];
	readonly selectionContexts?: readonly ISelectionContext[];
	readonly conversationOptions?: IConversationOptions;
	readonly instructions?: string;
	readonly metadata?: Record<string, unknown>;
}

/**
 * Response to Jodit
 */
export interface IAIResponse {
	responseId: string;
	content: string;
	toolCalls?: IToolCall[];
	artifacts?: IAIArtifact[];
	finished: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * Stream events
 */
export type AIStreamEvent =
	| {
			type: 'created';
			response: IAIResponse;
	  }
	| {
			type: 'text-delta';
			delta: string;
	  }
	| {
			type: 'completed';
			response: IAIResponse;
	  }
	| {
			type: 'error';
			error: Error;
	  };

/**
 * Result from adapter (streaming or final)
 */
export type IAIAssistantResult =
	| {
			readonly mode: 'final';
			readonly response: IAIResponse;
	  }
	| {
			readonly mode: 'stream';
			readonly stream: AsyncGenerator<AIStreamEvent>;
	  };

/**
 * Main request handler interface
 */
export interface IAIAssistantRequester {
	(
		request: IAIRequestContext,
		signal: AbortSignal
	): Promise<IAIAssistantResult>;
}
