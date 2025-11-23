import Redis from 'ioredis';
import type {
	IRateLimiter,
	RateLimitResult,
	RedisRateLimiterConfig
} from './types';
import { logger } from '../helpers/logger';

/**
 * Redis rate limiter implementation
 * Uses Redis for distributed rate limiting across multiple instances
 * Implements a sliding window algorithm using sorted sets
 */
export class RedisRateLimiter implements IRateLimiter {
	private config: Required<
		Omit<RedisRateLimiterConfig, 'skip' | 'redisOptions'>
	> & {
		skip?: RedisRateLimiterConfig['skip'];
		redisOptions?: RedisRateLimiterConfig['redisOptions'];
	};
	private redis: Redis;

	private __iseReadyPromise: Promise<void>;

	constructor(config: RedisRateLimiterConfig) {
		this.config = {
			maxRequests: config.maxRequests,
			windowMs: config.windowMs,
			keyPrefix: config.keyPrefix || 'rl:',
			redisUrl: config.redisUrl,
			skip: config.skip,
			redisOptions: config.redisOptions
		};

		// Initialize Redis connection
		this.redis = new Redis(this.config.redisUrl, {
			...this.config.redisOptions,
			lazyConnect: false,
			enableOfflineQueue: false,
			maxRetriesPerRequest: 3,
			retryStrategy: (times): number => {
				const delay = Math.min(times * 50, 2000);
				logger.warn('Redis connection retry', {
					attempt: times,
					delay
				});
				return delay;
			}
		});

		this.redis.on('error', (err) => {
			logger.error('Redis error:', err);
		});

		this.redis.on('connect', () => {
			logger.info('Redis connected', { url: this.config.redisUrl });
		});

		logger.debug('RedisRateLimiter initialized', {
			maxRequests: this.config.maxRequests,
			windowMs: this.config.windowMs,
			redisUrl: this.config.redisUrl
		});

		this.__iseReadyPromise = new Promise<void>((resolve, reject) => {
			this.redis.once('ready', resolve);
			this.redis.once('error', reject);
		})
			.then(() => {
				logger.info('RedisRateLimiter is ready');
			})
			.catch((err) => {
				logger.error('RedisRateLimiter failed to connect:', err);
			});
	}

	async consume(key: string): Promise<RateLimitResult> {
		await this.__iseReadyPromise;
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
		const windowStart = now - this.config.windowMs;

		try {
			// Use Lua script for atomic operations
			// This ensures consistency across multiple instances
			const result = await this.redis.eval(
				`
				local key = KEYS[1]
				local now = tonumber(ARGV[1])
				local window_start = tonumber(ARGV[2])
				local max_requests = tonumber(ARGV[3])
				local window_ms = tonumber(ARGV[4])

				-- Remove old entries outside the window
				redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

				-- Count current requests in window
				local current = redis.call('ZCARD', key)

				-- Add current request
				redis.call('ZADD', key, now, now .. math.random())

				-- Set expiry on the key
				redis.call('PEXPIRE', key, window_ms)

				-- Return current count (before increment)
				return current
				`,
				1,
				prefixedKey,
				now,
				windowStart,
				this.config.maxRequests,
				this.config.windowMs
			);

			const current = (result as number) + 1;
			const allowed = current <= this.config.maxRequests;
			const remaining = Math.max(0, this.config.maxRequests - current);

			const rateLimitResult: RateLimitResult = {
				allowed,
				current,
				limit: this.config.maxRequests,
				remaining,
				resetTime: this.config.windowMs
			};

			logger.debug('Rate limit check (Redis)', {
				key: prefixedKey,
				allowed,
				current,
				limit: this.config.maxRequests,
				remaining
			});

			return rateLimitResult;
		} catch (error) {
			logger.error('Redis rate limiter error:', error);
			// Fail open - allow request if Redis is down
			return {
				allowed: true,
				current: 0,
				limit: this.config.maxRequests,
				remaining: this.config.maxRequests,
				resetTime: 0
			};
		}
	}

	async reset(key: string): Promise<void> {
		await this.__iseReadyPromise;
		const prefixedKey = this.getPrefixedKey(key);
		try {
			await this.redis.del(prefixedKey);
			logger.debug('Rate limit reset (Redis)', { key: prefixedKey });
		} catch (error) {
			logger.error('Redis reset error:', error);
		}
	}

	async getState(key: string): Promise<RateLimitResult> {
		await this.__iseReadyPromise;
		const prefixedKey = this.getPrefixedKey(key);
		const now = Date.now();
		const windowStart = now - this.config.windowMs;

		try {
			// Remove old entries and count current
			await this.redis.zremrangebyscore(prefixedKey, 0, windowStart);
			const current = await this.redis.zcard(prefixedKey);

			const allowed = current < this.config.maxRequests;
			const remaining = Math.max(0, this.config.maxRequests - current);

			// Get oldest entry to calculate reset time
			const oldestEntries = await this.redis.zrange(
				prefixedKey,
				0,
				0,
				'WITHSCORES'
			);
			const resetTime =
				oldestEntries.length > 1
					? Math.max(
							0,
							this.config.windowMs -
								(now - parseFloat(oldestEntries[1]))
						)
					: 0;

			return {
				allowed,
				current,
				limit: this.config.maxRequests,
				remaining,
				resetTime
			};
		} catch (error) {
			logger.error('Redis getState error:', error);
			// Fail open
			return {
				allowed: true,
				current: 0,
				limit: this.config.maxRequests,
				remaining: this.config.maxRequests,
				resetTime: 0
			};
		}
	}

	async close(): Promise<void> {
		try {
			// Check if connection is still active
			if (
				this.redis.status === 'ready' ||
				this.redis.status === 'connect'
			) {
				await this.redis.quit();
			} else {
				// Just disconnect without waiting for graceful shutdown
				this.redis.disconnect();
			}
			logger.debug('RedisRateLimiter closed');
		} catch (error) {
			logger.warn('Error closing Redis connection:', error);
			// Force disconnect
			this.redis.disconnect();
		}
	}

	/**
	 * Get prefixed key
	 */
	private getPrefixedKey(key: string): string {
		return `${this.config.keyPrefix}${key}`;
	}

	/**
	 * Check Redis connection health
	 */
	async healthCheck(): Promise<boolean> {
		const timeoutHandles: ReturnType<typeof setTimeout>[] = [];

		try {
			// Check connection status first
			if (this.redis.status === 'end' || this.redis.status === 'close') {
				return false;
			}

			// Don't wait for ready promise if not ready yet, just try ping
			if (this.redis.status !== 'ready') {
				// Wait for ready with timeout
				const readyTimeout = new Promise<void>((_, reject) => {
					timeoutHandles.push(
						setTimeout(
							() => reject(new Error('Ready timeout')),
							2000
						)
					);
				});

				try {
					await Promise.race([this.__iseReadyPromise, readyTimeout]);
				} catch {
					return false;
				}
			}

			// Add timeout to ping to avoid hanging
			const timeoutPromise = new Promise<string>((_, reject) => {
				timeoutHandles.push(
					setTimeout(() => reject(new Error('Ping timeout')), 2000)
				);
			});

			const pingPromise = this.redis.ping();
			const result = await Promise.race([pingPromise, timeoutPromise]);

			return result === 'PONG';
		} catch (error) {
			logger.error(error);
			return false;
		} finally {
			timeoutHandles.forEach((handle) => clearTimeout(handle));
		}
	}

	/**
	 * Get Redis client for advanced operations
	 */
	getClient(): Redis {
		return this.redis;
	}
}
