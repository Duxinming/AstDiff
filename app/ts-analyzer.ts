import ts from 'typescript'
import { CodeEntity, DependencyEdge, SourcePosition } from './types'
import * as path from 'path'

export class TSAnalyzer {
  private program: ts.Program
  private checker: ts.TypeChecker

  constructor(tsConfigPath: string) {
    // 1. 读取并解析 tsconfig.json
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile)

    if (configFile.error) {
      throw new Error(
        `TSConfig 解析错误: ${this.formatDiagnostic(configFile.error)}`
      )
    }

    // 2. 转换为编译器配置
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(tsConfigPath)
    )

    if (parsedConfig.errors.length > 0) {
      throw new Error(
        `TSConfig 配置错误: ${parsedConfig.errors
          .map(this.formatDiagnostic)
          .join('\n')}`
      )
    }

    // 3. 创建完整的 TypeScript 程序
    this.program = ts.createProgram({
      rootNames: parsedConfig.fileNames,
      options: parsedConfig.options,
      configFileParsingDiagnostics: parsedConfig.errors,
      projectReferences: parsedConfig.projectReferences,
    })

    // 4. 获取类型检查器
    this.checker = this.program.getTypeChecker()
  }

  private formatDiagnostic(diagnostic: ts.Diagnostic): string {
    return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  }

  public analyzeFile(filePath: string): CodeEntity[] {
    const sourceFile = this.program.getSourceFile(filePath)
    if (!sourceFile) return []

    const entities: CodeEntity[] = []

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        entities.push(
          this.createEntity('function', node.name.text, filePath, node)
        )
      } else if (ts.isClassDeclaration(node) && node.name) {
        entities.push(
          this.createEntity('class', node.name.text, filePath, node)
        )
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        entities.push(
          this.createEntity('variable', node.name.text, filePath, node)
        )
      } else if (ts.isInterfaceDeclaration(node)) {
        entities.push(
          this.createEntity('interface', node.name.text, filePath, node)
        )
      } else if (ts.isTypeAliasDeclaration(node)) {
        entities.push(this.createEntity('type', node.name.text, filePath, node))
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return entities
  }

  public findDependencies(sourceEntity: CodeEntity): DependencyEdge[] {
    // 使用 TypeScript 类型系统查找精确依赖
    const edges: DependencyEdge[] = []
    const sourceFile = this.program.getSourceFile(sourceEntity.filePath)

    if (!sourceFile) return edges

    const visitor = (node: ts.Node) => {
      // 分析导入关系
      if (ts.isImportDeclaration(node)) {
        this.processImport(node, sourceEntity, edges)
      }

      // 分析函数调用
      if (ts.isCallExpression(node)) {
        this.processCall(node, sourceEntity, edges)
      }

      // 分析类继承
      if (ts.isClassDeclaration(node) && node.heritageClauses) {
        this.processHeritage(node, sourceEntity, edges)
      }

      ts.forEachChild(node, visitor)
    }

    visitor(sourceFile)
    return edges
  }

  private createEntity(
    type: CodeEntity['type'],
    name: string,
    filePath: string,
    node: ts.Node
  ): CodeEntity {
    return {
      type,
      name,
      filePath,
      position: this.getNodePosition(node),
    }
  }

  private processImport(
    node: ts.ImportDeclaration,
    source: CodeEntity,
    edges: DependencyEdge[]
  ) {
    // 1. 获取导入的模块路径
    const moduleSpecifier = node.moduleSpecifier
    if (!ts.isStringLiteral(moduleSpecifier)) return

    const importedModulePath = moduleSpecifier.text

    // 2. 解析导入的模块绝对路径
    const importedFile = this.resolveModulePath(
      importedModulePath,
      source.filePath
    )
    if (!importedFile) return

    // 3. 分析导入的每个绑定
    const importClause = node.importClause
    if (!importClause) return

    // 处理默认导入
    if (importClause.name) {
      const importedName = importClause.name.text
      edges.push({
        source,
        target: {
          type: 'variable',
          name: importedName,
          filePath: path.normalize(importedFile),
          position: this.getNodePosition(importClause.name),
        },
        relation: 'import',
      })
    }

    // 处理命名导入
    if (importClause.namedBindings) {
      if (ts.isNamedImports(importClause.namedBindings)) {
        importClause.namedBindings.elements.forEach((element) => {
          const importedName = element.name.text
          edges.push({
            source,
            target: {
              type: 'variable',
              name: importedName,
              filePath: path.normalize(importedFile),
              position: this.getNodePosition(element.name),
            },
            relation: 'import',
          })
        })
      }
      // 处理命名空间导入 (import * as ns from 'module')
      else if (ts.isNamespaceImport(importClause.namedBindings)) {
        const namespaceName = importClause.namedBindings.name.text
        edges.push({
          source,
          target: {
            type: 'namespace',
            name: namespaceName,
            filePath: path.normalize(importedFile),
            position: this.getNodePosition(importClause.namedBindings.name),
          },
          relation: 'import',
        })
      }
    }
  }

  private resolveModulePath(
    importPath: string,
    referencingFile: string
  ): string | null {
    try {
      // 使用 TypeScript 的模块解析逻辑
      const resolved = ts.resolveModuleName(
        importPath,
        referencingFile,
        this.program.getCompilerOptions(),
        ts.sys
      )

      if (resolved.resolvedModule) {
        return resolved.resolvedModule.resolvedFileName
      }

      // 尝试简单路径解析 (作为备用方案)
      if (importPath.startsWith('.')) {
        return path.resolve(path.dirname(referencingFile), importPath)
      }

      return null
    } catch (error) {
      console.warn(`无法解析模块路径: ${importPath} (从 ${referencingFile})`)
      return null
    }
  }

  private processCall(
    node: ts.CallExpression,
    source: CodeEntity,
    edges: DependencyEdge[]
  ) {
    // 1. 获取调用目标
    const callTarget = node.expression

    // 2. 处理简单标识符调用 (如 foo())
    if (ts.isIdentifier(callTarget)) {
      this.processIdentifierCall(callTarget, source, edges, node)
    }
    // 3. 处理属性访问调用 (如 obj.method())
    else if (ts.isPropertyAccessExpression(callTarget)) {
      this.processPropertyAccessCall(callTarget, source, edges, node)
    }
    // 4. 处理元素访问调用 (如 obj['method']())
    else if (ts.isElementAccessExpression(callTarget)) {
      this.processElementAccessCall(callTarget, source, edges, node)
    }
    // 5. 处理其他类型的调用表达式
    else {
      this.processOtherCallExpressions(callTarget, source, edges, node)
    }
  }

  private processIdentifierCall(
    identifier: ts.Identifier,
    source: CodeEntity,
    edges: DependencyEdge[],
    callNode: ts.CallExpression
  ) {
    const calledFunctionName = identifier.text

    // 检查是否是本地定义的函数
    const localDefinition = this.findLocalDefinition(
      calledFunctionName,
      source.filePath
    )
    if (localDefinition) {
      edges.push({
        source,
        target: localDefinition,
        relation: 'call',
        position: this.getNodePosition(callNode),
      })
      return
    }

    // 检查是否是导入的函数
    const importedDefinition = this.findImportedDefinition(
      calledFunctionName,
      source.filePath
    )
    if (importedDefinition) {
      edges.push({
        source,
        target: importedDefinition,
        relation: 'call',
        position: this.getNodePosition(callNode),
      })
      return
    }

    // 无法解析的函数调用
    edges.push({
      source,
      target: {
        type: 'unresolved',
        name: calledFunctionName,
        filePath: 'UNRESOLVED',
        position: this.getNodePosition(identifier),
      },
      relation: 'unresolved-call',
      position: this.getNodePosition(callNode),
    })
  }

  private processPropertyAccessCall(
    expr: ts.PropertyAccessExpression,
    source: CodeEntity,
    edges: DependencyEdge[],
    callNode: ts.CallExpression
  ) {
    const methodName = expr.name.text

    // 尝试解析属性访问的符号
    const symbol = this.checker.getSymbolAtLocation(expr)
    if (!symbol) return

    // 获取方法定义
    const declarations = symbol.getDeclarations()
    if (!declarations || declarations.length === 0) return

    // 处理第一个声明 (简化处理)
    const declaration = declarations[0]
    const targetFile = declaration.getSourceFile().fileName

    // 获取包含类/对象的信息
    let containerName = ''
    if (ts.isClassElement(declaration)) {
      containerName = this.getClassOrInterfaceName(declaration.parent)
    }

    edges.push({
      source,
      target: {
        type: 'method',
        name: containerName ? `${containerName}.${methodName}` : methodName,
        filePath: path.normalize(targetFile),
        position: this.getNodePosition(declaration),
      },
      relation: 'call',
      position: this.getNodePosition(callNode),
    })
  }

  private processElementAccessCall(
    expr: ts.ElementAccessExpression,
    source: CodeEntity,
    edges: DependencyEdge[],
    callNode: ts.CallExpression
  ) {
    // 只有当索引是字符串字面量时才处理 (如 obj['method']())
    if (ts.isStringLiteral(expr.argumentExpression)) {
      const methodName = expr.argumentExpression.text
      const symbol = this.checker.getSymbolAtLocation(expr.expression)

      if (symbol) {
        const declarations = symbol.getDeclarations()
        if (declarations && declarations.length > 0) {
          const declaration = declarations[0]
          const targetFile = declaration.getSourceFile().fileName

          edges.push({
            source,
            target: {
              type: 'method',
              name: methodName,
              filePath: path.normalize(targetFile),
              position: this.getNodePosition(declaration),
            },
            relation: 'call',
            position: this.getNodePosition(callNode),
          })
        }
      }
    }
  }

  private processOtherCallExpressions(
    expr: ts.Expression,
    source: CodeEntity,
    edges: DependencyEdge[],
    callNode: ts.CallExpression
  ) {
    // 处理 new 表达式 (如 new Class())
    if (ts.isNewExpression(expr)) {
      const identifier = expr.expression
      if (ts.isIdentifier(identifier)) {
        this.processIdentifierCall(identifier, source, edges, callNode)
      }
    }
    // 可以添加其他特殊调用类型的处理
  }

  private findLocalDefinition(
    name: string,
    filePath: string
  ): CodeEntity | null {
    // 在当前文件中查找函数/方法定义
    const sourceFile = this.program.getSourceFile(filePath)
    if (!sourceFile) return null

    let foundEntity: CodeEntity | null = null

    const visit = (node: ts.Node) => {
      if (foundEntity) return

      if (
        (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.name.text === name
      ) {
        foundEntity = {
          type: ts.isFunctionDeclaration(node) ? 'function' : 'variable',
          name,
          filePath,
          position: this.getNodePosition(node),
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return foundEntity
  }

  private findImportedDefinition(
    name: string,
    filePath: string
  ): CodeEntity | null {
    // 在导入符号中查找定义
    const sourceFile = this.program.getSourceFile(filePath)
    if (!sourceFile) return null

    const importSpecifiers = this.findImportSpecifiers(sourceFile)
    const specifier = importSpecifiers.find(
      (s) => s.importedName === name || s.localName === name
    )

    if (specifier) {
      return {
        type: 'function', // 假设导入的是函数
        name: specifier.importedName,
        filePath: path.normalize(specifier.modulePath),
        position: this.getNodePosition(specifier.node),
      }
    }

    return null
  }
  private findImportSpecifiers(sourceFile: ts.SourceFile): {
    node: ts.ImportSpecifier | ts.NamespaceImport | ts.ImportClause
    importedName: string
    localName: string
    modulePath: string
  }[] {
    const importSpecifiers: {
      node: ts.ImportSpecifier | ts.NamespaceImport | ts.ImportClause
      importedName: string
      localName: string
      modulePath: string
    }[] = []

    // 遍历AST查找所有导入声明
    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isImportDeclaration(node)) return

      const moduleSpecifier = node.moduleSpecifier
      if (!ts.isStringLiteral(moduleSpecifier)) return

      const modulePath = moduleSpecifier.text
      const importClause = node.importClause
      if (!importClause) return

      // 处理默认导入 (import defaultName from 'module')
      if (importClause.name) {
        importSpecifiers.push({
          node: importClause,
          importedName: 'default',
          localName: importClause.name.text,
          modulePath,
        })
      }

      // 处理命名空间导入 (import * as namespace from 'module')
      if (
        importClause.namedBindings &&
        ts.isNamespaceImport(importClause.namedBindings)
      ) {
        importSpecifiers.push({
          node: importClause.namedBindings,
          importedName: '*',
          localName: importClause.namedBindings.name.text,
          modulePath,
        })
      }

      // 处理命名导入 (import { name } from 'module')
      if (
        importClause.namedBindings &&
        ts.isNamedImports(importClause.namedBindings)
      ) {
        importClause.namedBindings.elements.forEach((element) => {
          importSpecifiers.push({
            node: element,
            importedName: element.propertyName
              ? element.propertyName.text
              : element.name.text,
            localName: element.name.text,
            modulePath,
          })
        })
      }
    })

    return importSpecifiers
  }

  private getClassOrInterfaceName(node: ts.Node): string {
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      return node.name?.text || 'anonymous'
    }
    return ''
  }

  private getNodePosition(node: ts.Node): SourcePosition {
    const sourceFile = node.getSourceFile()
    const { line:lineStart, character } = sourceFile.getLineAndCharacterOfPosition(
      node.pos
    )
    const { line:lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.end)
    return { line: [lineStart + 1, lineEnd + 1], column: character + 1 }
  }

  private processHeritage(
    node: ts.ClassDeclaration,
    source: CodeEntity,
    edges: DependencyEdge[]
  ) {
    // 实现类继承关系分析
  }
}
