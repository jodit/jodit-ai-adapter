import type { StartedTestContainer } from 'testcontainers';
import { execFileSync } from 'node:child_process';

export default async function teardown(): Promise<void> {
	// Stop Redis container if it was started
	// @ts-expect-error - global variable set in setup
	const container = global.__REDIS_CONTAINER__ as
		| StartedTestContainer
		| undefined;

	if (container) {
		try {
			await container.stop();
			console.info('Redis container stopped');
		} catch {
			// testcontainers .stop() fails with Colima — fall back to CLI
			try {
				execFileSync('docker', ['rm', '-f', container.getId()], {
					stdio: 'ignore'
				});
				console.info('Redis container stopped via docker CLI');
			} catch {
				// container may already be gone — ignore
			}
		}
	}
}
