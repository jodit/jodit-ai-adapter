#!/usr/bin/env node

/**
 * CLI entry point for running the adapter service
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Application, start } from './index';
import { logger } from './helpers/logger';
import type { AppConfig } from './types';

// Load environment variables

/**
 * Load configuration from file or environment
 */
function loadConfig(): Partial<AppConfig> | undefined {
	// Try CONFIG environment variable (JSON string)
	if (process.env.CONFIG) {
		try {
			return JSON.parse(process.env.CONFIG);
		} catch (error) {
			logger.error(error);
			throw new Error('Invalid CONFIG JSON', {
				cause: error
			});
		}
	}

	// Try CONFIG_FILE environment variable (path to JSON file)
	if (process.env.CONFIG_FILE) {
		try {
			const configPath = resolve(process.cwd(), process.env.CONFIG_FILE);
			const configContent = readFileSync(configPath, 'utf-8');
			return JSON.parse(configContent);
		} catch (error) {
			logger.error({
				path: process.env.CONFIG_FILE,
				error
			});
			throw new Error(
				`Failed to load config file: ${process.env.CONFIG_FILE}`,
				{
					cause: error
				}
			);
		}
	}

	// No custom config, use defaults
	return undefined;
}

/**
 * Main function
 */
async function main(): Promise<{
	app: Application;
	cleanup: () => Promise<unknown>;
}> {
	try {
		logger.info('Starting Jodit AI Adapter Service...');

		// Load configuration
		const config = loadConfig();

		if (config) {
			logger.info('Loaded custom configuration');
		} else {
			logger.info('Using default configuration');
		}

		// Start server
		return start({
			config
		});
	} catch (error) {
		logger.error('Failed to start service', { error });
		process.exit(1);
	}
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().then(
		({ cleanup }) => {
			/**
			 * Graceful shutdown handler
			 */
			const shutdown = async (signal: string): Promise<void> => {
				logger.info(`Received ${signal}, shutting down gracefully`);

				try {
					await cleanup();
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
		},
		(error) => {
			logger.error('Unhandled error in main', { error });
			process.exit(1);
		}
	);
}
