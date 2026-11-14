// Serve the built UI without credentials, including when Android opens it
// outside Playwright's API interception. Never use this as a production server.
const { spawn } = require('node:child_process');
const fixture = process.env.QA_PIPELINE_FIXTURE === '1';
const child = spawn(process.execPath, [...(fixture ? ['--require', require.resolve('./upstream-fixture.cjs')] : []), require.resolve('next/dist/bin/next'), 'start', '-p', process.env.PORT || '3202'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: '', GROQ_API_KEY: fixture ? 'synthetic-test-key' : '', SUPABASE_SECRET_KEY: '', CRON_SECRET: '', SAVE_CAPTURES: '0' },
});
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
