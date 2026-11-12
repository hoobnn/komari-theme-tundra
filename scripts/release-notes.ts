/**
 * 输出某个版本的 Release 说明（CHANGELOG 段落 + 完整对比链接），供 CI 发 Release 使用。
 * 用法：bun scripts/release-notes.ts 0.1.3 > notes.md
 * 段落缺失或为空时以非零退出，阻止发出没有说明的 Release。
 */
import process from 'node:process'
import { getSectionBody, readChangelog, REPO_URL } from './changelog'

const [version, previous] = process.argv.slice(2)

if (!version) {
  console.error('用法：bun scripts/release-notes.ts <version> [previous-version]')
  process.exit(1)
}

const body = getSectionBody(readChangelog(), version)

if (!body) {
  console.error(`CHANGELOG.md 里没有 ${version} 的更新内容`)
  process.exit(1)
}

const compare = previous ? `\n\n**完整变更**：${REPO_URL}/compare/v${previous}...v${version}` : ''

process.stdout.write(`${body}${compare}\n`)
