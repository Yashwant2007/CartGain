import { spawnSync } from 'node:child_process'

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const args = [
  'jest',
  'src/lib/benchmark/__tests__/CARTGAIN_GENESIS_LIVE_RUNNER.test.ts',
  '--runInBand',
]
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env: { ...process.env, CARTGAIN_GENESIS_LIVE_RUN: '1' },
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

if (result.error) console.error(result.error)
process.exit(result.status ?? 1)
