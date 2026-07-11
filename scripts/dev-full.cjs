const { spawn } = require('node:child_process')

const isWindows = process.platform === 'win32'
const npm = isWindows ? 'npm.cmd' : 'npm'

const children = [
  spawn('node', ['server.cjs'], {
    cwd: process.cwd(),
    shell: false,
    stdio: 'inherit',
  }),
  spawn(npm, ['run', 'dev', '--', '--host', '0.0.0.0'], {
    cwd: process.cwd(),
    shell: isWindows,
    stdio: 'inherit',
  }),
]

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stopAll()
      process.exit(code)
    }
  })
}

process.on('SIGINT', () => {
  stopAll()
  process.exit(0)
})
