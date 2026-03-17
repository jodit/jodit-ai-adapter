/**
 * Configuration types for the adapter service
 */
import type { Request } from 'express';
import { CreditsCost } from './express';

/**
 * Authentication callback
 * Validates API key and referer, returns user identifier or throws error
 */
export type AuthCallback = (
	apiKey: string,
	referer: string | undefined,
	request: unknown
) => Promise<string | null> | string | null;

/**
 * Usage statistics from AI provider
 */
export interface UsageStats {
	/** User/API key identifier */
	userId: string;

	/** API key used for the request */
	apiKey: string;

	/** Provider name (openai, deepseek, etc.) */
	provider: string;

	/** Model used */
	model: string;

	/** Response ID */
	responseId: string;

	/** Number of prompt tokens */
	promptTokens?: number;

	/** Number of completion tokens */
	completionTokens?: number;

	/** Total tokens used */
	totalTokens?: number;

	/** Request timestamp */
	timestamp: number;

	/** Request duration in milliseconds */
	duration: number;

	/** Additional metadata */
	metadata?: Record<string, unknown>;

	/** Calculated credits cost */
	credits: CreditsCost;
}

/**
 * Usage tracking callback
 * Called after each AI request with usage statistics
 */
export type UsageCallback = (
	stats: UsageStats
) => Promise<void> | void;

/**
 * Supported AI providers
 */
export type AIProvider = 'openai' | 'deepseek' | 'anthropic' | 'google';

/**
 * Provider-specific configuration
 */
export interface ProviderConfig {
	/** Provider type */
	type: AIProvider;

	/** Whether the provider is enabled (default: true) */
	enabled?: boolean;

	/** API key (can be overridden by user's key) */
	apiKey?: string;

	/** API endpoint override */
	apiEndpoint?: string;

	/** Default model */
	defaultModel?: string;

	/** HTTP/SOCKS5 proxy URL (e.g., http://proxy:8080 or socks5://proxy:1080) */
	httpProxy?: string;

	/** Additional provider-specific options */
	options?: Record<string, unknown>;

	/** Maximum output tokens for generation (optional) */
	maxOutputTokens?: number;
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
	/** Enable rate limiting */
	enabled: boolean;

	/** Rate limiter type (memory or redis) */
	type: 'memory' | 'redis';

	/** Maximum number of requests per window */
	maxRequests: number;

	/** Time window in milliseconds */
	windowMs: number;

	/** Redis URL (required if type is 'redis') */
	redisUrl?: string;

	/** Redis password */
	redisPassword?: string;

	/** Redis database number */
	redisDb?: number;

	/** Key prefix for rate limiter */
	keyPrefix?: string;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
	/** Allowed origin (can be array or string or regex) */
	origin?: string | string[] | RegExp;

	/** Allowed HTTP methods (default: 'GET, POST, OPTIONS, PUT, DELETE') */
	methods?: string;

	/** Allowed headers (default: 'Content-Type, Authorization, x-api-key') */
	allowedHeaders?: string;

	/** Whether to include credentials (default: true) */
	credentials?: boolean;

	/** Preflight cache duration in seconds (default: 86400) */
	maxAge?: number;
}

/**
 * Application configuration
 */
export interface AppConfig {
	/** Server port */
	port: number;

	/** Enable debug logging */
	debug: boolean;

	/** Request timeout in milliseconds */
	requestTimeout: number;

	/** Maximum retries for failed requests */
	maxRetries: number;

	/** CORS origin (can be array or string or regex) */
	corsOrigin?: string | string[] | RegExp;

	/** CORS configuration (takes precedence over corsOrigin) */
	cors?: CorsConfig;

	/** Authentication callback */
	checkAuthentication?: AuthCallback;

	/** Usage tracking callback */
	onUsage?: UsageCallback;

	/** Enabled providers configuration */
	providers: Record<string, ProviderConfig>;

	/** API key validation pattern */
	apiKeyPattern?: RegExp;

	/** Require referer header */
	requireReferer: boolean;

	/** Allowed referer patterns */
	allowedReferers?: RegExp[];

	/** External referer validation callback. If set, implies requireReferer: true */
	checkReferer?: (referer: string, req: Request) => boolean | Promise<boolean>;

	/** Route prefix (default: '/ai') */
	routePrefix?: string;

	/** Rate limiter configuration */
	rateLimit?: RateLimiterConfig;
}

/**
 * Express app locals for storing config
 */
export interface AppLocals {
	config: AppConfig;
	checkAuthentication?: AuthCallback;
}
