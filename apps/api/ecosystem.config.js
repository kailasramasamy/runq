module.exports = {
  apps: [{
    name: 'runq-api',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3003,
    },
    env_production: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/runq/api-error.log',
    out_file: '/var/log/runq/api-out.log',
    merge_logs: true,
  }],
};
