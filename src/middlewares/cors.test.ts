import express, { type Express } from 'express';
import request from 'supertest';
import { corsMiddleware } from './cors';
import type { AppConfig } from '../types';

function createApp(configOverrides: Partial<AppConfig> = {}): Express {
	const config: AppConfig = {
		port: 0,
		debug: false,
		requestTimeout: 30_000,
		maxRetries: 0,
		requireReferer: false,
		providers: {},
		...configOverrides
	};

	const app = express();
	app.use(corsMiddleware(config));
	app.get('/test', (_req, res) => res.json({ ok: true }));
	return app;
}

describe('corsMiddleware', () => {
	describe('default behaviour (no cors/corsOrigin)', () => {
		it('echoes origin when no origin configured and Origin header present', async () => {
			const res = await request(createApp())
				.get('/test')
				.set('Origin', 'http://example.com');

			expect(res.headers['access-control-allow-origin']).toBe(
				'http://example.com'
			);
		});

		it('sets wildcard when no origin configured and no Origin header', async () => {
			const res = await request(createApp()).get('/test');

			expect(res.headers['access-control-allow-origin']).toBe('*');
		});

		it('uses default methods, headers, credentials and max-age', async () => {
			const res = await request(createApp()).get('/test');

			expect(res.headers['access-control-allow-methods']).toBe(
				'GET, POST, OPTIONS, PUT, DELETE'
			);
			expect(res.headers['access-control-allow-headers']).toBe(
				'Content-Type, Authorization, x-api-key, x-requested-with'
			);
			expect(res.headers['access-control-allow-credentials']).toBe(
				'true'
			);
			expect(res.headers['access-control-max-age']).toBe('86400');
		});
	});

	describe('legacy corsOrigin field', () => {
		it('allows specific origin string', async () => {
			const app = createApp({ corsOrigin: 'http://allowed.com' });
			const res = await request(app)
				.get('/test')
				.set('Origin', 'http://allowed.com');

			expect(res.headers['access-control-allow-origin']).toBe(
				'http://allowed.com'
			);
		});

		it('rejects non-matching origin string', async () => {
			const app = createApp({ corsOrigin: 'http://allowed.com' });
			const res = await request(app)
				.get('/test')
				.set('Origin', 'http://other.com');

			expect(res.headers['access-control-allow-origin']).toBeUndefined();
		});

		it('supports array of origins', async () => {
			const app = createApp({
				corsOrigin: ['http://a.com', 'http://b.com']
			});

			const res = await request(app)
				.get('/test')
				.set('Origin', 'http://b.com');

			expect(res.headers['access-control-allow-origin']).toBe(
				'http://b.com'
			);
		});

		it('supports RegExp origin', async () => {
			const app = createApp({ corsOrigin: /\.example\.com$/ });
			const res = await request(app)
				.get('/test')
				.set('Origin', 'http://sub.example.com');

			expect(res.headers['access-control-allow-origin']).toBe(
				'http://sub.example.com'
			);
		});
	});

	describe('cors config object', () => {
		it('cors.origin takes precedence over corsOrigin', async () => {
			const app = createApp({
				corsOrigin: 'http://old.com',
				cors: { origin: 'http://new.com' }
			});

			const res = await request(app)
				.get('/test')
				.set('Origin', 'http://new.com');

			expect(res.headers['access-control-allow-origin']).toBe(
				'http://new.com'
			);
		});

		it('custom methods', async () => {
			const app = createApp({ cors: { methods: 'GET, POST' } });
			const res = await request(app).get('/test');

			expect(res.headers['access-control-allow-methods']).toBe(
				'GET, POST'
			);
		});

		it('custom allowedHeaders', async () => {
			const app = createApp({
				cors: { allowedHeaders: 'X-Custom, Authorization' }
			});
			const res = await request(app).get('/test');

			expect(res.headers['access-control-allow-headers']).toBe(
				'X-Custom, Authorization'
			);
		});

		it('credentials false', async () => {
			const app = createApp({ cors: { credentials: false } });
			const res = await request(app).get('/test');

			expect(res.headers['access-control-allow-credentials']).toBe(
				'false'
			);
		});

		it('custom maxAge', async () => {
			const app = createApp({ cors: { maxAge: 3600 } });
			const res = await request(app).get('/test');

			expect(res.headers['access-control-max-age']).toBe('3600');
		});
	});

	describe('preflight', () => {
		it('responds 204 to OPTIONS requests', async () => {
			const res = await request(createApp())
				.options('/test')
				.set('Origin', 'http://example.com');

			expect(res.status).toBe(204);
			expect(res.headers['access-control-allow-methods']).toBe(
				'GET, POST, OPTIONS, PUT, DELETE'
			);
		});

		it('uses custom methods in preflight', async () => {
			const app = createApp({ cors: { methods: 'GET' } });
			const res = await request(app)
				.options('/test')
				.set('Origin', 'http://example.com');

			expect(res.status).toBe(204);
			expect(res.headers['access-control-allow-methods']).toBe('GET');
		});
	});
});
