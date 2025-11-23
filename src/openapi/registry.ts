import fs from 'node:fs';
import path from 'node:path';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { logger } from '../helpers/logger';

const ROUTES = path.resolve(process.cwd(), 'src/routes');

export function initRegistry(): Promise<OpenAPIRegistry> {
	const registry = new OpenAPIRegistry();

	// Register security schemes
	registry.registerComponent('securitySchemes', 'BearerAuth', {
		type: 'http',
		scheme: 'bearer',
		description: 'API key in Authorization header as Bearer token'
	});

	registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
		type: 'apiKey',
		in: 'header',
		name: 'x-api-key',
		description: 'API key in x-api-key header'
	});

	registry.registerComponent('securitySchemes', 'ApiKeyQuery', {
		type: 'apiKey',
		in: 'query',
		name: 'apikey',
		description: 'API key in query parameter'
	});

	return Promise.all(
		fs
			.readdirSync(ROUTES, {
				withFileTypes: true
			})
			.filter(item => item.isDirectory())
			.map(async item => {
				const openAPIScheme = path.resolve(ROUTES, item.name, 'openapi.ts');

				if (!fs.existsSync(openAPIScheme)) {
					logger.warn(`OpenAPI scheme for route ${item.name} does not exist, skipping`);
					return;
				}

				const route = (await import(openAPIScheme)).default;

				registry.registerPath(route);
				logger.debug(`Registered route: ${route.method.toUpperCase()} ${route.path}`);
			})
	)
		.then(() => {
			logger.info('OpenAPI registry initialized successfully');
			return registry;
		})
		.catch(error => {
			logger.error('Error initializing OpenAPI registry:', error);
			return registry;
		});
}
