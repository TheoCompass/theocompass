import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// D1-backed tests (roadmap, quiz stats) need the schema, so the migration files
// are read here and applied per test file in test/setup.ts. That keeps the suite
// on the exact schema the worker deploys with instead of a hand-written copy.
const migrations = await readD1Migrations('./migrations');

export default defineWorkersConfig({
	test: {
		setupFiles: ['./test/setup.ts'],
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				// The production KV namespace in wrangler.jsonc is declared
				// `"remote": true`. By default the pool (remoteBindings defaults to true)
				// tries to open a remote preview session for it, which needs Cloudflare
				// auth and makes the suite un-runnable offline. Disable that so tests
				// always run against local, isolated storage.
				remoteBindings: false,
				miniflare: {
					kvNamespaces: ['THEOCOMPASS_CACHE'],
					d1Databases: ['DB'],
					bindings: { TEST_MIGRATIONS: migrations },
				},
			},
		},
	},
});

