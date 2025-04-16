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
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const t = __importStar(require("@babel/types"));
const simple_git_1 = __importDefault(require("simple-git"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// 获取绝对路径
const outDir = path_1.default.join(__dirname, '../out');
const getFilePath = (name) => path_1.default.join(outDir, name);
class GitASTAnalyzer {
    git;
    constructor() {
        this.git = (0, simple_git_1.default)();
    }
    async analyzeStagedChanges() {
        const diff = await this.git.diff(['--staged']);
        // fs.writeFileSync(getFilePath('diff.json'), diff)
        const files = (await this.git.diff(['--staged', '--name-only']))
            .split('\n')
            .filter(Boolean)
            .filter((file) => /\.(js|jsx|ts|tsx|html|vue)$/.test(file));
        // fs.writeFileSync(getFilePath('files.txt'), JSON.stringify(files))
        const results = {};
        for (const file of files) {
            const fullPath = path_1.default.join(process.cwd(), file);
            if (!fs_1.default.existsSync(fullPath))
                continue;
            const fileDiff = await this.git.diff(['--staged', file]);
            const changes = this.extactChangesFromDiff(fileDiff);
            try {
                const affectedNodes = await this.analyzeFile(fullPath, changes);
                results[file] = {
                    filePath: file,
                    changes,
                    affectedNodes,
                };
            }
            catch (error) {
                console.error(`分析文件 ${file} 失败:`, error instanceof Error ? error.message : error);
            }
        }
        return results;
    }
    async analyzeFile(filePath, changes) {
        let that = this;
        const code = fs_1.default.readFileSync(filePath, 'utf-8');
        let ast;
        try {
            ast = (0, parser_1.parse)(code, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript', 'decorators-legacy'],
                tokens: true,
            });
        }
        catch (error) {
            throw new Error(`解析AST失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
        fs_1.default.writeFileSync(getFilePath('ast.json'), JSON.stringify(ast));
        const affectedNodes = [];
        const changeLines = changes.flatMap((change) => change.lineNumbers);
        (0, traverse_1.default)(ast, {
            enter(path) {
                console.log(path);
                if (!path.node.loc)
                    return;
                const nodeStartLine = path.node.loc.start.line;
                const nodeEndLine = path.node.loc.end.line;
                // 检查节点是否在变更行范围内
                const isAffected = changeLines.some((line) => line >= nodeStartLine && line <= nodeEndLine);
                if (isAffected) {
                    const nodeName = that.getNodeName(path.node);
                    affectedNodes.push({
                        type: path.node.type,
                        name: nodeName,
                        location: path.node.loc,
                    });
                }
            },
        });
        fs_1.default.writeFileSync(getFilePath('affectedNodes.json'), JSON.stringify(affectedNodes));
        // 分析受影响节点的依赖关系
        return this.analyzeDependencies(ast, affectedNodes);
    }
    analyzeDependencies(ast, affectedNodes) {
        const nodeNames = affectedNodes.map((node) => node.name);
        const dependencies = [];
        (0, traverse_1.default)(ast, {
            CallExpression(path) {
                if (t.isIdentifier(path.node.callee)) {
                    if (nodeNames.includes(path.node.callee.name)) {
                        dependencies.push({
                            type: 'CallExpression',
                            name: path.node.callee.name,
                            location: path.node.loc,
                        });
                    }
                }
            },
            MemberExpression(path) {
                if (t.isIdentifier(path.node.property)) {
                    if (nodeNames.includes(path.node.property.name)) {
                        dependencies.push({
                            type: 'MemberExpression',
                            name: path.node.property.name,
                            location: path.node.loc,
                        });
                    }
                }
            },
        });
        return [...affectedNodes, ...dependencies];
    }
    getNodeName(node) {
        if (t.isIdentifier(node))
            return node.name;
        if (t.isFunctionDeclaration(node) && node.id)
            return node.id.name;
        if (t.isVariableDeclarator(node) && t.isIdentifier(node.id))
            return node.id.name;
        if (t.isClassDeclaration(node) && node.id)
            return node.id.name;
        if (t.isTSInterfaceDeclaration(node))
            return node.id.name;
        if (t.isTSTypeAliasDeclaration(node))
            return node.id.name;
        if (t.isClassMethod(node) || t.isObjectMethod(node)) {
            if (t.isIdentifier(node.key))
                return node.key.name;
            if (t.isStringLiteral(node.key))
                return node.key.value;
        }
        return 'anonymous';
    }
    extactChangesFromDiff(diff) {
        const changes = [];
        const lines = diff.split('\n');
        let currentLineNumber = 0;
        let currentChange = null;
        for (const line of lines) {
            if (line.startsWith('@@')) {
                // 解析diff行号
                const match = line.match(/\+(\d+)/);
                if (match)
                    currentLineNumber = parseInt(match[1], 10);
                continue;
            }
            if (line.startsWith('+') && !line.startsWith('+++')) {
                if (!currentChange) {
                    currentChange = {
                        type: 'addition',
                        content: line.substring(1),
                        lineNumbers: new Set(),
                    };
                }
                else if (currentChange.type === 'addition') {
                    currentChange.content += '\n' + line.substring(1);
                }
                if (currentLineNumber > 0) {
                    currentChange.lineNumbers.add(currentLineNumber);
                }
                currentLineNumber++;
            }
            else if (currentChange) {
                changes.push({
                    ...currentChange,
                    lineNumbers: Array.from(currentChange.lineNumbers),
                });
                currentChange = null;
            }
            else if (line.startsWith('-') && !line.startsWith('---')) {
                // 处理删除的代码
                changes.push({
                    type: 'deletion',
                    content: line.substring(1),
                    lineNumbers: [currentLineNumber],
                });
            }
            else {
                currentLineNumber++;
            }
        }
        if (currentChange) {
            changes.push({
                ...currentChange,
                lineNumbers: Array.from(currentChange.lineNumbers),
            });
        }
        return changes;
    }
}
exports.default = GitASTAnalyzer;
