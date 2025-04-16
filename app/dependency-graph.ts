import { DependencyGraph, CodeEntity, DependencyEdge } from './types'
import { TSAnalyzer } from './ts-analyzer'

export class DependencyGraphBuilder {
  private graph: DependencyGraph
  private TSAnalyzer: TSAnalyzer

  constructor(tsConfigPath: string) {
    this.graph = {
      entities: new Map(),
      edges: [],
    }
    this.TSAnalyzer = new TSAnalyzer(tsConfigPath)
  }

  public buildForProject(entryFiles: string[]): DependencyGraph {
    // 从入口文件开始构建整个项目的依赖图
    const visitedFiles = new Set<string>()

    const processFile = (filePath: string) => {
      if (visitedFiles.has(filePath)) return
      visitedFiles.add(filePath)

      const entities = this.TSAnalyzer.analyzeFile(filePath)
      
      entities.forEach((entity) => {
        const entityKey = this.getEntityKey(entity)
        // 过滤掉 node_modules 中的文件
        if (!entityKey.includes('node_modules')){
          this.graph.entities.set(entityKey, entity)

          const edges = this.TSAnalyzer.findDependencies(entity)
          edges.forEach((edge) => {
            this.graph.edges.push(edge)
            // 递归处理依赖文件
            if (!visitedFiles.has(edge.target.filePath)) {
              processFile(edge.target.filePath)
            }
          })
        }
      })
    }

    entryFiles.forEach(processFile)
    return this.graph
  }

  private getEntityKey(entity: CodeEntity): string {
    return `${entity.filePath}:${entity.name}:${entity.type}`
  }
}
