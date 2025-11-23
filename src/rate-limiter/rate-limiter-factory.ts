import type {
	IRateLimiter,
	RateLimiterConfig,
	RedisRateLimiterConfig
} from './types';
import { MemoryRateLimiter } from './memory-rate-limiter';
import { RedisRateLimiter } from './redis-rate-limiter';
import { logger } from '../helpers/logger';

/**
 * Rate limiter type
 */
export type RateLimiterType = 'memory' | 'redis';

/**
 * Rate limiter factory configuration
 */
export interface RateLimiterFactoryConfig {
	type: RateLimiterType;
	config: RateLimiterConfig | RedisRateLimiterConfig;
}

/**
 * Factory for creating rate limiters
 */
export class RateLimiterFactory {
	/**
	 * Create a rate limiter instance
	 */
	static create(
		type: RateLimiterType,
		config: RateLimiterConfig | RedisRateLimiterConfig
	): IRateLimiter {
		switch (type) {
			case 'memory':
				logger.info('Creating in-memory rate limiter');
				return new MemoryRateLimiter(config);

			case 'redis':
				logger.info('Creating Redis rate limiter');
				if (!this.isRedisConfig(config)) {
					throw new Error(
						'Redis rate limiter requires redisUrl in config'
					);
				}
				return new RedisRateLimiter(config);

			default:
				throw new Error(`Unsupported rate limiter type: ${type}`);
		}
	}

	/**
	 * Type guard for Redis configuration
	 */
	private static isRedisConfig(
		config: RateLimiterConfig | RedisRateLimiterConfig
	): config is RedisRateLimiterConfig {
		return 'redisUrl' in config;
	}

	/**
	 * Create from environment variables
	 */
	static createFromEnv(): IRateLimiter | null {
		const enabled = process.env.RATE_LIMIT_ENABLED === 'true';
		if (!enabled) {
			logger.info('Rate limiting is disabled');
			return null;
		}

		const type =
			(process.env.RATE_LIMIT_TYPE as RateLimiterType) || 'memory';
		const maxRequests = parseInt(
			process.env.RATE_LIMIT_MAX_REQUESTS || '100',
			10
		);
		const windowMs = parseInt(
			process.env.RATE_LIMIT_WINDOW_MS || '60000',
			10
		);
		const keyPrefix = process.env.RATE_LIMIT_KEY_PREFIX || 'rl:';

		if (type === 'redis') {
			const redisUrl = process.env.REDIS_URL;
			if (!redisUrl) {
				logger.warn(
					'REDIS_URL not set, falling back to memory rate limiter'
				);
				return this.create('memory', {
					maxRequests,
					windowMs,
					keyPrefix
				});
			}

			return this.create('redis', {
				maxRequests,
				windowMs,
				keyPrefix,
				redisUrl,
				redisOptions: {
					password: process.env.REDIS_PASSWORD,
					db: process.env.REDIS_DB
						? parseInt(process.env.REDIS_DB, 10)
						: undefined
				}
			});
		}

		return this.create('memory', {
			maxRequests,
			windowMs,
			keyPrefix
		});
	}
}
