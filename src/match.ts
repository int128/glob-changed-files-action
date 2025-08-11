export type Groups = { [key: string]: string | undefined }

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

export const matchGroups = (patterns: string[], changedFiles: string[]): Groups[] => {
  const matchers = patterns.map(compileMatcher)
  const mergedGroupsSet = []
  for (const changedFile of changedFiles) {
    let matchedGroupsSet = []
    for (const matcher of matchers) {
      if (matcher.negative) {
        if (matcher.regexp.test(changedFile)) {
          matchedGroupsSet = []
        }
      } else {
        const match = matcher.regexp.exec(changedFile)
        if (match?.groups) {
          matchedGroupsSet.push(match.groups)
        }
      }
    }
    mergedGroupsSet.push(...matchedGroupsSet)
  }
  return dedupeGroupsSet(mergedGroupsSet)
}

const dedupeGroupsSet = (groupsSet: Groups[]): Groups[] => {
  const uniqueGroups = new Map<string, Groups>()
  for (const groups of groupsSet) {
    const key = JSON.stringify(groups)
    uniqueGroups.set(key, groups)
  }
  return Array.from(uniqueGroups.values())
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

export const transform = (pattern: string, groupsSet: Groups[]): string[] => {
  const paths = new Set<string>()
  for (const groups of groupsSet) {
    const path = pattern
      .split('/')
      .map((pathSegment) =>
        pathSegment.replaceAll(/:([a-zA-Z0-9]+)/g, (_, variableKey: string): string => {
          const variableValue = groups[variableKey]
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
