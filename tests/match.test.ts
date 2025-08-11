import { it, expect, describe } from 'vitest'
import { Groups, matchAny, matchGroups, transform, transformToWildcard } from '../src/match.js'

describe('matchAny', () => {
  it('matches against patterns', () => {
    const matched = matchAny(
      ['clusters/:cluster/:component/**'],
      [
        'clusters/staging/cluster-autoscaler/helmfile.yaml',
        'clusters/staging/cluster-autoscaler/values.yaml',
        'clusters/production/coredns/deployment.yaml',
      ],
    )
    expect(matched).toBe(true)
  })

  describe('negative patterns', () => {
    it('excludes files matching negative patterns', () => {
      const matched = matchAny(
        ['clusters/:cluster/:component/**', '!clusters/:cluster/:component/*.md'],
        ['clusters/staging/cluster-autoscaler/README.md', 'clusters/production/coredns/README.md'],
      )
      expect(matched).toBe(false)
    })

    it('includes files not matching negative patterns', () => {
      const matched = matchAny(
        ['clusters/:cluster/:component/**', '!clusters/:cluster/:component/*.md'],
        ['clusters/staging/cluster-autoscaler/README.md', 'clusters/production/coredns/deployment.yaml'],
      )
      expect(matched).toBe(true)
    })
  })

  it('returns false when no files match any patterns', () => {
    const matched = matchAny(['clusters/:cluster/:component/**'], ['src/main.ts', 'docs/README.md', 'package.json'])
    expect(matched).toBe(false)
  })

  it('handles single asterisk wildcard', () => {
    const matched = matchAny(['src/*/index.ts'], ['src/components/index.ts', 'src/utils/index.ts'])
    expect(matched).toBe(true)
  })

  it('handles double asterisk wildcard', () => {
    const matched = matchAny(
      ['src/**/*.test.ts'],
      ['src/components/Button/Button.test.ts', 'src/utils/helpers.test.ts'],
    )
    expect(matched).toBe(true)
  })

  it('returns false for empty file list', () => {
    const matched = matchAny(['clusters/:cluster/:component/**'], [])
    expect(matched).toBe(false)
  })

  it('returns false for empty pattern list', () => {
    const matched = matchAny([], ['clusters/staging/app/file.yaml'])
    expect(matched).toBe(false)
  })

  it('handles empty strings', () => {
    expect(matchAny([''], [''])).toBe(true)
  })

  it('handles special characters in file paths', () => {
    const matched = matchAny(['files/:name/**'], ['files/my-app_v1.2.3/config.json'])
    expect(matched).toBe(true)
  })

  it('handles case sensitivity', () => {
    const matched = matchAny(['Apps/:app/**'], ['apps/myapp/file.txt'])
    expect(matched).toBe(false)
  })

  it('handles deep nesting with double asterisk', () => {
    const matched = matchAny(['src/**'], ['src/very/deep/nested/folder/structure/file.ts'])
    expect(matched).toBe(true)
  })

  it('validates exact pattern matching without false positives', () => {
    const matched = matchAny(
      ['clusters/:cluster/:component/file.yaml'],
      ['clusters/staging/app/extra/file.yaml'], // extra folder should not match
    )
    expect(matched).toBe(false)
  })
})

describe('matchGroups', () => {
  it('matches against path variables', () => {
    const groupsSet = matchGroups(
      ['clusters/:cluster/:component/**'],
      [
        'clusters/staging/cluster-autoscaler/helmfile.yaml',
        'clusters/staging/cluster-autoscaler/values.yaml',
        'clusters/production/coredns/deployment.yaml',
      ],
    )
    expect(groupsSet).toEqual([
      {
        cluster: 'staging',
        component: 'cluster-autoscaler',
      },
      {
        cluster: 'production',
        component: 'coredns',
      },
    ])
  })

  describe('negative patterns', () => {
    it('excludes files matching negative patterns', () => {
      const groupsSet = matchGroups(
        ['clusters/:cluster/:component/**', '!clusters/:cluster/:component/*.md'],
        ['clusters/staging/cluster-autoscaler/README.md', 'clusters/production/coredns/README.md'],
      )
      expect(groupsSet).toEqual([])
    })

    it('includes files not matching negative patterns', () => {
      const groupsSet = matchGroups(
        ['clusters/:cluster/:component/**', '!clusters/:cluster/:component/*.md'],
        ['clusters/staging/cluster-autoscaler/README.md', 'clusters/production/coredns/deployment.yaml'],
      )
      expect(groupsSet).toEqual([
        {
          cluster: 'production',
          component: 'coredns',
        },
      ])
    })
  })

  it('matches a trailing path variable', () => {
    const groupsSet = matchGroups(
      ['.github/workflows/:workflow'],
      ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
    )
    expect(groupsSet).toEqual([{ workflow: 'ci.yaml' }, { workflow: 'deploy.yaml' }, { workflow: 'test.yaml' }])
  })

  it('matches a partial path variable', () => {
    const groupsSet = matchGroups(
      ['.github/workflows/:workflow.yaml'],
      ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
    )
    expect(groupsSet).toEqual([{ workflow: 'ci' }, { workflow: 'deploy' }, { workflow: 'test' }])
  })

  it('returns empty array when no files match', () => {
    const groupsSet = matchGroups(['clusters/:cluster/:component/**'], ['src/main.ts', 'docs/README.md'])
    expect(groupsSet).toEqual([])
  })

  it('deduplicates identical groups', () => {
    const groupsSet = matchGroups(
      ['clusters/:cluster/:component/**'],
      ['clusters/staging/app/file1.yaml', 'clusters/staging/app/file2.yaml', 'clusters/staging/app/file3.yaml'],
    )
    expect(groupsSet).toEqual([
      {
        cluster: 'staging',
        component: 'app',
      },
    ])
  })

  it('handles multiple patterns', () => {
    const groupsSet = matchGroups(
      ['clusters/:cluster/:component/**', 'apps/:env/:service/**'],
      ['clusters/staging/app/file.yaml', 'apps/dev/api/config.json'],
    )
    expect(groupsSet).toEqual([
      {
        cluster: 'staging',
        component: 'app',
      },
      {
        env: 'dev',
        service: 'api',
      },
    ])
  })

  it('handles patterns with no path variables', () => {
    const groupsSet = matchGroups(['src/**/*.ts'], ['src/main.ts', 'src/utils/helper.ts'])
    expect(groupsSet).toEqual([])
  })

  it('handles empty strings', () => {
    expect(matchGroups([''], [''])).toEqual([])
  })
})

