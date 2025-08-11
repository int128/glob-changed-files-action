export type VariableMap = Record<string, string>

export const matchAny = (patterns: string[], changedFiles: string[]): boolean => {
  const matchers = patterns.map(compilePattern)
  for (const changedFile of changedFiles) {
    for (const matcher of matchers) {
      if (matcher.test(changedFile)) {
        return true
      }
    }
  }
  return false
}

export const matchGroups = (patterns: string[], changedFiles: string[]): VariableMap[] => {
  const matchers = patterns.map(compilePattern)
  const variableMaps = []
  for (const changedFile of changedFiles) {
    for (const matcher of matchers) {
      const matched = matcher.exec(changedFile)
      if (matched?.groups !== undefined) {
        variableMaps.push(matched.groups)
      }
    }
  }
  return dedupeVariableMaps(variableMaps)
}

const dedupeVariableMaps = (variableMaps: VariableMap[]): VariableMap[] => {
  const deduped = new Map<string, VariableMap>()
  for (const variableMap of variableMaps) {
    deduped.set(JSON.stringify(variableMap), variableMap)
  }
  return [...deduped.values()]
}

const compilePattern = (pattern: string): RegExp => {
  const pathSegments = pattern.split('/').map((pathSegment) =>
    pathSegment
      .replaceAll('.', '\\.')
      .replaceAll('**', '.+?')
      .replaceAll('*', '[^/]+?')
      .replaceAll(/:([a-zA-Z0-9]+)/g, '(?<$1>[^/]+?)'),
  )
  return new RegExp(`^${pathSegments.join('/')}$`)
}

export const transform = (pattern: string, variableMaps: VariableMap[]): string[] => {
  const paths = new Set<string>()
  for (const variableMap of variableMaps) {
    const path = pattern
      .split('/')
      .map((pathSegment) =>
        pathSegment.replaceAll(/:([a-zA-Z0-9]+)/g, (_, variableKey: string): string => {
          const variableValue = variableMap[variableKey]
          if (variableValue === undefined) {
            return '*'
          }
          return variableValue
        }),
      )
      .join('/')
    paths.add(path)
  }
  return [...paths]
}

export const transformToWildcard = (pattern: string): string[] => transform(pattern, [{}])
