"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeDependencies = analyzeDependencies;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
// 配置支持的扩展名
const SUPPORTED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
// 主函数：分析项目依赖
async function analyzeDependencies(projectRoot) {
    const dependencyGraph = {};
    console.log('正在分析项目依赖...');
    // 1. 收集所有源文件
    const files = await collectSourceFiles(projectRoot);
    // 2. 解析每个文件的依赖
    for (const file of files) {
        // console.log(`正在分析 ${file}`)
        const normalizedPath1 = path_1.default.normalize(file);
        // const relativePath = path.relative(projectRoot, file)
        const dependencies = await analyzeFileDependencies(file, projectRoot);
        dependencyGraph[normalizedPath1] = {
            path: normalizedPath1,
            dependencies,
            dependents: [], // 稍后填充
        };
    }
    // 3. 构建完整的依赖关系图（包括被依赖关系）
    buildCompleteDependencyGraph(dependencyGraph);
    fs_1.default.writeFileSync('D:/code/AstDiff/out/dependencyGraph.json', JSON.stringify(dependencyGraph, null, 2));
    return dependencyGraph;
}
// 收集所有源文件
async function collectSourceFiles(dir, fileList = []) {
    const files = await fs_1.default.promises.readdir(dir);
    for (const file of files) {
        const fullPath = path_1.default.join(dir, file);
        const stat = await fs_1.default.promises.stat(fullPath);
        if (stat.isDirectory()) {
            // 忽略 node_modules 和其他常见排除目录
            if (file === 'node_modules' ||
                file.startsWith('.') ||
                file === 'dist' ||
                file === 'build') {
                continue;
            }
            await collectSourceFiles(fullPath, fileList);
        }
        else if (SUPPORTED_EXTENSIONS.includes(path_1.default.extname(file).toLowerCase())) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}
// 分析单个文件的依赖
async function analyzeFileDependencies(filePath, projectRoot) {
    const code = await fs_1.default.promises.readFile(filePath, 'utf-8');
    const ext = path_1.default.extname(filePath).toLowerCase();
    try {
        // 解析为 AST
        const ast = (0, parser_1.parse)(code, {
            sourceType: 'module',
            plugins: [
                'jsx',
                'decorators-legacy', // 装饰器支持
                'classProperties', // 通常与装饰器一起使用
                ext === '.ts' || ext === '.tsx' ? 'typescript' : null,
            ].filter(Boolean),
        });
        const dependencies = [];
        // 遍历 AST 寻找导入
        (0, traverse_1.default)(ast, {
            ImportDeclaration({ node }) {
                const source = node.source.value;
                if (!source.startsWith('.') &&
                    !source.startsWith('/') &&
                    !source.startsWith('@/')) {
                    // 忽略 node_modules 依赖
                    return;
                }
                if (filePath ===
                    'D:\\hand\\re-front\\packages\\re-mes-front\\src\\routes\\process\\MaterialProcessRouteC7n\\detail.tsx') {
                    console.log(node);
                }
                // 解析为绝对路径
                const absolutePath = resolveImportPath(source, filePath, projectRoot);
                if (absolutePath) {
                    dependencies.push({
                        source,
                        resolvedPath: path_1.default.relative(projectRoot, absolutePath),
                        absolutePath,
                    });
                }
            },
            CallExpression({ node }) {
                // 处理动态导入 import()
                if (node.callee.type === 'Import') {
                    const sourceNode = node.arguments[0];
                    if (sourceNode && sourceNode.type === 'StringLiteral') {
                        const source = sourceNode.value;
                        if (!source.startsWith('.') && !source.startsWith('/')) {
                            return;
                        }
                        const absolutePath = resolveImportPath(source, filePath, projectRoot);
                        if (absolutePath) {
                            dependencies.push({
                                source,
                                resolvedPath: path_1.default.relative(projectRoot, absolutePath),
                                dynamic: true,
                                absolutePath,
                            });
                        }
                    }
                }
                // 处理 require() 调用
                if (node.callee.type === 'Identifier' &&
                    node.callee.name === 'require' &&
                    node.arguments.length > 0) {
                    const sourceNode = node.arguments[0];
                    if (sourceNode && sourceNode.type === 'StringLiteral') {
                        const source = sourceNode.value;
                        if (!source.startsWith('.') && !source.startsWith('/')) {
                            return;
                        }
                        const absolutePath = resolveImportPath(source, filePath, projectRoot);
                        if (absolutePath) {
                            dependencies.push({
                                source,
                                resolvedPath: path_1.default.relative(projectRoot, absolutePath),
                                dynamic: true,
                                absolutePath,
                            });
                        }
                    }
                }
            },
        });
        return dependencies;
    }
    catch (error) {
        console.error(`Error parsing ${filePath}:`, error.message);
        return [];
    }
}
// 解析导入路径为绝对路径
function resolveImportPath(source, importerPath, projectRoot) {
    try {
        // 处理相对路径
        if (source.startsWith('.')) {
            const dir = path_1.default.dirname(importerPath);
            let fullPath = path_1.default.resolve(dir, source);
            // 尝试添加扩展名
            if (!path_1.default.extname(fullPath)) {
                for (const ext of SUPPORTED_EXTENSIONS) {
                    const candidate = `${fullPath}${ext}`;
                    if (fs_1.default.existsSync(candidate)) {
                        return candidate;
                    }
                    // 尝试 index 文件
                    const indexCandidate = path_1.default.join(fullPath, `index${ext}`);
                    if (fs_1.default.existsSync(indexCandidate)) {
                        return indexCandidate;
                    }
                }
            }
            // 如果已经有扩展名或上述尝试失败
            if (fs_1.default.existsSync(fullPath)) {
                return fullPath;
            }
            return null;
        }
        // 处理项目根目录绝对路径
        if (source.startsWith('/')) {
            let fullPath = path_1.default.join(projectRoot, source);
            // 尝试添加扩展名
            if (!path_1.default.extname(fullPath)) {
                for (const ext of SUPPORTED_EXTENSIONS) {
                    const candidate = `${fullPath}${ext}`;
                    if (fs_1.default.existsSync(candidate)) {
                        return candidate;
                    }
                    // 尝试 index 文件
                    const indexCandidate = path_1.default.join(fullPath, `index${ext}`);
                    if (fs_1.default.existsSync(indexCandidate)) {
                        return indexCandidate;
                    }
                }
            }
            if (fs_1.default.existsSync(fullPath)) {
                return fullPath;
            }
            return null;
        }
        if (source.startsWith('@/')) {
            let fullPath = path_1.default.join(projectRoot, source.replace(/^@/, 'src'));
            console.log("🚀 ~ fullPath:", fullPath);
        }
        return null;
    }
    catch (error) {
        console.error(`Error resolving import "${source}" in ${importerPath}:`, error);
        return null;
    }
}
// 构建完整的依赖关系图（包括被依赖关系）
function buildCompleteDependencyGraph(graph) {
    // 首先初始化所有文件的 dependents 数组
    for (const file in graph) {
        graph[file].dependents = [];
    }
    // 然后填充 dependents
    for (const file in graph) {
        for (const dep of graph[file].dependencies) {
            const depFile = dep.absolutePath;
            if (graph[depFile] && !graph[depFile].dependents.includes(file)) {
                graph[depFile].dependents.push(file);
            }
        }
    }
}
