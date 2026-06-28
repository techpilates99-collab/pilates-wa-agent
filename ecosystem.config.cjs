module.exports = {
  apps: [
    {
      name: 'pilates-agent',
      script: 'dist/server.js',
      interpreter: 'node',
      cwd: 'C:/pilates-wa-agent',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'cf-tunnel',
      script: 'C:/Program Files (x86)/cloudflared/cloudflared.exe',
      args: 'tunnel --url http://localhost:3000',
      interpreter: 'none',
      cwd: 'C:/pilates-wa-agent'
    }
  ]
};