describe('transform', () => {
  it('returns paths corresponding to groups', () => {
    const groupsSet: Groups[] = [
      {
        cluster: 'staging',
        component: 'cluster-autoscaler',
      },
      {
        cluster: 'production',
        component: 'coredns',
      },
    ]
    const paths = transform('clusters/:cluster/:component/kustomization.yaml', groupsSet)
    expect(paths).toStrictEqual([
      'clusters/staging/cluster-autoscaler/kustomization.yaml',
      'clusters/production/coredns/kustomization.yaml',
    ])
  })

  it('handles a trailing path variable', () => {
    const groupsSet: Groups[] = [{ workflow: 'ci.yaml' }, { workflow: 'deploy.yaml' }, { workflow: 'test.yaml' }]
    const paths = transform('.github/workflows/:workflow', groupsSet)
    expect(paths).toStrictEqual([
      '.github/workflows/ci.yaml',
      '.github/workflows/deploy.yaml',
      '.github/workflows/test.yaml',
    ])
  })

  it('handles a partial path variable', () => {
    const groupsSet: Groups[] = [{ workflow: 'ci' }, { workflow: 'deploy' }, { workflow: 'test' }]
    const paths = transform('.github/workflows/:workflow.yaml', groupsSet)
    expect(paths).toStrictEqual([
      '.github/workflows/ci.yaml',
      '.github/workflows/deploy.yaml',
      '.github/workflows/test.yaml',
    ])
  })

  it('handles missing group values by replacing with asterisk', () => {
    const groupsSet: Groups[] = [
      {
        cluster: 'staging',
        // component is missing
      },
      {
        cluster: 'production',
        component: 'coredns',
      },
    ]
    const paths = transform('clusters/:cluster/:component/kustomization.yaml', groupsSet)
    expect(paths).toStrictEqual([
      'clusters/staging/*/kustomization.yaml',
      'clusters/production/coredns/kustomization.yaml',
    ])
  })

  it('returns empty array for empty groups', () => {
    const paths = transform('clusters/:cluster/:component/kustomization.yaml', [])
    expect(paths).toStrictEqual([])
  })

  it('deduplicates identical paths', () => {
    const groupsSet: Groups[] = [
      {
        cluster: 'staging',
        component: 'app',
      },
      {
        cluster: 'staging',
        component: 'app',
      },
    ]
    const paths = transform('clusters/:cluster/:component/kustomization.yaml', groupsSet)
    expect(paths).toStrictEqual(['clusters/staging/app/kustomization.yaml'])
  })

  it('handles patterns without path variables', () => {
    const groupsSet: Groups[] = [
      {
        cluster: 'staging',
        component: 'app',
      },
    ]
    const paths = transform('static/file.yaml', groupsSet)
    expect(paths).toStrictEqual(['static/file.yaml'])
  })
})

describe('transformToWildcard', () => {
  it('returns a wildcard pattern', () => {
    const paths = transformToWildcard('clusters/:cluster/:component/kustomization.yaml')
    expect(paths).toStrictEqual(['clusters/*/*/kustomization.yaml'])
  })

  it('handles patterns with no path variables', () => {
    const paths = transformToWildcard('static/file.yaml')
    expect(paths).toStrictEqual(['static/file.yaml'])
  })

  it('handles single path variable', () => {
    const paths = transformToWildcard('apps/:env/config.json')
    expect(paths).toStrictEqual(['apps/*/config.json'])
  })

  it('handles multiple path variables', () => {
    const paths = transformToWildcard('apps/:env/:service/:version/deploy.yaml')
    expect(paths).toStrictEqual(['apps/*/*/*/deploy.yaml'])
  })
})
