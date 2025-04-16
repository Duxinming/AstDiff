import fs from 'fs'
import path from 'path'
import { parse as babelParse } from '@babel/parser'
import traverse from '@babel/traverse'
import {
  File,
  ImportDeclaration,
  CallExpression,
  StringLiteral,
} from '@babel/types'

// 类型定义
interface Dependency {
  source: string
  resolvedPath: string
  dynamic?: boolean
  absolutePath: string
}

interface FileDependencies {
  path: string
  dependencies: Dependency[]
  dependents: string[]
}

interface DependencyGraph {
  [filePath: string]: FileDependencies
}

// 配置支持的扩展名
const SUPPORTED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx']

// 主函数：分析项目依赖
export async function analyzeDependencies(
  projectRoot: string
): Promise<DependencyGraph> {
  const dependencyGraph: DependencyGraph = {}
  console.log('正在分析项目依赖...')
  // 1. 收集所有源文件
  const files = await collectSourceFiles(projectRoot)

  // 2. 解析每个文件的依赖
  for (const file of files) {
    // console.log(`正在分析 ${file}`)
    const normalizedPath1 = path.normalize(file)
    // const relativePath = path.relative(projectRoot, file)
    const dependencies = await analyzeFileDependencies(file, projectRoot)

    dependencyGraph[normalizedPath1] = {
      path: normalizedPath1,
      dependencies,
      dependents: [], // 稍后填充
    }
  }

  // 3. 构建完整的依赖关系图（包括被依赖关系）
  buildCompleteDependencyGraph(dependencyGraph)
  fs.writeFileSync(
    'D:/code/AstDiff/out/dependencyGraph.json',
    JSON.stringify(dependencyGraph, null, 2)
  )
  return dependencyGraph
}

// 收集所有源文件
async function collectSourceFiles(
  dir: string,
  fileList: string[] = []
): Promise<string[]> {
  const files = await fs.promises.readdir(dir)

  for (const file of files) {
    const fullPath = path.join(dir, file)
    const stat = await fs.promises.stat(fullPath)

    if (stat.isDirectory()) {
      // 忽略 node_modules 和其他常见排除目录
      if (
        file === 'node_modules' ||
        file.startsWith('.') ||
        file === 'dist' ||
        file === 'build'
      ) {
        continue
      }
      await collectSourceFiles(fullPath, fileList)
    } else if (
      SUPPORTED_EXTENSIONS.includes(path.extname(file).toLowerCase())
    ) {
      fileList.push(fullPath)
    }
  }

  return fileList
}

// 分析单个文件的依赖
async function analyzeFileDependencies(
  filePath: string,
  projectRoot: string
): Promise<Dependency[]> {
  const code = await fs.promises.readFile(filePath, 'utf-8')
  const ext = path.extname(filePath).toLowerCase()

  try {
    // 解析为 AST
    const ast = babelParse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'decorators-legacy', // 装饰器支持
        'classProperties', // 通常与装饰器一起使用
        ext === '.ts' || ext === '.tsx' ? 'typescript' : null,
      ].filter(Boolean) as any[],
    })

    const dependencies: Dependency[] = []

    // 遍历 AST 寻找导入
    traverse(ast, {
      ImportDeclaration({ node }: { node: ImportDeclaration }) {
        const source = node.source.value

        if (
          !source.startsWith('.') &&
          !source.startsWith('/') &&
          !source.startsWith('@/')
        ) {
          // 忽略 node_modules 依赖
          return
        }

        if (
          filePath ===
          'D:\\hand\\re-front\\packages\\re-mes-front\\src\\routes\\process\\MaterialProcessRouteC7n\\detail.tsx'
        ) {
          console.log(node)
        }

        // 解析为绝对路径
        const absolutePath = resolveImportPath(source, filePath, projectRoot)
        if (absolutePath) {
          dependencies.push({
            source,
            resolvedPath: path.relative(projectRoot, absolutePath),
            absolutePath,
          })
        }
      },
      CallExpression({ node }: { node: CallExpression }) {
        // 处理动态导入 import()
        if (node.callee.type === 'Import') {
          const sourceNode = node.arguments[0]
          if (sourceNode && sourceNode.type === 'StringLiteral') {
            const source = sourceNode.value
            if (!source.startsWith('.') && !source.startsWith('/')) {
              return
            }

            const absolutePath = resolveImportPath(
              source,
              filePath,
              projectRoot
            )
            if (absolutePath) {
              dependencies.push({
                source,
                resolvedPath: path.relative(projectRoot, absolutePath),
                dynamic: true,
                absolutePath,
              })
            }
          }
        }

        // 处理 require() 调用
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0
        ) {
          const sourceNode = node.arguments[0]
          if (sourceNode && sourceNode.type === 'StringLiteral') {
            const source = sourceNode.value
            if (!source.startsWith('.') && !source.startsWith('/')) {
              return
            }

            const absolutePath = resolveImportPath(
              source,
              filePath,
              projectRoot
            )
            if (absolutePath) {
              dependencies.push({
                source,
                resolvedPath: path.relative(projectRoot, absolutePath),
                dynamic: true,
                absolutePath,
              })
            }
          }
        }
      },
    })

    return dependencies
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, (error as Error).message)
    return []
  }
}

