"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyGraphBuilder = void 0;
const ts_analyzer_1 = require("./ts-analyzer");
class DependencyGraphBuilder {
    constructor(tsConfigPath) {
        this.graph = {
            entities: new Map(),
            edges: [],
        };
        this.TSAnalyzer = new ts_analyzer_1.TSAnalyzer(tsConfigPath);
    }
    buildForProject(entryFiles) {
        // 从入口文件开始构建整个项目的依赖图
        const visitedFiles = new Set();
        const processFile = (filePath) => {
            if (visitedFiles.has(filePath))
                return;
            visitedFiles.add(filePath);
            const entities = this.TSAnalyzer.analyzeFile(filePath);
            entities.forEach((entity) => {
                const entityKey = this.getEntityKey(entity);
                // 过滤掉 node_modules 中的文件
                if (!entityKey.includes('node_modules')) {
                    this.graph.entities.set(entityKey, entity);
                    const edges = this.TSAnalyzer.findDependencies(entity);
                    edges.forEach((edge) => {
                        this.graph.edges.push(edge);
                        // 递归处理依赖文件
                        if (!visitedFiles.has(edge.target.filePath)) {
                            processFile(edge.target.filePath);
                        }
                    });
                }
            });
        };
        entryFiles.forEach(processFile);
        return this.graph;
    }
    getEntityKey(entity) {
        return `${entity.filePath}:${entity.name}:${entity.type}`;
    }
}
exports.DependencyGraphBuilder = DependencyGraphBuilder;
