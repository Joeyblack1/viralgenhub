// Start-up watchdog (ViralGenHub #178).
//
// The backend and the orchestrator sometimes freeze for good while loading
// (no output, no port, main thread stuck in a futex wait). It is timing
// dependent: a fresh start usually gets past it. This script runs next to
// `pnpm run pm2` while the container starts, restarts an app that is not
// ready within READY_MS of its own start, then exits once both are ready.
// Plain Node, no dependencies, never touches a running, healthy app.
//
// Restart = kill the app's processes, not `pm2 restart`: pm2 only manages the
// `pnpm start` wrapper, so `pm2 restart` leaves the real node process (and its
// dotenv parent) running as an orphan next to the new one. Killing them makes
// pm2's autorestart start exactly one fresh copy.
const { execFile } = require('child_process');
const fs = require('fs');
const http = require('http');

const READY_MS = 4 * 60 * 1000; // a normal start takes ~2 min
const MAX_RESTARTS = 6;
const GIVE_UP_MS = 45 * 60 * 1000;
const LOGS = `${process.env.HOME || '/root'}/.pm2/logs`;

const log = (msg) =>
  console.log(`[startup-watchdog] ${new Date().toISOString()} ${msg}`);

const pm2 = (args) =>
  new Promise((resolve) =>
    execFile('pm2', args, { maxBuffer: 16 * 1024 * 1024 }, (err, out) =>
      resolve(err ? null : out)
    )
  );

// Every process (sh, dotenv, node) whose command line runs this app's main.js.
const killApp = (name) => {
  const marker = `dist/apps/${name}/src/main.js`;
  let killed = 0;
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    let cmd = '';
    try {
      cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    } catch {
      continue;
    }
    if (cmd.includes(marker) && +pid !== process.pid) {
      try {
        process.kill(+pid, 'SIGKILL');
        killed += 1;
      } catch {
        /* already gone */
      }
    }
  }
  return killed;
};

const backendReady = () =>
  new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: 3000, path: '/', timeout: 5000 },
      (res) => {
        res.resume();
        resolve(res.statusCode < 500);
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });

// The Temporal worker logs "taskQueue: 'main', state: 'RUNNING'" to stderr;
// only a line written after this start of the app counts.
const orchestratorReady = (startedAt) => {
  try {
    return fs
      .readFileSync(`${LOGS}/orchestrator-error.log`, 'utf8')
      .split('\n')
      .some(
        (line) =>
          line.includes("taskQueue: 'main', state: 'RUNNING'") &&
          Date.parse(line.slice(0, 24)) >= startedAt
      );
  } catch {
    return false;
  }
};

const checks = {
  backend: () => backendReady(),
  orchestrator: orchestratorReady,
};
const restarts = { backend: 0, orchestrator: 0 };
const ready = new Set();
// One restart at a time: on 21 Oct, apps restarted together froze again
// more often than an app restarted alone.
let restarting = null;
const began = Date.now();

const tick = async () => {
  const out = await pm2(['jlist']);
  let apps = [];
  try {
    apps = JSON.parse(out || '[]');
  } catch {
    /* pm2 not up yet */
  }
  for (const name of Object.keys(checks)) {
    if (ready.has(name)) continue;
    const app = apps.find((a) => a.name === name);
    if (!app || app.pm2_env.status !== 'online') continue;
    const startedAt = app.pm2_env.pm_uptime;
    if (await checks[name](startedAt)) {
      ready.add(name);
      if (restarting === name) restarting = null;
      log(
        `${name} ready after ${Math.round((Date.now() - startedAt) / 1000)}s`
      );
    } else if (
      Date.now() - startedAt > READY_MS &&
      restarts[name] < MAX_RESTARTS &&
      (restarting === null ||
        restarting === name ||
        restarts[restarting] >= MAX_RESTARTS)
    ) {
      restarts[name] += 1;
      restarting = name;
      const killed = killApp(name);
      log(
        `${name} not ready ${
          READY_MS / 60000
        } min after start: killed ${killed} processes, pm2 starts it again (${
          restarts[name]
        }/${MAX_RESTARTS})`
      );
    }
  }
  if (ready.size === Object.keys(checks).length) {
    log('backend and orchestrator ready; exiting');
    return;
  }
  if (Date.now() - began > GIVE_UP_MS) {
    log(
      `giving up after ${GIVE_UP_MS / 60000} min; not ready: ${Object.keys(
        checks
      )
        .filter((n) => !ready.has(n))
        .join(', ')}`
    );
    return;
  }
  setTimeout(tick, 15000);
};

log('watching backend and orchestrator start-up');
setTimeout(tick, 15000);
