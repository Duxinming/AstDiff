import path from 'path'
import { DependencyGraph, CodeEntity } from './types'
import { getFileDiff, parseDiffHunks } from './git-utils'

export class ImpactAnalyzer {
  constructor(private graph: DependencyGraph) {}

  public analyzeImpact(changedFiles: string[]): CodeEntity[] {
    const impactedEntities = new Set<CodeEntity>()

    changedFiles.forEach((filePath) => {
      const diff = getFileDiff(filePath)

      const { added, removed } = parseDiffHunks(diff)

      const changedEntities = this.findChangedEntities(filePath, added, removed)
      const impacted = this.findImpactedEntities(changedEntities)

      impacted.forEach((entity) => impactedEntities.add(entity))
    })

    return Array.from(impactedEntities)
  }

  private findChangedEntities(
    filePath: string,
    addedLines: string[],
    removedLines: string[]
  ): CodeEntity[] {
    // 根据变更的行号范围找到受影响的代码实体
    return Array.from(this.graph.entities.values())
      .filter((entity) => {
        // 规范化路径
        const normalizedPath1 = path.normalize(entity.filePath)
        const normalizedPath2 = path.normalize(filePath)
        return normalizedPath1 === normalizedPath2
      })
      .filter((entity) => {
        const pos = entity.position
        if (!pos) return false

        // 简化实现，实际应该检查行号范围
        return (
          addedLines.some((line) => this.getInludesLines(pos.line, Number(line))) ||
          removedLines.some((line) => this.getInludesLines(pos.line, Number(line)))
        )
      })
  }

  private findImpactedEntities(changedEntities: CodeEntity[]): CodeEntity[] {
    const impacted = new Set<CodeEntity>()
    const visited = new Set<string>()

    const visit = (entity: CodeEntity) => {
      const key = `${entity.filePath}:${entity.name}:${entity.type}`
      if (visited.has(key)) return

      visited.add(key)
      impacted.add(entity)

      // 查找所有依赖此实体的其他实体
      this.graph.edges
        .filter(
          (edge) =>
            edge.target.filePath === entity.filePath &&
            edge.target.name === entity.name &&
            edge.target.type === entity.type
        )
        .forEach((edge) => {
          visit(edge.source)
        })
    }

    changedEntities.forEach(visit)
    return Array.from(impacted)
  }

  private getInludesLines(lines: number[], line: number) {
    const [startLine, endLine] = lines
    return startLine <= line && endLine >= line
  }
}
