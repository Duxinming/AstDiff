// 类型定义
interface Dependency {
  source: string
  resolvedPath: string
  dynamic?: boolean
}

interface FileDependencies {
  path: string
  dependencies: Dependency[]
  dependents: string[]
}

interface DependencyGraph {
  [filePath: string]: FileDependencies
}

export function findAffectedFilesEnhanced(
  changedFile: string,
  dependencyGraph: DependencyGraph
): { affectedFiles: string[]; hasCircularDependency: boolean } {
  const affected = new Set<string>()
  const visited = new Set<string>()
  let hasCircular = false

  function visit(file: string, path: string[]) {
    if (affected.has(file)) return

    // 检测循环依赖
    if (path.includes(file)) {
      console.warn(`发现循环依赖: ${path.join(' -> ')} -> ${file}`)
      hasCircular = true
      return
    }

    affected.add(file)
    const newPath = [...path, file]

    // 递归处理所有依赖该文件的文件
    for (const dependent of dependencyGraph[file]?.dependents || []) {
      visit(dependent, newPath)
    }
  }

  visit(changedFile, [])
  return {
    affectedFiles: Array.from(affected),
    hasCircularDependency: hasCircular,
  }
}
