const { spawn } = require('child_process');
const path = require('path');

// Prefer DOCKER_DATABASE_URL then DATABASE_URL
const dbUrl = process.env.DOCKER_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('No DATABASE_URL or DOCKER_DATABASE_URL found in environment. Set one in your .env or export it when running this script.');
  process.exit(1);
}

console.log('Launching Prisma Studio with DATABASE_URL:', dbUrl.replace(/:(.*)@/, ':***@'));

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(cmd, ['prisma', 'studio', '--schema', path.join('prisma','schema.prisma')], {
  env: { ...process.env, DATABASE_URL: dbUrl },
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => process.exit(code));
***