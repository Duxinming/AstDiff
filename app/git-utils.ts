import { execSync } from 'child_process'
import path from 'path'

export function getStagedFiles(): string[] {
  const output = execSync('git diff --cached --name-only --diff-filter=ACM')
    .toString()
    .trim()

  return output
    .split('\n')
    .filter(
      (file) =>
        file.endsWith('.js') ||
        file.endsWith('.jsx') ||
        file.endsWith('.ts') ||
        file.endsWith('.tsx')
    )
    .map((file) => path.resolve(process.cwd(), file))
}

export function getFileDiff(filePath: string): string {
  return execSync(`git diff --cached --unified=0 ${filePath}`).toString()
}

export function parseDiffHunks(diff: string): {
  added: string[]
  removed: string[]
} {
  const added: string[] = []
  const removed: string[] = []

  if (!diff) return { added, removed }

  const lines = diff.split('\n')
  let currentFile = ''
  let lineNumber = 0
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    // 检查文件头
    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      continue
    }

    // 检查差异块头
    const hunkHeaderMatch = line.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
    )
    if (hunkHeaderMatch) {
      oldLine = parseInt(hunkHeaderMatch[1])
      newLine = parseInt(hunkHeaderMatch[3])
      continue
    }

    // 解析差异内容
    if (line.startsWith('+')) {
      added.push(`${newLine}`)
      newLine++
    } else if (line.startsWith('-')) {
      removed.push(`${oldLine}`)
      oldLine++
    } else {
      // 上下文行，两边行号都增加
      oldLine++
      newLine++
    }
  }

  return { added, removed }
}
