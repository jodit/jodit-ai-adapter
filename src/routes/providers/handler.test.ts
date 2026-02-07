import request from 'supertest';
import { createTestApp, authHeader } from '../__tests__/setup.js';

describe('GET /ai/providers', () => {
	const app = createTestApp();

	it('should return 401 without API key', async () => {
		const res = await request(app).get('/ai/providers');
		expect(res.status).toBe(401);
	});

	it('should return providers list with valid API key', async () => {
		const res = await request(app)
			.get('/ai/providers')
			.set(authHeader());

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(Array.isArray(res.body.providers)).toBe(true);
		expect(res.body.providers[0]).toMatchObject({
			name: 'openai',
			type: 'openai',
			configured: true
		});
		expect(Array.isArray(res.body.supported)).toBe(true);
	});

	it('should not include disabled providers', async () => {
		const appWithDisabled = createTestApp({
			providers: {
				openai: {
					type: 'openai',
					apiKey: 'test-key',
					enabled: false
				},
				deepseek: {
					type: 'deepseek',
					apiKey: 'test-key',
					enabled: true
				}
			}
		});

		const res = await request(appWithDisabled)
			.get('/ai/providers')
			.set(authHeader());

		expect(res.status).toBe(200);
		expect(res.body.providers).toHaveLength(1);
		expect(res.body.providers[0].name).toBe('deepseek');
	});

	it('should include providers without explicit enabled field', async () => {
		const res = await request(app)
			.get('/ai/providers')
			.set(authHeader());

		expect(res.status).toBe(200);
		expect(res.body.providers).toHaveLength(1);
		expect(res.body.providers[0].name).toBe('openai');
	});
});
