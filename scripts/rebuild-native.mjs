// Fetches a prebuilt better-sqlite3 binary matching the installed Electron's
// ABI, so the native module loads in the Electron runtime (its ABI differs from
// the system Node's). This avoids needing a C++ toolchain on the dev machine.
//
// npm install builds/fetches better-sqlite3 for the *system Node* ABI; this
// re-fetches it for Electron. Run after every install or Electron bump:
//   npm run rebuild
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const require = createRequire(import.meta.url)
const electronVersion = require('electron/package.json').version
const betterSqliteDir = dirname(require.resolve('better-sqlite3/package.json'))
const prebuildInstall = require.resolve('prebuild-install/bin.js')

console.log(`Fetching better-sqlite3 prebuild for Electron ${electronVersion} (${process.platform}-${process.arch})…`)

execFileSync(
  process.execPath,
  [
    prebuildInstall,
    '--runtime',
    'electron',
    '--target',
    electronVersion,
    '--arch',
    process.arch,
    '--platform',
    process.platform
  ],
  { cwd: betterSqliteDir, stdio: 'inherit' }
)

console.log('better-sqlite3 is now built against the Electron ABI.')
