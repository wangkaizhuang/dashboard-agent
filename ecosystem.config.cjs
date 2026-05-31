module.exports = {
  apps: [
    {
      name: "dashboard-agent-dev",
      script: "npm",
      args: "run dev",
      cwd: __dirname,
      env: {
        NODE_ENV: "development",
      },
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 1000,
      max_restarts: 20,
      min_uptime: "5s",
      kill_timeout: 5000,
    },
  ],
};
