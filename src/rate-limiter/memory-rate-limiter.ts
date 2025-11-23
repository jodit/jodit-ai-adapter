import type {
	IRateLimiter,
	RateLimiterConfig,
	RateLimitResult
} from './types';
import { logger } from '../helpers/logger';

/**
 * Request record for in-memory storage
 */
interface RequestRecord {
	count: number;
	windowStart: number;
}

/**
 * In-memory rate limiter implementation
 * Uses a sliding window algorithm with fixed windows
 */
export class MemoryRateLimiter implements IRateLimiter {
	private config: Required<Omit<RateLimiterConfig, 'skip'>> & {
		skip?: RateLimiterConfig['skip'];
	};
	private storage: Map<string, RequestRecord>;
	private cleanupInterval: NodeJS.Timeout;

	constructor(config: RateLimiterConfig) {
		this.config = {
			maxRequests: config.maxRequests,
			windowMs: config.windowMs,
			keyPrefix: config.keyPrefix || 'rl:',
			skip: config.skip
		};

		this.storage = new Map();

		// Cleanup old entries every minute
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, 60000);

		logger.debug('MemoryRateLimiter initialized', {
			maxRequests: this.config.maxRequests,
			windowMs: this.config.windowMs
		});
	}

	async consume(key: string): Promise<RateLimitResult> {
		// Check if should skip
		if (this.config.skip && (await this.config.skip(key))) {
			return {
				allowed: true,
				current: 0,
				limit: this.config.maxRequests,
				remaining: this.config.maxRequests,
				resetTime: 0
			};
		}

		const prefixedKey = this.getPrefixedKey(key);
		const now = Date.now();
		const record = this.storage.get(prefixedKey);

		// Check if we need to start a new window
		if (!record || now - record.windowStart >= this.config.windowMs) {
			const newRecord: RequestRecord = {
				count: 1,
				windowStart: now
			};
			this.storage.set(prefixedKey, newRecord);

			return {
				allowed: true,
				current: 1,
				limit: this.config.maxRequests,
				remaining: this.config.maxRequests - 1,
				resetTime: this.config.windowMs
			};
		}

		// Increment counter in current window
		record.count++;
		const allowed = record.count <= this.config.maxRequests;
		const resetTime = this.config.windowMs - (now - record.windowStart);

		const result: RateLimitResult = {
			allowed,
			current: record.count,
			limit: this.config.maxRequests,
			remaining: Math.max(0, this.config.maxRequests - record.count),
			resetTime
		};

		logger.debug('Rate limit check', {
			key: prefixedKey,
			allowed,
			current: result.current,
			limit: result.limit,
			remaining: result.remaining
		});

		return result;
	}

	async reset(key: string): Promise<void> {
		const prefixedKey = this.getPrefixedKey(key);
		this.storage.delete(prefixedKey);
		logger.debug('Rate limit reset', { key: prefixedKey });
	}

	async getState(key: string): Promise<RateLimitResult> {
		const prefixedKey = this.getPrefixedKey(key);
		const now = Date.now();
		const record = this.storage.get(prefixedKey);

		if (!record || now - record.windowStart >= this.config.windowMs) {
			return {
				allowed: true,
				current: 0,
				limit: this.config.maxRequests,
				remaining: this.config.maxRequests,
				resetTime: 0
			};
		}

		const allowed = record.count < this.config.maxRequests;
		const resetTime = this.config.windowMs - (now - record.windowStart);

		return {
			allowed,
			current: record.count,
			limit: this.config.maxRequests,
			remaining: Math.max(0, this.config.maxRequests - record.count),
			resetTime
		};
	}

	async close(): Promise<void> {
		clearInterval(this.cleanupInterval);
		this.storage.clear();
		logger.debug('MemoryRateLimiter closed');
	}

	/**
	 * Cleanup expired entries
	 */
	private cleanup(): void {
		const now = Date.now();
		let removed = 0;

		for (const [key, record] of this.storage.entries()) {
			if (now - record.windowStart >= this.config.windowMs) {
				this.storage.delete(key);
				removed++;
			}
		}

		if (removed > 0) {
			logger.debug('Cleaned up expired rate limit entries', {
				removed,
				remaining: this.storage.size
			});
		}
	}

	/**
	 * Get prefixed key
	 */
	private getPrefixedKey(key: string): string {
		return `${this.config.keyPrefix}${key}`;
	}

	/**
	 * Get current storage size (for testing/monitoring)
	 */
	getStorageSize(): number {
		return this.storage.size;
	}
}
