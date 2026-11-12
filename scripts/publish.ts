import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { readChangelog, releaseUnreleased, writeChangelog } from './changelog'

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Z.-]+)?$/i
const VERSION_FIELD_RE = /^(\s*"version"\s*:\s*")([^"]*)(")/m
const PATCH_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/

function readPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { version?: unknown }

  if (typeof packageJson.version !== 'string') {
    throw new TypeError('package.json does not contain a top-level string version field')
  }

  return packageJson.version
}

function bumpPatchVersion(version: string): string {
  const match = PATCH_VERSION_RE.exec(version)

  if (!match) {
    throw new Error(`Cannot auto bump non-standard version: ${version}`)
  }

  const [, major, minor, patch] = match
  return `${major}.${minor}.${Number(patch) + 1}`
}

function readVersionArg(): string | undefined {
  const args = process.argv.slice(2)

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '-v' || arg === '--version') {
      const version = args[i + 1]
      if (!version) {
        throw new Error('Missing version after -v/--version')
      }
      return version
    }

    if (arg.startsWith('--version=')) {
      return arg.slice('--version='.length)
    }
  }

  return undefined
}

async function resolveVersion(): Promise<string> {
  const versionArg = readVersionArg()

  if (versionArg) {
    return versionArg
  }

  const currentVersion = readPackageVersion()
  const nextVersion = bumpPatchVersion(currentVersion)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    const answer = (
      await rl.question(
        `Use ${nextVersion} (${currentVersion} -> ${nextVersion})? \nPress Enter to confirm, or enter another version: `,
      )
    ).trim()

    if (!answer) {
      return nextVersion
    }

    return answer
  } finally {
    rl.close()
  }
}

function updateVersionField(filePath: string, version: string): void {
  const content = readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(content) as { version?: unknown }

  if (typeof parsed.version !== 'string') {
    throw new TypeError(`${filePath} does not contain a top-level string version field`)
  }

  const nextContent = content.replace(VERSION_FIELD_RE, `$1${version}$3`)

  JSON.parse(nextContent)
  writeFileSync(filePath, nextContent)
}

function gitAdd(files: string[]): void {
  const result = spawnSync('git', ['add', ...files], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error('git add failed')
  }
}

async function main(): Promise<void> {
  const version = await resolveVersion()

  if (!VERSION_RE.test(version)) {
    throw new Error(`Invalid version: ${version}`)
  }

  const previous = readPackageVersion()
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  // 先整理更新日志：「未发布」为空会直接报错，版本号不会被改动
  const changelog = releaseUnreleased(readChangelog(), version, previous, date)

  const files = ['package.json', 'komari-theme.json', 'CHANGELOG.md']

  for (const file of files.slice(0, 2)) {
    updateVersionField(resolve(process.cwd(), file), version)
  }
  writeChangelog(changelog)

  gitAdd(files)
  console.log(`Prepared release version ${version} (${previous} -> ${version})`)
  console.log(`Staged: ${files.join(', ')}`)
  console.log(`Next: git commit -m "chore: 发布 ${version}" && git push origin master`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
