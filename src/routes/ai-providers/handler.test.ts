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
});
