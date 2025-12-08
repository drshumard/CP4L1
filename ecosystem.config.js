module.exports = {
  apps: [
    {
      name: 'wellness-backend',
      script: '/var/www/wellness-portal/backend/venv/bin/uvicorn',
      args: 'server:app --host 0.0.0.0 --port 8001',
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
      script: 'npx',
      args: 'serve -s build -l 3000',
      cwd: '/var/www/wellness-portal/frontend',
      interpreter: 'none',
      env: {
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
