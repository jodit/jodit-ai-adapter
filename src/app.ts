import express, {
	type Application,
	Router,
	type Response,
	type NextFunction
} from 'express';
import Boom from '@hapi/boom';
import type { AppConfig, AuthenticatedRequest } from './types';
import { corsMiddleware } from './middlewares/cors';
import { authMiddleware } from './middlewares/auth';
import { createRateLimitMiddleware } from './middlewares/rate-limit';
import { RateLimiterFactory } from './rate-limiter';
import { logger } from './helpers/logger';
import healthRouter from './routes/health';
import { createImageGenerateRouter } from './routes/image-generate';
import { createAiRequestRouter } from './routes/ai-request';
import { createAiProvidersRouter } from './routes/ai-providers';

/**
 * Create Express application or mount to existing one
 * Following jodit-nodejs pattern for integration
 * @param config - App configuration
 * @param existingApp - Optional existing Express app to mount routes to
 * @param existingRouter - Optional existing Router to use
 */
export function createApp(
	config: AppConfig,
	existingApp?: Application,
	existingRouter?: Router
): Application {
	const app = existingApp || express();
	const router = existingRouter || Router();

	// Store config in router closure (not app.locals for isolation)
	const appConfig = config;

	// Basic middleware (only if creating new app)
	router.use(express.json({ limit: '10mb' }));
	router.use(
		express.urlencoded({
			extended: true,
			limit: '10mb'
		})
	);

	// CORS middleware on router (not app)
	router.use(corsMiddleware(appConfig));

	// Health check endpoint (no auth required)
	router.use('/health', healthRouter);

	// Apply authentication middleware to all routes except health check
	router.use(authMiddleware(appConfig));

	// Rate limiting middleware (after auth, so we can use userId)
	if (appConfig.rateLimit?.enabled) {
		try {
			const rateLimiter = RateLimiterFactory.create(
				appConfig.rateLimit.type,
				{
					maxRequests: appConfig.rateLimit.maxRequests,
					windowMs: appConfig.rateLimit.windowMs,
					keyPrefix: appConfig.rateLimit.keyPrefix,
					redisUrl: appConfig.rateLimit.redisUrl,
					redisOptions: {
						password: appConfig.rateLimit.redisPassword,
						db: appConfig.rateLimit.redisDb
					}
				}
			);

			router.use(createRateLimitMiddleware(rateLimiter));

			logger.info('Rate limiting enabled', {
				type: appConfig.rateLimit.type,
				maxRequests: appConfig.rateLimit.maxRequests,
				windowMs: appConfig.rateLimit.windowMs
			});

			// Cleanup on app close
			const cleanup = async (): Promise<void> => {
				await rateLimiter.close();
			};
			process.on('SIGINT', cleanup);
			process.on('SIGTERM', cleanup);
		} catch (error) {
			logger.error('Failed to initialize rate limiter:', error);
			logger.warn('Rate limiting is disabled due to initialization error');
		}
	} else {
		logger.info('Rate limiting is disabled');
	}

	// Routes
	router.use('/image', createImageGenerateRouter(appConfig));
	router.use('/request', createAiRequestRouter(appConfig));
	router.use('/providers', createAiProvidersRouter(appConfig));

	// Error handler
	router.use(
		(
			err: Error | Boom.Boom,
			req: AuthenticatedRequest,
			res: Response,
			_next: NextFunction
		): void => {
			if (Boom.isBoom(err)) {
				logger.warn('Request error', {
					statusCode: err.output.statusCode,
					message: err.message,
					path: req.path
				});

				res.status(err.output.statusCode).json({
					success: false,
					error: {
						code: err.output.statusCode,
						message: err.output.payload.message,
						details: err.data
					}
				});
			} else {
				logger.error(err);
				logger.error('Unhandled error', {
					error: err,
					path: req.path
				});

				res.status(500).json({
					success: false,
					error: {
						code: 500,
						message: 'Internal server error'
					}
				});
			}
		}
	);

	// Mount router to app at /ai path
	app.use('/ai', router);

	return app;
}
