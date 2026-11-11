import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';

declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {
		/** Migrations loaded by vitest.config.mts and applied in test/setup.ts. */
		TEST_MIGRATIONS: D1Migration[];
	}
}
