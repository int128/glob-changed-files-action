import { describe, expect, it } from 'vitest'
import { type Match, matchGroups, transform, type VariableMap } from '../src/match.js'

describe('matchGroups', () => {
  describe('path variable of single colon', () => {
    it('extracts path variables from matched files', () => {
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

    it('handles multiple patterns with different variables', () => {
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

    it('deduplicates identical variable maps', () => {
      const match = matchGroups(
        ['clusters/:cluster/:component/**'],
        ['clusters/staging/app/file1.yaml', 'clusters/staging/app/file2.yaml', 'clusters/staging/app/file3.yaml'],
      )
      expect(match).toEqual<Match>({
        paths: [
          'clusters/staging/app/file1.yaml',
          'clusters/staging/app/file2.yaml',
          'clusters/staging/app/file3.yaml',
        ],
        variableMaps: [
          {
            cluster: 'staging',
            component: 'app',
          },
        ],
      })
    })
  })

  describe('path variable of double colon', () => {
    it('extracts a path variable at head', () => {
      const match = matchGroups(
        ['::directory/*'],
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
          { directory: 'clusters/staging/cluster-autoscaler' },
          { directory: 'clusters/production/coredns' },
        ],
      })
    })

    it('extracts a path variable at middle', () => {
      const match = matchGroups(
        ['clusters/::directory/*'],
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
        variableMaps: [{ directory: 'staging/cluster-autoscaler' }, { directory: 'production/coredns' }],
      })
    })

    it('extracts a path variable at last', () => {
      const match = matchGroups(
        ['clusters/::path'],
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
          { path: 'staging/cluster-autoscaler/helmfile.yaml' },
          { path: 'staging/cluster-autoscaler/values.yaml' },
          { path: 'production/coredns/deployment.yaml' },
        ],
      })
    })
  })

  describe('wildcard patterns', () => {
    it('matches files with patterns containing no variables', () => {
      const match = matchGroups(['src/**/*.ts'], ['src/main.ts', 'src/utils/helper.ts'])
      expect(match).toEqual<Match>({
        paths: ['src/main.ts', 'src/utils/helper.ts'],
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

  describe('special variable patterns', () => {
    it('extracts trailing path variables', () => {
      const match = matchGroups(
        ['.github/workflows/:workflow'],
        ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
      )
      expect(match).toEqual<Match>({
        paths: ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
        variableMaps: [{ workflow: 'ci.yaml' }, { workflow: 'deploy.yaml' }, { workflow: 'test.yaml' }],
      })
    })

    it('extracts partial path variables from filename', () => {
      const match = matchGroups(
        ['.github/workflows/:workflow.yaml'],
        ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
      )
      expect(match).toEqual<Match>({
        paths: ['.github/workflows/ci.yaml', '.github/workflows/deploy.yaml', '.github/workflows/test.yaml'],
        variableMaps: [{ workflow: 'ci' }, { workflow: 'deploy' }, { workflow: 'test' }],
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

  describe('edge cases', () => {
    it('returns empty result when no files match patterns', () => {
      const match = matchGroups(['clusters/:cluster/:component/**'], ['src/main.ts', 'docs/README.md'])
      expect(match).toEqual<Match>({
        paths: [],
        variableMaps: [],
      })
    })

    it('returns empty result when file list is empty', () => {
      const match = matchGroups(['clusters/:cluster/:component/**'], [])
      expect(match).toEqual<Match>({
        paths: [],
        variableMaps: [],
      })
    })

    it('returns empty result when pattern list is empty', () => {
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
  })
})

describe('transform', () => {
  it('replaces path variables', () => {
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

  it('replaces path variables with double colon', () => {
    const variableMaps: VariableMap[] = [
      {
        directory: 'staging/cluster-autoscaler',
      },
      {
        directory: 'production/coredns',
      },
    ]
    const paths = transform('clusters/::directory/kustomization.yaml', variableMaps)
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

  it('ignores missing variable keys', () => {
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
      // 'clusters/staging/?/kustomization.yaml' is ignored
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
