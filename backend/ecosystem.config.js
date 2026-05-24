module.exports = {
  apps: [
    {
      name: "hatchkod-backend",
      script: "venv/bin/python",
      args: "-m uvicorn server:app --host 127.0.0.1 --port 8000",
      cwd: "/home/ec2-user/HatchKod_LMS_JAI/backend",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
