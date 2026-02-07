import request from 'supertest';
import nock from 'nock';
import {
	createTestApp,
	authHeader,
	mockFixture,
	OPENAI_BASE
} from '../__tests__/setup.js';

describe('POST /ai/image/generate', () => {
	const app = createTestApp();

	afterEach(() => {
		nock.cleanAll();
	});

	afterAll(() => {
		nock.restore();
	});

	it('should return 401 without API key', async () => {
		const res = await request(app)
			.post('/ai/image/generate')
			.send({
				provider: 'openai',
				request: { prompt: 'A red circle' }
			});

		expect(res.status).toBe(401);
	});

	it('should return 400 for invalid body', async () => {
		const res = await request(app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({ provider: '' });

		expect(res.status).toBe(400);
	});

	it('should return 400 for missing prompt', async () => {
		const res = await request(app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({
				provider: 'openai',
				request: {}
			});

		expect(res.status).toBe(400);
	});

	it('should proxy image generation through OpenAI', async () => {
		mockFixture('openai', 'image-generation');

		const res = await request(app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({
				provider: 'openai',
				request: {
					prompt: 'A simple red circle on white background',
					model: 'dall-e-2',
					n: 1,
					size: '256x256'
				}
			});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.result.images).toHaveLength(1);
		expect(res.body.result.images[0].b64_json).toBeDefined();
		expect(res.body.result.metadata.prompt).toBe(
			'A simple red circle on white background'
		);
	});

	it('should handle OpenAI API errors', async () => {
		nock(OPENAI_BASE).post('/v1/images/generations').reply(500, {
			error: {
				message: 'Internal server error',
				type: 'server_error',
				param: null,
				code: null
			}
		});

		const res = await request(app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({
				provider: 'openai',
				request: {
					prompt: 'A simple red circle',
					model: 'dall-e-2',
					n: 1,
					size: '256x256'
				}
			});

		expect(res.status).toBe(500);
	});

	it('should return 400 for unsupported provider', async () => {
		const res = await request(app)
			.post('/ai/image/generate')
			.set(authHeader())
			.send({
				provider: 'nonexistent',
				request: { prompt: 'A red circle' }
			});

		expect(res.status).toBe(400);
	});
});
