export type SourcePosition = {
  line: number[]
  column: number
}

export type CodeEntity = {
  type:
    | 'function'
    | 'class'
    | 'variable'
    | 'interface'
    | 'type'
    | 'namespace'
    | 'unresolved'
    | 'method'
  name: string
  filePath: string
  position?: SourcePosition
}

export type DependencyRelation =
  | 'import'
  | 'call'
  | 'extend'
  | 'implement'
  | 'type-reference'
  | 'unresolved-call'

export type DependencyEdge = {
  source: CodeEntity
  target: CodeEntity
  relation: DependencyRelation
  position?: SourcePosition
}

export type DependencyGraph = {
  entities: Map<string, CodeEntity>
  edges: DependencyEdge[]
}
