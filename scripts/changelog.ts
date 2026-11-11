/**
 * CHANGELOG.md 的读写：发版时把「未发布」整理成版本段落，CI 从版本段落生成 Release 说明。
 * 约定见 AGENTS.md 的「发版规则」。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

export const CHANGELOG_PATH = resolve(process.cwd(), 'CHANGELOG.md')
export const REPO_URL = 'https://github.com/hoobnn/komari-theme-tundra'

const UNRELEASED = '未发布'
const SECTION_RE = /^## \[([^\]]+)\][^\n]*$/gm

interface Section {
  name: string
  /** 标题行起点 */
  start: number
  /** 正文起点（标题行之后） */
  bodyStart: number
  /** 正文终点（下一个二级标题或链接定义之前） */
  end: number
}

function findSections(content: string): Section[] {
  const linkDefsAt = content.search(/^\[[^\]]+\]: /m)
  const limit = linkDefsAt === -1
    ? content.length
    : linkDefsAt
  const matches = [
    ...content.matchAll(SECTION_RE),
  ].filter(m => m.index! < limit)
  return matches.map((m, i) => ({
    name: m[1]!,
    start: m.index!,
    bodyStart: m.index! + m[0].length,
    end: i + 1 < matches.length
      ? matches[i + 1]!.index!
      : limit,
  }))
}

export function readChangelog(): string {
  return readFileSync(CHANGELOG_PATH, 'utf8')
}

/** 取某个版本段落的正文（不含标题行），找不到返回 null */
export function getSectionBody(content: string, version: string): string | null {
  const section = findSections(content).find(s => s.name === version)
  return section
    ? content.slice(section.bodyStart, section.end).trim()
    : null
}

/**
 * 把「未发布」段落改名为新版本并补上日期，留出新的空「未发布」，同时更新底部的对比链接。
 * 「未发布」为空时报错：每次发版都必须写更新内容。
 */
export function releaseUnreleased(content: string, version: string, previous: string, date: string): string {
  const sections = findSections(content)
  if (sections.some(s => s.name === version))
    throw new Error(`CHANGELOG.md 已经有 ${version} 段落`)
  const unreleased = sections.find(s => s.name === UNRELEASED)
  if (!unreleased)
    throw new Error('CHANGELOG.md 缺少「## [未发布]」段落')
  const body = content.slice(unreleased.bodyStart, unreleased.end).trim()
  if (!body)
    throw new Error('CHANGELOG.md 的「未发布」为空，先写好本次更新内容再发版')

  let next = `${content.slice(0, unreleased.start)}## [${UNRELEASED}]\n\n## [${version}] - ${date}\n\n${body}\n\n${content.slice(unreleased.end)}`

  const unreleasedLink = new RegExp(`^\\[${UNRELEASED}\\]: .*$`, 'm')
  const links = `[${UNRELEASED}]: ${REPO_URL}/compare/v${version}...HEAD\n[${version}]: ${REPO_URL}/compare/v${previous}...v${version}`
  next = unreleasedLink.test(next)
    ? next.replace(unreleasedLink, links)
    : `${next.trimEnd()}\n\n${links}\n`
  return next
}

export function writeChangelog(content: string): void {
  writeFileSync(CHANGELOG_PATH, content)
}
