import type { Server } from 'http';
import type { Application, Router } from 'express';
import type {
	AppConfig,
	AuthCallback,
	UsageCallback,
	UsageStats
} from './types';
import { createApp } from './app';
import { logger } from './helpers/logger';
import { defaultConfig } from './config/default-config';
import packageJson from '../package.json' with { type: 'json' };
import merge from 'deepmerge';

const { version } = packageJson;

let server: Server | null = null;

// Re-export for direct use
export { createApp };
export type { AppConfig, AuthCallback, UsageCallback, UsageStats, Application, Router };
export * from './types';

/**
 * Start options interface
 */
export interface StartOptions {
	port?: number;
	config?: Partial<AppConfig>;
	checkAuthentication?: AuthCallback;
	onUsage?: UsageCallback;
	existingApp?: Application;
	existingRouter?: Router;
}

/**
 * Start the adapter service
 * Can work as standalone server OR integrate into existing Express app
 */
export async function start(
	options?: StartOptions | number,
	customConfig?: Partial<AppConfig>
): Promise<Server | Application> {
	// Support both old signature (port, config) and new (options object)
	let PORT: number;
	let config: Partial<AppConfig> | undefined;
	let checkAuthentication: AuthCallback | undefined;
	let onUsage: UsageCallback | undefined;
	let existingApp: Application | undefined;
	let existingRouter: Router | undefined;

	if (typeof options === 'object') {
		PORT = options.port ?? defaultConfig.port;
		config = options.config;
		checkAuthentication = options.checkAuthentication;
		onUsage = options.onUsage;
		existingApp = options.existingApp;
		existingRouter = options.existingRouter;
	} else {
		PORT = options ?? defaultConfig.port;
		config = customConfig;
	}

	if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
		logger.error('Invalid PORT. Must be a number between 1 and 65535.');
		throw new Error('Invalid PORT');
	}

	// Merge configuration
	const finalConfig: AppConfig = {
		...defaultConfig,
		...config,
		port: PORT,
		providers: merge(
			defaultConfig.providers,
			(config?.providers || {})
		)
	};

	// Add authentication callback if provided
	if (checkAuthentication) {
		finalConfig.checkAuthentication = checkAuthentication;
	}

	// Add usage tracking callback if provided
	if (onUsage) {
		finalConfig.onUsage = onUsage;
	}

	// Check if integrating into existing app
	if (existingApp) {
		// INTEGRATION MODE: Mount to existing app, don't start server
		const app = createApp(finalConfig, existingApp, existingRouter);
		logger.info('AI Adapter integrated as middleware at /ai/*');
		logger.info(`Supported providers: ${Object.keys(finalConfig.providers).join(', ')}`);
		return app;
	}

	// STANDALONE MODE: Create new server
	const app = createApp(finalConfig);

	return new Promise((resolve, reject) => {
		server = app.listen(PORT, (): void => {
			const message = `Jodit AI Adapter v${version} listening on port ${PORT}`;
			logger.info(message);
			logger.info(`Supported providers: ${Object.keys(finalConfig.providers).join(', ')}`);

			if (process.env.NODE_ENV === 'development') {
				logger.info('Environment: development');
				logger.info(`Health check: http://localhost:${PORT}/ai/health`);
			}

			if (server) {
				resolve(server);
			}
		});

		server.on('error', reject);
	});
}

/**
 * Stop the adapter service
 */
export async function stop(): Promise<void> {
	if (server === null || server === undefined) {
		logger.warn('Server is not running');
		return;
	}

	return new Promise((resolve, reject) => {
		server?.close((err?: Error) => {
			if (err !== null && err !== undefined) {
				logger.error(`Error during server shutdown: ${err.message}`);
				reject(err);
			} else {
				logger.info('Server closed');
				server = null;
				resolve();
			}
		});
	});
}

/**
 * Graceful shutdown handler
 */
const shutdown = async (signal: string): Promise<void> => {
	logger.info(`Received ${signal}, shutting down gracefully`);

	try {
		await stop();
		process.exit(0);
	} catch (error) {
		logger.error(
			`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`
		);
		process.exit(1);
	}
};

// Handle shutdown signals
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled rejections
process.once('unhandledRejection', async (err) => {
	logger.error(`unhandledRejection: ${err}`);
	await shutdown('unhandledRejection');
});