// 解析导入路径为绝对路径
function resolveImportPath(
  source: string,
  importerPath: string,
  projectRoot: string
): string | null {
  try {
    // 处理相对路径
    if (source.startsWith('.')) {
      const dir = path.dirname(importerPath)
      let fullPath = path.resolve(dir, source)

      // 尝试添加扩展名
      if (!path.extname(fullPath)) {
        for (const ext of SUPPORTED_EXTENSIONS) {
          const candidate = `${fullPath}${ext}`
          if (fs.existsSync(candidate)) {
            return candidate
          }

          // 尝试 index 文件
          const indexCandidate = path.join(fullPath, `index${ext}`)
          if (fs.existsSync(indexCandidate)) {
            return indexCandidate
          }
        }
      }

      // 如果已经有扩展名或上述尝试失败
      if (fs.existsSync(fullPath)) {
        return fullPath
      }

      return null
    }

    // 处理项目根目录绝对路径
    if (source.startsWith('/')) {
      let fullPath = path.join(projectRoot, source)

      // 尝试添加扩展名
      if (!path.extname(fullPath)) {
        for (const ext of SUPPORTED_EXTENSIONS) {
          const candidate = `${fullPath}${ext}`
          if (fs.existsSync(candidate)) {
            return candidate
          }

          // 尝试 index 文件
          const indexCandidate = path.join(fullPath, `index${ext}`)
          if (fs.existsSync(indexCandidate)) {
            return indexCandidate
          }
        }
      }

      if (fs.existsSync(fullPath)) {
        return fullPath
      }

      return null
    }

    if (source.startsWith('@/')) {
      let fullPath = path.join(projectRoot, source.replace(/^@/, 'src'))
      console.log("🚀 ~ fullPath:", fullPath)
      if (!path.extname(fullPath)) {
        for (const ext of SUPPORTED_EXTENSIONS) {
          const candidate = `${fullPath}${ext}`
          if (fs.existsSync(candidate)) {
            return candidate
          }

          // 尝试 index 文件
          const indexCandidate = path.join(fullPath, `index${ext}`)
          if (fs.existsSync(indexCandidate)) {
            return indexCandidate
          }
        }
      }
      
    }

    return null
  } catch (error) {
    console.error(
      `Error resolving import "${source}" in ${importerPath}:`,
      error
    )
    return null
  }
}

// 构建完整的依赖关系图（包括被依赖关系）
function buildCompleteDependencyGraph(graph: DependencyGraph): void {
  // 首先初始化所有文件的 dependents 数组
  for (const file in graph) {
    graph[file].dependents = []
  }

  // 然后填充 dependents
  for (const file in graph) {
    for (const dep of graph[file].dependencies) {
      const depFile = dep.absolutePath
      if (graph[depFile] && !graph[depFile].dependents.includes(file)) {
        graph[depFile].dependents.push(file)
      }
    }
  }
}
