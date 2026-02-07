/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
	/**
	 * Maximum number of requests allowed within the window
	 */
	maxRequests: number;

	/**
	 * Time window in milliseconds
	 */
	windowMs: number;

	/**
	 * Key prefix for storage (useful for namespacing)
	 */
	keyPrefix?: string;

	/**
	 * Skip rate limiting for certain conditions
	 */
	skip?: (key: string) => boolean | Promise<boolean>;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
	/**
	 * Whether the request is allowed
	 */
	allowed: boolean;

	/**
	 * Current request count
	 */
	current: number;

	/**
	 * Maximum allowed requests
	 */
	limit: number;

	/**
	 * Remaining requests in current window
	 */
	remaining: number;

	/**
	 * Time until rate limit resets (in milliseconds)
	 */
	resetTime: number;
}

/**
 * Rate limiter interface
 */
export interface IRateLimiter {
	/**
	 * Check if request is allowed and increment counter
	 * @param key - Unique identifier (e.g., user ID, IP address)
	 */
	consume(key: string): Promise<RateLimitResult>;

	/**
	 * Reset rate limit for a specific key
	 * @param key - Unique identifier
	 */
	reset(key: string): Promise<void>;

	/**
	 * Get current state without incrementing
	 * @param key - Unique identifier
	 */
	getState(key: string): Promise<RateLimitResult>;

	/**
	 * Close connections and cleanup
	 */
	close(): Promise<void>;
}

/**
 * Redis rate limiter configuration
 */
export interface RedisRateLimiterConfig extends RateLimiterConfig {
	/**
	 * Redis connection URL
	 */
	redisUrl: string;

	/**
	 * Redis connection options
	 */
	redisOptions?: {
		password?: string;
		db?: number;
		connectTimeout?: number;
		maxRetriesPerRequest?: number;
	};
}
