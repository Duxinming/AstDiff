"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TSAnalyzer = void 0;
const typescript_1 = __importDefault(require("typescript"));
const path = __importStar(require("path"));
class TSAnalyzer {
    constructor(tsConfigPath) {
        // 1. 读取并解析 tsconfig.json
        const configFile = typescript_1.default.readConfigFile(tsConfigPath, typescript_1.default.sys.readFile);
        if (configFile.error) {
            throw new Error(`TSConfig 解析错误: ${this.formatDiagnostic(configFile.error)}`);
        }
        // 2. 转换为编译器配置
        const parsedConfig = typescript_1.default.parseJsonConfigFileContent(configFile.config, typescript_1.default.sys, path.dirname(tsConfigPath));
        if (parsedConfig.errors.length > 0) {
            throw new Error(`TSConfig 配置错误: ${parsedConfig.errors
                .map(this.formatDiagnostic)
                .join('\n')}`);
        }
        // 3. 创建完整的 TypeScript 程序
        this.program = typescript_1.default.createProgram({
            rootNames: parsedConfig.fileNames,
            options: parsedConfig.options,
            configFileParsingDiagnostics: parsedConfig.errors,
            projectReferences: parsedConfig.projectReferences,
        });
        // 4. 获取类型检查器
        this.checker = this.program.getTypeChecker();
    }
    formatDiagnostic(diagnostic) {
        return typescript_1.default.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    }
    analyzeFile(filePath) {
        const sourceFile = this.program.getSourceFile(filePath);
        if (!sourceFile)
            return [];
        const entities = [];
        const visit = (node) => {
            if (typescript_1.default.isFunctionDeclaration(node) && node.name) {
                entities.push(this.createEntity('function', node.name.text, filePath, node));
            }
            else if (typescript_1.default.isClassDeclaration(node) && node.name) {
                entities.push(this.createEntity('class', node.name.text, filePath, node));
            }
            else if (typescript_1.default.isVariableDeclaration(node) && typescript_1.default.isIdentifier(node.name)) {
                entities.push(this.createEntity('variable', node.name.text, filePath, node));
            }
            else if (typescript_1.default.isInterfaceDeclaration(node)) {
                entities.push(this.createEntity('interface', node.name.text, filePath, node));
            }
            else if (typescript_1.default.isTypeAliasDeclaration(node)) {
                entities.push(this.createEntity('type', node.name.text, filePath, node));
            }
            typescript_1.default.forEachChild(node, visit);
        };
        visit(sourceFile);
        return entities;
    }
    findDependencies(sourceEntity) {
        // 使用 TypeScript 类型系统查找精确依赖
        const edges = [];
        const sourceFile = this.program.getSourceFile(sourceEntity.filePath);
        if (!sourceFile)
            return edges;
        const visitor = (node) => {
            // 分析导入关系
            if (typescript_1.default.isImportDeclaration(node)) {
                this.processImport(node, sourceEntity, edges);
            }
            // 分析函数调用
            if (typescript_1.default.isCallExpression(node)) {
                this.processCall(node, sourceEntity, edges);
            }
            // 分析类继承
            if (typescript_1.default.isClassDeclaration(node) && node.heritageClauses) {
                this.processHeritage(node, sourceEntity, edges);
            }
            typescript_1.default.forEachChild(node, visitor);
        };
        visitor(sourceFile);
        return edges;
    }
    createEntity(type, name, filePath, node) {
        return {
            type,
            name,
            filePath,
            position: this.getNodePosition(node),
        };
    }
    processImport(node, source, edges) {
        // 1. 获取导入的模块路径
        const moduleSpecifier = node.moduleSpecifier;
        if (!typescript_1.default.isStringLiteral(moduleSpecifier))
            return;
        const importedModulePath = moduleSpecifier.text;
        // 2. 解析导入的模块绝对路径
        const importedFile = this.resolveModulePath(importedModulePath, source.filePath);
        if (!importedFile)
            return;
        // 3. 分析导入的每个绑定
        const importClause = node.importClause;
        if (!importClause)
            return;
        // 处理默认导入
        if (importClause.name) {
            const importedName = importClause.name.text;
            edges.push({
                source,
                target: {
                    type: 'variable',
                    name: importedName,
                    filePath: path.normalize(importedFile),
                    position: this.getNodePosition(importClause.name),
                },
                relation: 'import',
            });
        }
        // 处理命名导入
        if (importClause.namedBindings) {
            if (typescript_1.default.isNamedImports(importClause.namedBindings)) {
                importClause.namedBindings.elements.forEach((element) => {
                    const importedName = element.name.text;
                    edges.push({
                        source,
                        target: {
                            type: 'variable',
                            name: importedName,
                            filePath: path.normalize(importedFile),
                            position: this.getNodePosition(element.name),
                        },
                        relation: 'import',
                    });
                });
            }
            // 处理命名空间导入 (import * as ns from 'module')
            else if (typescript_1.default.isNamespaceImport(importClause.namedBindings)) {
                const namespaceName = importClause.namedBindings.name.text;
                edges.push({
                    source,
                    target: {
                        type: 'namespace',
                        name: namespaceName,
                        filePath: path.normalize(importedFile),
                        position: this.getNodePosition(importClause.namedBindings.name),
                    },
                    relation: 'import',
                });
            }
        }
    }
    resolveModulePath(importPath, referencingFile) {
        try {
            // 使用 TypeScript 的模块解析逻辑
            const resolved = typescript_1.default.resolveModuleName(importPath, referencingFile, this.program.getCompilerOptions(), typescript_1.default.sys);
            if (resolved.resolvedModule) {
                return resolved.resolvedModule.resolvedFileName;
            }
            // 尝试简单路径解析 (作为备用方案)
            if (importPath.startsWith('.')) {
                return path.resolve(path.dirname(referencingFile), importPath);
            }
            return null;
        }
        catch (error) {
            console.warn(`无法解析模块路径: ${importPath} (从 ${referencingFile})`);
            return null;
        }
    }
    processCall(node, source, edges) {
        // 1. 获取调用目标
        const callTarget = node.expression;
        // 2. 处理简单标识符调用 (如 foo())
        if (typescript_1.default.isIdentifier(callTarget)) {
            this.processIdentifierCall(callTarget, source, edges, node);
        }
        // 3. 处理属性访问调用 (如 obj.method())
        else if (typescript_1.default.isPropertyAccessExpression(callTarget)) {
            this.processPropertyAccessCall(callTarget, source, edges, node);
        }
        // 4. 处理元素访问调用 (如 obj['method']())
        else if (typescript_1.default.isElementAccessExpression(callTarget)) {
            this.processElementAccessCall(callTarget, source, edges, node);
        }
        // 5. 处理其他类型的调用表达式
        else {
            this.processOtherCallExpressions(callTarget, source, edges, node);
        }
    }
    processIdentifierCall(identifier, source, edges, callNode) {
        const calledFunctionName = identifier.text;
        // 检查是否是本地定义的函数
        const localDefinition = this.findLocalDefinition(calledFunctionName, source.filePath);
        if (localDefinition) {
            edges.push({
                source,
                target: localDefinition,
                relation: 'call',
                position: this.getNodePosition(callNode),
            });
            return;
        }
        // 检查是否是导入的函数
        const importedDefinition = this.findImportedDefinition(calledFunctionName, source.filePath);
        if (importedDefinition) {
            edges.push({
                source,
                target: importedDefinition,
                relation: 'call',
                position: this.getNodePosition(callNode),
            });
            return;
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
        });
    }
    processPropertyAccessCall(expr, source, edges, callNode) {
        const methodName = expr.name.text;
        // 尝试解析属性访问的符号
        const symbol = this.checker.getSymbolAtLocation(expr);
        if (!symbol)
            return;
        // 获取方法定义
        const declarations = symbol.getDeclarations();
        if (!declarations || declarations.length === 0)
            return;
        // 处理第一个声明 (简化处理)
        const declaration = declarations[0];
        const targetFile = declaration.getSourceFile().fileName;
        // 获取包含类/对象的信息
        let containerName = '';
        if (typescript_1.default.isClassElement(declaration)) {
            containerName = this.getClassOrInterfaceName(declaration.parent);
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
        });
    }
    processElementAccessCall(expr, source, edges, callNode) {
        // 只有当索引是字符串字面量时才处理 (如 obj['method']())
        if (typescript_1.default.isStringLiteral(expr.argumentExpression)) {
            const methodName = expr.argumentExpression.text;
            const symbol = this.checker.getSymbolAtLocation(expr.expression);
            if (symbol) {
                const declarations = symbol.getDeclarations();
                if (declarations && declarations.length > 0) {
                    const declaration = declarations[0];
                    const targetFile = declaration.getSourceFile().fileName;
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
                    });
                }
            }
        }
    }
    processOtherCallExpressions(expr, source, edges, callNode) {
        // 处理 new 表达式 (如 new Class())
        if (typescript_1.default.isNewExpression(expr)) {
            const identifier = expr.expression;
            if (typescript_1.default.isIdentifier(identifier)) {
                this.processIdentifierCall(identifier, source, edges, callNode);
            }
        }
        // 可以添加其他特殊调用类型的处理
    }
    findLocalDefinition(name, filePath) {
        // 在当前文件中查找函数/方法定义
        const sourceFile = this.program.getSourceFile(filePath);
        if (!sourceFile)
            return null;
        let foundEntity = null;
        const visit = (node) => {
            if (foundEntity)
                return;
            if ((typescript_1.default.isFunctionDeclaration(node) || typescript_1.default.isVariableDeclaration(node)) &&
                node.name &&
                typescript_1.default.isIdentifier(node.name) &&
                node.name.text === name) {
                foundEntity = {
                    type: typescript_1.default.isFunctionDeclaration(node) ? 'function' : 'variable',
                    name,
                    filePath,
                    position: this.getNodePosition(node),
                };
            }
            typescript_1.default.forEachChild(node, visit);
        };
        visit(sourceFile);
        return foundEntity;
    }
    findImportedDefinition(name, filePath) {
        // 在导入符号中查找定义
        const sourceFile = this.program.getSourceFile(filePath);
        if (!sourceFile)
            return null;
        const importSpecifiers = this.findImportSpecifiers(sourceFile);
        const specifier = importSpecifiers.find((s) => s.importedName === name || s.localName === name);
        if (specifier) {
            return {
                type: 'function', // 假设导入的是函数
                name: specifier.importedName,
                filePath: path.normalize(specifier.modulePath),
                position: this.getNodePosition(specifier.node),
            };
        }
        return null;
    }
    findImportSpecifiers(sourceFile) {
        const importSpecifiers = [];
        // 遍历AST查找所有导入声明
        typescript_1.default.forEachChild(sourceFile, (node) => {
            if (!typescript_1.default.isImportDeclaration(node))
                return;
            const moduleSpecifier = node.moduleSpecifier;
            if (!typescript_1.default.isStringLiteral(moduleSpecifier))
                return;
            const modulePath = moduleSpecifier.text;
            const importClause = node.importClause;
            if (!importClause)
                return;
            // 处理默认导入 (import defaultName from 'module')
            if (importClause.name) {
                importSpecifiers.push({
                    node: importClause,
                    importedName: 'default',
                    localName: importClause.name.text,
                    modulePath,
                });
            }
            // 处理命名空间导入 (import * as namespace from 'module')
            if (importClause.namedBindings &&
                typescript_1.default.isNamespaceImport(importClause.namedBindings)) {
                importSpecifiers.push({
                    node: importClause.namedBindings,
                    importedName: '*',
                    localName: importClause.namedBindings.name.text,
                    modulePath,
                });
            }
            // 处理命名导入 (import { name } from 'module')
            if (importClause.namedBindings &&
                typescript_1.default.isNamedImports(importClause.namedBindings)) {
                importClause.namedBindings.elements.forEach((element) => {
                    importSpecifiers.push({
                        node: element,
                        importedName: element.propertyName
                            ? element.propertyName.text
                            : element.name.text,
                        localName: element.name.text,
                        modulePath,
                    });
                });
            }
        });
        return importSpecifiers;
    }
    getClassOrInterfaceName(node) {
        var _a;
        if (typescript_1.default.isClassDeclaration(node) || typescript_1.default.isInterfaceDeclaration(node)) {
            return ((_a = node.name) === null || _a === void 0 ? void 0 : _a.text) || 'anonymous';
        }
        return '';
    }
    getNodePosition(node) {
        const sourceFile = node.getSourceFile();
        const { line: lineStart, character } = sourceFile.getLineAndCharacterOfPosition(node.pos);
        const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.end);
        return { line: [lineStart + 1, lineEnd + 1], column: character + 1 };
    }
    processHeritage(node, source, edges) {
        // 实现类继承关系分析
    }
}
exports.TSAnalyzer = TSAnalyzer;
