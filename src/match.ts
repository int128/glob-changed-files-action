import { createHash } from 'crypto'

export type Groups = { [key: string]: string | undefined }

export const matchAny = (patterns: string[], changedFiles: string[]): boolean => {
  const matchers = patterns.map(compileMatcher)
  for (const changedFile of changedFiles) {
    for (const matcher of matchers) {
      if (matcher.test(changedFile)) {
        return true
      }
    }
  }
  return false
}

export const matchGroups = (patterns: string[], changedFiles: string[]): Groups[] => {
  const matchers = patterns.map(compilePattern)
  const groupsSet = new Map<string, Groups>()
  for (const changedFile of changedFiles) {
    for (const matcher of matchers) {
      const match = matcher.exec(changedFile)
      if (match?.groups) {
        const dedupeKey = computeKeyOfGroups(match.groups)
        groupsSet.set(dedupeKey, match.groups)
      }
    }
  }
  return [...groupsSet.values()]
}

const computeKeyOfGroups = (groups: Groups): string => {
  const h = createHash('sha256')
  for (const k of Object.keys(groups)) {
    const v = groups[k]
    h.write(k)
    h.write('\0')
    h.write(v)
    h.write('\0')
  }
  return h.digest('hex')
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
