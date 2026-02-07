import nock from 'nock';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Application } from 'express';
import type { AppConfig } from '../../types/index.js';
import { createApp } from '../../app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', '..', 'adapters', '__fixtures__');

export const OPENAI_BASE = 'https://api.openai.com';

/** UUID that passes the default /^[A-F0-9-]{36}$/i pattern */
export const TEST_API_KEY = '12345678-1234-1234-1234-123456789abc';

export function authHeader() {
	return { Authorization: `Bearer ${TEST_API_KEY}` };
}

/**
 * Load a fixture JSON file.
 * @param provider - provider subfolder (e.g. 'openai')
 * @param name     - fixture name without extension (e.g. 'text-generation')
 */
export function loadFixture(provider: string, name: string) {
	const filePath = path.join(FIXTURES_DIR, provider, `${name}.json`);
	return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Set up a nock interceptor from a fixture file.
 * Returns the nock scope so callers can assert `scope.isDone()`.
 */
export function mockFixture(provider: string, name: string) {
	const fixture = loadFixture(provider, name);
	const url = new URL(fixture.request.url);
	const scope = nock(url.origin)
		.post(url.pathname)
		.reply(fixture.response.status, fixture.response.body);
	return { scope, fixture };
}

/**
 * Create a fully wired Express app for testing.
 * No proxy, no rate-limiting, test-friendly auth.
 */
export function createTestApp(overrides?: Partial<AppConfig>): Application {
	const config: AppConfig = {
		port: 0,
		debug: false,
		requestTimeout: 30_000,
		maxRetries: 0,
		corsOrigin: '*',
		requireReferer: false,
		providers: {
			openai: {
				type: 'openai',
				apiKey: 'test-key-for-adapter',
				defaultModel: 'gpt-4.1-nano'
			}
		},
		...overrides
	};

	return createApp(config);
}
