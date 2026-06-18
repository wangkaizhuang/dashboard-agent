module.exports = {
  apps: [
    {
      name: "dashboard-agent-dev",
      script: "npm",
      args: "run dev",
      cwd: __dirname,
      env: {
        NODE_ENV: "development",
        // Raise V8 stack & heap ceilings so the dev server crashes LESS often.
        // Inherited by the child `next dev` process. --stack-size guards against
        // "Maximum call stack size exceeded"; --max-old-space-size against
        // "JavaScript heap out of memory". autorestart below is the safety net
        // for crashes these don't prevent.
        NODE_OPTIONS: "--stack-size=4000 --max-old-space-size=4096",
      },
      // Restart automatically whenever the process exits unexpectedly.
      autorestart: true,
      // next has its own file watcher; don't let pm2 also restart on file changes.
      watch: false,
      // Exponential backoff between restarts so a crash-loop doesn't thrash the CPU
      // (1s, 2s, 4s, … capped by pm2).
      exp_backoff_restart_delay: 1000,
      // Give up after 20 rapid crashes — a persistent failure, not a transient blip.
      max_restarts: 20,
      // A start only counts as "healthy" if it stays up at least 5s.
      min_uptime: "5s",
      // Grace period for the process to exit cleanly on stop/restart before SIGKILL.
      kill_timeout: 5000,
    },
  ],
};
