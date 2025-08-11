export type VariableMap = Record<string, string>

export const matchAny = (patterns: string[], changedFiles: string[]): boolean => {
  const matchers = patterns.map(compileMatcher)
  return changedFiles.some((changedFile) => {
    let matched = false
    for (const matcher of matchers) {
      if (matcher.negative) {
        matched = matched && !matcher.regexp.test(changedFile)
      } else {
        matched = matched || matcher.regexp.test(changedFile)
      }
    }
    return matched
  })
}

export const matchGroups = (patterns: string[], changedFiles: string[]): VariableMap[] => {
  const matchers = patterns.map(compileMatcher)
  const mergedVariableMaps = []
  for (const changedFile of changedFiles) {
    let matchedVariableMaps = []
    for (const matcher of matchers) {
      if (matcher.negative) {
        if (matcher.regexp.test(changedFile)) {
          matchedVariableMaps = []
        }
      } else {
        const match = matcher.regexp.exec(changedFile)
        if (match?.groups) {
          matchedVariableMaps.push(match.groups)
        }
      }
    }
    mergedVariableMaps.push(...matchedVariableMaps)
  }
  return dedupeVariableMaps(mergedVariableMaps)
}

const dedupeVariableMaps = (variableMaps: VariableMap[]): VariableMap[] => {
  const deduped = new Map<string, VariableMap>()
  for (const variableMap of variableMaps) {
    deduped.set(JSON.stringify(variableMap), variableMap)
  }
  return [...deduped.values()]
}

const compileMatcher = (pattern: string) => {
  if (pattern.startsWith('!')) {
    return {
      negative: true,
      regexp: compilePattern(pattern.slice(1)),
    }
  }
  return {
    negative: false,
    regexp: compilePattern(pattern),
  }
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
