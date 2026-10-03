import { spawnSync } from 'node:child_process'

process.env.NUXT_DESKTOP = '1'
const result = spawnSync('npx nuxi generate', { shell: true, stdio: 'inherit', env: process.env })
if (result.error) throw result.error
process.exit(result.status ?? 1)
