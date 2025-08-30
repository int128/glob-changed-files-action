import * as minimatch from 'minimatch'

export type VariableMap = Record<string, string>

export type Match = {
  paths: string[]
  variableMaps: VariableMap[]
}

export const matchGroups = (patterns: string[], changedFiles: string[]): Match => {
  const matchers = compileMatchers(patterns)

  const allPaths: string[] = []
  const allVariableMaps: VariableMap[] = []
  for (const changedFile of changedFiles) {
    let fileMatched = false
    let fileVariableMaps: VariableMap[] = []
    for (const matcher of matchers) {
      if (matcher.negative) {
        if (matcher.regexp.test(changedFile)) {
          fileMatched = false
          fileVariableMaps = []
        }
        continue
      }
      const matched = matcher.regexp.exec(changedFile)
      if (matched) {
        fileMatched = true
      }
      if (matched?.groups !== undefined) {
        fileVariableMaps.push(matched.groups)
      }
    }
    if (fileMatched) {
      allPaths.push(changedFile)
    }
    allVariableMaps.push(...fileVariableMaps)
  }
  return {
    paths: allPaths,
    variableMaps: dedupeVariableMaps(allVariableMaps),
  }
}

const dedupeVariableMaps = (variableMaps: VariableMap[]): VariableMap[] => {
  const deduped = new Map<string, VariableMap>()
  for (const variableMap of variableMaps) {
    deduped.set(JSON.stringify(variableMap), variableMap)
  }
  return [...deduped.values()]
}

const compileMatchers = (patterns: string[]) =>
  patterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => !pattern.startsWith('#'))
    .filter((pattern) => pattern.length > 0)
    .map((pattern) => {
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
    })

const compilePattern = (pattern: string): RegExp => {
  const regexp = minimatch.makeRe(pattern, { dot: true })
  if (regexp === false) {
    return new RegExp(pattern)
  }
  const escapePathVariables = regexp.source.replaceAll(/:([a-zA-Z0-9]+)/g, '(?<$1>[^/]+)')
  return new RegExp(escapePathVariables)
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
