import request from 'supertest';
import { createTestApp } from '../__tests__/setup.js';

describe('GET /ai/health', () => {
	const app = createTestApp();

	it('should return 200 with status ok (no auth required)', async () => {
		const res = await request(app).get('/ai/health');

		expect(res.status).toBe(200);
		expect(res.body.status).toBe('ok');
		expect(res.body.timestamp).toBeDefined();
		expect(Array.isArray(res.body.providers)).toBe(true);
	});
});
