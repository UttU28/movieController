module.exports = {
  apps: [
    {
      name: process.env.PM2_NAME || "moviecontroller-backend",
      script: "env/bin/uvicorn",
      args: `app:app --host ${process.env.HOST || "0.0.0.0"} --port ${process.env.PORT || "5000"}`,
      cwd: __dirname,
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        DISPLAY: process.env.DISPLAY || ":0",
        XAUTHORITY: process.env.XAUTHORITY || "",
        INPUT_BACKEND: process.env.INPUT_BACKEND || "auto",
      },
    },
  ],
};
