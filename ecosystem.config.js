module.exports = {
  apps: [
    {
      name: "hatchkod-backend",
      script: "python3",
      args: "-m uvicorn server:app --host 127.0.0.1 --port 8000",
      cwd: "./backend",
      interpreter: "python3",
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
