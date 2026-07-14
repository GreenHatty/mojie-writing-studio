export const REQUIRED_WORKER_SECRETS = [
  'OWNER_INITIALIZATION_KEY',
  'LOCAL_DRAFT_KEK',
  'MOJIE_BACKUP_MASTER_KEY'
];

function productionOrigin(value) {
  if (!value) return null;
  const origin = new URL(value);
  if (origin.protocol !== 'https:' || origin.origin !== value) {
    throw new Error('APP_ORIGIN must be an exact HTTPS origin without a path');
  }
  return origin.origin;
}

export function createWorkerConfig(environment = process.env) {
  const appOrigin = productionOrigin(String(environment.APP_ORIGIN || '').trim());
  if (environment.CLOUDFLARE_D1_DATABASE_ID && !appOrigin) {
    throw new Error('APP_ORIGIN is required whenever the production D1 binding is configured');
  }

  const config = {
    name: environment.CLOUDFLARE_WORKER_NAME || 'mojie-writing-studio',
    compatibility_date: '2026-07-11',
    compatibility_flags: ['nodejs_compat'],
    main: 'server/index.js',
    workers_dev: true,
    assets: {
      binding: 'ASSETS',
      directory: 'client',
      not_found_handling: 'none',
      // The root document and private API must always reach the application
      // Worker. The fetch entry explicitly delegates immutable client files to
      // env.ASSETS before any application routing runs.
      run_worker_first: true
    },
    secrets: { required: [...REQUIRED_WORKER_SECRETS] },
    triggers: {
      crons: [environment.MOJIE_CRON_SCHEDULE || '*/15 * * * *']
    }
  };

  if (appOrigin) config.vars = { APP_ORIGIN: appOrigin, NODE_ENV: 'production' };
  if (environment.CLOUDFLARE_D1_DATABASE_ID) {
    config.d1_databases = [{
      binding: 'DB',
      database_name: environment.CLOUDFLARE_D1_DATABASE_NAME || 'mojie-writing-studio',
      database_id: environment.CLOUDFLARE_D1_DATABASE_ID,
      migrations_dir: '../migrations'
    }];
  }

  if (environment.CLOUDFLARE_DOCX_BUCKET_NAME) {
    config.r2_buckets = [{ binding: 'DOCX_BUCKET', bucket_name: environment.CLOUDFLARE_DOCX_BUCKET_NAME }];
  }
  return config;
}
