"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAffectedFilesEnhanced = findAffectedFilesEnhanced;
function findAffectedFilesEnhanced(changedFile, dependencyGraph) {
    const affected = new Set();
    const visited = new Set();
    let hasCircular = false;
    function visit(file, path) {
        var _a;
        if (affected.has(file))
            return;
        // 检测循环依赖
        if (path.includes(file)) {
            console.warn(`发现循环依赖: ${path.join(' -> ')} -> ${file}`);
            hasCircular = true;
            return;
        }
        affected.add(file);
        const newPath = [...path, file];
        // 递归处理所有依赖该文件的文件
        for (const dependent of ((_a = dependencyGraph[file]) === null || _a === void 0 ? void 0 : _a.dependents) || []) {
            visit(dependent, newPath);
        }
    }
    visit(changedFile, []);
    return {
        affectedFiles: Array.from(affected),
        hasCircularDependency: hasCircular,
    };
}
