import { it, expect, describe } from 'vitest'
import { Match, VariableMap, matchAny, matchGroups, transform, transformToWildcard } from '../src/match.js'

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
    const match = matchGroups(
      ['clusters/:cluster/:component/**'],
      [
        'clusters/staging/cluster-autoscaler/helmfile.yaml',
        'clusters/staging/cluster-autoscaler/values.yaml',
        'clusters/production/coredns/deployment.yaml',
      ],
    )
    expect(match).toEqual<Match>({
      paths: [
        'clusters/staging/cluster-autoscaler/helmfile.yaml',
        'clusters/staging/cluster-autoscaler/values.yaml',
        'clusters/production/coredns/deployment.yaml',
      ],
      variableMaps: [
        {
          cluster: 'staging',
          component: 'cluster-autoscaler',
        },
        {
          cluster: 'production',
          component: 'coredns',
        },
      ],
    })
  })

  describe('negative patterns', () => {
    it('excludes files matching negative patterns', () => {
      const match = matchGroups(
        ['clusters/:cluster/:component/**', '!**/*.md'],
        ['clusters/staging/cluster-autoscaler/README.md', 'clusters/production/coredns/README.md'],
      )
      expect(match).toEqual<Match>({
        paths: [],
        variableMaps: [],
      })
    })

    it('includes files not matching negative patterns', () => {
      const match = matchGroups(
        ['clusters/:cluster/:component/**', '!**/*.md'],
        ['clusters/staging/cluster-autoscaler/helmfile.yaml', 'clusters/production/coredns/README.md'],
      )
      expect(match).toEqual<Match>({
        paths: ['clusters/staging/cluster-autoscaler/helmfile.yaml'],
        variableMaps: [
          {
            cluster: 'staging',
            component: 'cluster-autoscaler',
          },
        ],
      })
    })
  })

  it('matches a trailing path variable', () => {
    const match = matchGroups(
      ['.github/workflows/:workflow'],
      ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
    )
    expect(match).toEqual<Match>({
      paths: ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
      variableMaps: [{ workflow: 'ci.yaml' }, { workflow: 'deploy.yaml' }, { workflow: 'test.yaml' }],
    })
  })

  it('matches a partial path variable', () => {
    const match = matchGroups(
      ['.github/workflows/:workflow.yaml'],
      ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
    )
    expect(match).toEqual<Match>({
      paths: ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
      variableMaps: [{ workflow: 'ci' }, { workflow: 'deploy' }, { workflow: 'test' }],
    })
  })

  it('returns empty array when no files match', () => {
    const match = matchGroups(['clusters/:cluster/:component/**'], ['src/main.ts', 'docs/README.md'])
    expect(match).toEqual<Match>({
      paths: [],
      variableMaps: [],
    })
  })

  it('deduplicates identical groups', () => {
    const match = matchGroups(
      ['clusters/:cluster/:component/**'],
      ['clusters/staging/app/file1.yaml', 'clusters/staging/app/file2.yaml', 'clusters/staging/app/file3.yaml'],
    )
    expect(match).toEqual<Match>({
      paths: ['clusters/staging/app/file1.yaml', 'clusters/staging/app/file2.yaml', 'clusters/staging/app/file3.yaml'],
      variableMaps: [
        {
          cluster: 'staging',
          component: 'app',
        },
      ],
    })
  })

  it('handles multiple patterns', () => {
    const match = matchGroups(
      ['clusters/:cluster/:component/**', 'apps/:env/:service/**'],
      ['clusters/staging/app/file.yaml', 'apps/dev/api/config.json'],
    )
    expect(match).toEqual<Match>({
      paths: ['clusters/staging/app/file.yaml', 'apps/dev/api/config.json'],
      variableMaps: [
        {
          cluster: 'staging',
          component: 'app',
        },
        {
          env: 'dev',
          service: 'api',
        },
      ],
    })
  })

  it('handles patterns with no path variables', () => {
    const match = matchGroups(['src/**/*.ts'], ['src/main.ts', 'src/utils/helper.ts'])
    expect(match).toEqual<Match>({
      paths: ['src/utils/helper.ts'], // TODO: 'src/main.ts' should also match
      variableMaps: [],
    })
  })

  it('handles single asterisk wildcard', () => {
    const match = matchGroups(['src/*/index.ts'], ['src/components/index.ts', 'src/utils/index.ts'])
    expect(match).toEqual<Match>({
      paths: ['src/components/index.ts', 'src/utils/index.ts'],
      variableMaps: [],
    })
  })

  it('handles double asterisk wildcard', () => {
    const match = matchGroups(
      ['src/**/*.test.ts'],
      ['src/components/Button/Button.test.ts', 'src/utils/helpers.test.ts'],
    )
    expect(match).toEqual<Match>({
      paths: ['src/components/Button/Button.test.ts', 'src/utils/helpers.test.ts'],
      variableMaps: [],
    })
  })

  it('returns empty result for empty file list', () => {
    const match = matchGroups(['clusters/:cluster/:component/**'], [])
    expect(match).toEqual<Match>({
      paths: [],
      variableMaps: [],
    })
  })

  it('returns empty result for empty pattern list', () => {
    const match = matchGroups([], ['clusters/staging/app/file.yaml'])
    expect(match).toEqual<Match>({
      paths: [],
      variableMaps: [],
    })
  })

  it('handles special characters in file paths', () => {
    const match = matchGroups(['files/:name/**'], ['files/my-app_v1.2.3/config.json'])
    expect(match).toEqual<Match>({
      paths: ['files/my-app_v1.2.3/config.json'],
      variableMaps: [
        {
          name: 'my-app_v1.2.3',
        },
      ],
    })
  })

  it('handles case sensitivity', () => {
    const match = matchGroups(['Apps/:app/**'], ['apps/myapp/file.txt'])
    expect(match).toEqual<Match>({
      paths: [],
      variableMaps: [],
    })
  })

  it('handles deep nesting with double asterisk', () => {
    const match = matchGroups(['src/**'], ['src/very/deep/nested/folder/structure/file.ts'])
    expect(match).toEqual<Match>({
      paths: ['src/very/deep/nested/folder/structure/file.ts'],
      variableMaps: [],
    })
  })

  it('validates exact pattern matching without false positives', () => {
    const match = matchGroups(
      ['clusters/:cluster/:component/file.yaml'],
      ['clusters/staging/app/extra/file.yaml'], // extra folder should not match
    )
    expect(match).toEqual<Match>({
      paths: [],
      variableMaps: [],
    })
  })

  it('handles single asterisk wildcard with path variables', () => {
    const match = matchGroups(
      ['src/:module/*/index.ts'],
      ['src/components/Button/index.ts', 'src/utils/helpers/index.ts'],
    )
    expect(match).toEqual<Match>({
      paths: ['src/components/Button/index.ts', 'src/utils/helpers/index.ts'],
      variableMaps: [
        {
          module: 'components',
        },
        {
          module: 'utils',
        },
      ],
    })
  })

  it('handles path variables with special characters', () => {
    const match = matchGroups(['apps/:env/:service/**'], ['apps/staging-env/api_service/config.json'])
    expect(match).toEqual<Match>({
      paths: ['apps/staging-env/api_service/config.json'],
      variableMaps: [
        {
          env: 'staging-env',
          service: 'api_service',
        },
      ],
    })
  })

  it('handles mixed wildcards and path variables', () => {
    const match = matchGroups(
      ['projects/:project/*/src/**/:component.ts'],
      ['projects/webapp/frontend/src/components/Button.ts', 'projects/api/backend/src/utils/helper.ts'],
    )
    expect(match).toEqual<Match>({
      paths: ['projects/webapp/frontend/src/components/Button.ts', 'projects/api/backend/src/utils/helper.ts'],
      variableMaps: [
        {
          project: 'webapp',
          component: 'Button',
        },
        {
          project: 'api',
          component: 'helper',
        },
      ],
    })
  })
})

