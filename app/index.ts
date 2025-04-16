import { DependencyGraphBuilder } from './dependency-graph'
import { ImpactAnalyzer } from './impact-analyzer'
import { analyzeDependencies } from './ast-analyzer'
import { getStagedFiles } from './git-utils'
import { findAffectedFilesEnhanced } from './utils'

import * as fs from 'fs'

export async function main() {
  try {
    const changedFiles = getStagedFiles()
    console.log(changedFiles)
    if (changedFiles.length === 0) {
      console.log('没有检测到 TypeScript 文件变更')
      process.exit(0)
    }

    const set = new Set()
    const astDepenciesTree = await analyzeDependencies(
      'D:/hand/re-front/packages/re-mes-front'
    )
    console.log('正在寻找当前文件变更的依赖关系...')
    changedFiles.forEach((file) => {
      const { affectedFiles, hasCircularDependency } =
        findAffectedFilesEnhanced(file, astDepenciesTree)
      if (!hasCircularDependency) {
        affectedFiles.forEach((affectedFile) => {
          set.add(affectedFile)
        })
      }
    })
    console.log(Array.from(set))
    console.log('正在分析项目依赖关系...')
    const graphBuilder = new DependencyGraphBuilder(
      'D:/hand/re-front/packages/re-mes-front/tsconfig.json'
    )
    // 从项目入口开始
    const graph = graphBuilder.buildForProject(Array.from(set) as string[])
    fs.writeFileSync(
      'D:/code/AstDiff/out/graph.json',
      JSON.stringify(Array.from(graph.entities.values()), null, 2)
    )
    console.log('分析变更影响范围...')
    const analyzer = new ImpactAnalyzer(graph)
    const impacted = analyzer.analyzeImpact(changedFiles)

    if (impacted.length > 0) {
      console.log('\n本次提交可能影响以下代码实体:')
      impacted.forEach((entity) => {
        console.log(
          `- ${entity.type} ${entity.name} (${entity.filePath}) - 起始行号: ${entity.position?.line[0]} - 结束行号: ${entity.position?.line[1]}`
        )
      })

      // 如果影响超过阈值，可以阻止提交
      // process.exit(1);
    } else {
      console.log('未检测到重大影响范围')
    }

    process.exit(0)
  } catch (error) {
    console.error('分析失败:', error)
    process.exit(1)
  }
}
