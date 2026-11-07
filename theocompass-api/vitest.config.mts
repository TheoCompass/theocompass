import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
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
				},
			},
		},
	},
});