describe('transform', () => {
  it('returns paths corresponding to groups', () => {
    const variableMaps: VariableMap[] = [
      {
        cluster: 'staging',
        component: 'cluster-autoscaler',
      },
      {
        cluster: 'production',
        component: 'coredns',
      },
    ]
    const paths = transform('clusters/:cluster/:component/kustomization.yaml', variableMaps)
    expect(paths).toStrictEqual([
      'clusters/staging/cluster-autoscaler/kustomization.yaml',
      'clusters/production/coredns/kustomization.yaml',
    ])
  })

  it('handles a trailing path variable', () => {
    const variableMaps: VariableMap[] = [
      { workflow: 'ci.yaml' },
      { workflow: 'deploy.yaml' },
      { workflow: 'test.yaml' },
    ]
    const paths = transform('.github/workflows/:workflow', variableMaps)
    expect(paths).toStrictEqual([
      '.github/workflows/ci.yaml',
      '.github/workflows/deploy.yaml',
      '.github/workflows/test.yaml',
    ])
  })

  it('handles a partial path variable', () => {
    const variableMaps: VariableMap[] = [{ workflow: 'ci' }, { workflow: 'deploy' }, { workflow: 'test' }]
    const paths = transform('.github/workflows/:workflow.yaml', variableMaps)
    expect(paths).toStrictEqual([
      '.github/workflows/ci.yaml',
      '.github/workflows/deploy.yaml',
      '.github/workflows/test.yaml',
    ])
  })

  it('handles missing group values by replacing with asterisk', () => {
    const variableMaps: VariableMap[] = [
      {
        cluster: 'staging',
        // component is missing
      },
      {
        cluster: 'production',
        component: 'coredns',
      },
    ]
    const paths = transform('clusters/:cluster/:component/kustomization.yaml', variableMaps)
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
    const variableMaps: VariableMap[] = [
      {
        cluster: 'staging',
        component: 'app',
      },
      {
        cluster: 'staging',
        component: 'app',
      },
    ]
    const paths = transform('clusters/:cluster/:component/kustomization.yaml', variableMaps)
    expect(paths).toStrictEqual(['clusters/staging/app/kustomization.yaml'])
  })

  it('handles patterns without path variables', () => {
    const variableMaps: VariableMap[] = [
      {
        cluster: 'staging',
        component: 'app',
      },
    ]
    const paths = transform('static/file.yaml', variableMaps)
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
