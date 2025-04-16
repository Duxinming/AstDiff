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
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const dependency_graph_1 = require("./dependency-graph");
const impact_analyzer_1 = require("./impact-analyzer");
const ast_analyzer_1 = require("./ast-analyzer");
const git_utils_1 = require("./git-utils");
const utils_1 = require("./utils");
const fs = __importStar(require("fs"));
async function main() {
    try {
        const changedFiles = (0, git_utils_1.getStagedFiles)();
        console.log(changedFiles);
        if (changedFiles.length === 0) {
            console.log('没有检测到 TypeScript 文件变更');
            process.exit(0);
        }
        const set = new Set();
        const astDepenciesTree = await (0, ast_analyzer_1.analyzeDependencies)('D:/hand/re-front/packages/re-mes-front');
        console.log('正在寻找当前文件变更的依赖关系...');
        changedFiles.forEach((file) => {
            const { affectedFiles, hasCircularDependency } = (0, utils_1.findAffectedFilesEnhanced)(file, astDepenciesTree);
            if (!hasCircularDependency) {
                affectedFiles.forEach((affectedFile) => {
                    set.add(affectedFile);
                });
            }
        });
        console.log(Array.from(set));
        console.log('正在分析项目依赖关系...');
        const graphBuilder = new dependency_graph_1.DependencyGraphBuilder('D:/hand/re-front/packages/re-mes-front/tsconfig.json');
        // 从项目入口开始
        const graph = graphBuilder.buildForProject(Array.from(set));
        fs.writeFileSync('D:/code/AstDiff/out/graph.json', JSON.stringify(Array.from(graph.entities.values()), null, 2));
        console.log('分析变更影响范围...');
        const analyzer = new impact_analyzer_1.ImpactAnalyzer(graph);
        const impacted = analyzer.analyzeImpact(changedFiles);
        if (impacted.length > 0) {
            console.log('\n本次提交可能影响以下代码实体:');
            impacted.forEach((entity) => {
                var _a, _b;
                console.log(`- ${entity.type} ${entity.name} (${entity.filePath}) - 起始行号: ${(_a = entity.position) === null || _a === void 0 ? void 0 : _a.line[0]} - 结束行号: ${(_b = entity.position) === null || _b === void 0 ? void 0 : _b.line[1]}`);
            });
            // 如果影响超过阈值，可以阻止提交
            // process.exit(1);
        }
        else {
            console.log('未检测到重大影响范围');
        }
        process.exit(0);
    }
    catch (error) {
        console.error('分析失败:', error);
        process.exit(1);
    }
}
