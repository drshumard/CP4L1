module.exports = {
  apps: [
    {
      name: 'wellness-backend',
      script: 'venv/bin/python',
      args: 'server.py',
      cwd: '/var/www/wellness-portal/backend',
      interpreter: 'none',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      error_file: '/var/www/wellness-portal/logs/backend-error.log',
      out_file: '/var/www/wellness-portal/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: 'wellness-frontend',
      script: 'serve',
      args: '-s build -l 3000',
      cwd: '/var/www/wellness-portal/frontend',
      env: {
        PM2_SERVE_PATH: '/var/www/wellness-portal/frontend/build',
        PM2_SERVE_PORT: 3000,
        PM2_SERVE_SPA: 'true',
        NODE_ENV: 'production',
      },
      error_file: '/var/www/wellness-portal/logs/frontend-error.log',
      out_file: '/var/www/wellness-portal/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
    },
  ],
};
