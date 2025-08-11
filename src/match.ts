export type VariableMap = Record<string, string>

export const matchAny = (patterns: string[], changedFiles: string[]): boolean => {
  const regexps = patterns.map(compilePathToRegexp)
  for (const changedFile of changedFiles) {
    for (const re of regexps) {
      if (re.test(changedFile)) {
        return true
      }
    }
  }
  return false
}

export const matchGroups = (patterns: string[], changedFiles: string[]): VariableMap[] => {
  const regexps = patterns.map(compilePathToRegexp)
  const variableMaps = []
  for (const changedFile of changedFiles) {
    for (const re of regexps) {
      const matcher = re.exec(changedFile)
      if (matcher?.groups !== undefined) {
        variableMaps.push(matcher.groups)
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

const compilePathToRegexp = (s: string): RegExp => {
  const pathSegments = s.split('/').map((pathSegment) =>
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
