import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// Storage is isolated per test, so every test file starts with an empty D1
// database: apply the real migrations once, then each test seeds what it needs.
beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
