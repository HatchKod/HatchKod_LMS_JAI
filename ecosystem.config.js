module.exports = {
  apps: [
    {
      name: "hatchkod-backend",
      script: "venv/bin/python",
      args: "-m uvicorn server:app --host 127.0.0.1 --port 8000",
      cwd: "./backend",
      interpreter: "none", // Using the direct path in 'script'
      env: {
        NODE_ENV: "production",
      },
      // Log management
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
