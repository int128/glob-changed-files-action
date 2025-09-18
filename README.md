# glob-changed-files-action [![ts](https://github.com/int128/glob-changed-files-action/actions/workflows/ts.yaml/badge.svg)](https://github.com/int128/glob-changed-files-action/actions/workflows/ts.yaml)

This is an action to list the changed files of a pull request.

## Motivation

This action is designed for testing a cross-cutting concern in a monorepo (mono-repository).
For example,

- Test the Kubernetes manifests
- Check the security policies

It takes a long time to test all modules in a large monorepo.
This action helps you reduce the number of modules to process by using the changed files.

## Getting started

### List the changed files

This workflow shows the changed files matching the given glob pattern.

```yaml
jobs:
  test:
    steps:
      - id: glob-changed-files
        uses: int128/glob-changed-files-action@v2
        with:
          paths: |
            **/kustomization.yaml
      - run: |
          while read -r changed_file; do
            echo "$changed_file"
          done <<< "$CHANGED_FILES"
        env:
          CHANGED_FILES: ${{ steps.glob-changed-files.outputs.paths }}
```

This action determines the changed files as follows:

- For `pull_request` or `pull_request_target` events, it compares the base commit and head commit of the pull request.
- For `push` events, it compares the before commit and after commit.
- Otherwise, it falls back to the working directory files.

You can exclude files from the path patterns by using the `!` prefix.
For example, this workflow excludes any Markdown files such as `README.md`.

```yaml
jobs:
  test:
    steps:
      - id: glob-changed-files
        uses: int128/glob-changed-files-action@v2
        with:
          paths: |
            **/kustomization.yaml
            !**/*.md
```

### Transform the path patterns

Here is an example directory structure for Kubernetes components.

```
.
├── cluster-autoscaler
|   ├── staging
|   |   └── kustomization.yaml
|   └── production
|       └── kustomization.yaml
└── coredns
    ├── staging
    |   └── kustomization.yaml
    └── production
        └── kustomization.yaml
```

This workflow runs `kustomize build` for the changed components of a pull request.

```yaml
jobs:
  build:
    steps:
      - uses: actions/checkout@v5
      - uses: int128/glob-changed-files-action@v2
        id: glob-changed-files
        with:
          paths: |
            :component/:cluster/**
          transform: |
            :component/:cluster/kustomization.yaml
      - uses: int128/kustomize-action@v1
        with:
          kustomization: ${{ steps.glob-changed-files.outputs.paths }}
```

For example, if `cluster-autoscaler/staging/configmap.yaml` is changed, this action transforms the path as follows:

- Evaluate the path pattern `:component/:cluster/**`.
  - It has the path variable `:component`.
  - It has the path variable `:cluster`.
- Match the changed path `cluster-autoscaler/staging/configmap.yaml`.
  - The path variable `:component` is `cluster-autoscaler`.
  - The path variable `:cluster` is `staging`.
  - The transformed path is `cluster-autoscaler/staging/kustomization.yaml`.

Finally, this action returns `cluster-autoscaler/staging/kustomization.yaml`.

### Fall back to the working directory files

This action falls back to the working directory files for the following cases:

- Any path pattern of `paths-fallback` is matched.
- This action is not run on a `pull_request`, `pull_request_target`, or `push` event.

This workflow runs `conftest` for the changed components of a pull request.

```yaml
jobs:
  test:
    steps:
      - uses: actions/checkout@v5
      - id: glob-changed-files
        uses: int128/glob-changed-files-action@v2
        with:
          paths: |
            :component/:cluster/**
          # Test all components when the conftest policy is changed.
          paths-fallback: |
            conftest/**
          transform: |
            :component/:cluster/kustomization.yaml

      - id: kustomize
        uses: int128/kustomize-action@v1
        with:
          kustomization: ${{ steps.glob-changed-files.outputs.paths }}
      - if: steps.kustomize.outputs.files
        run: conftest test -p conftest '${{ steps.kustomize.outputs.directory }}'
```

For example, if `conftest/policy/foo.rego` is changed in a pull request, this action matches against the working directory files.

### Pass the output to the matrix job

This action returns both `paths` (multiline) and `paths-json` (JSON) outputs.
You can pass the `paths-json` output to the matrix job.

Here is an example workflow to test the changed services in a monorepo.

```yaml
jobs:
  matrix:
    runs-on: ubuntu-latest
    outputs:
      changed-services: ${{ steps.glob-changed-files.outputs.paths-json }}
    steps:
      - uses: actions/checkout@v5
      - id: glob-changed-files
        uses: int128/glob-changed-files-action@v2
        with:
          # When the code is changed, test the changed services.
          paths: |
            :service/**/*.rb
            :service/Gemfile
            :service/Gemfile.lock
          # When this workflow file is changed, test the all services.
          paths-fallback: |
            .github/workflows/this-workflow.yaml
          transform: |
            :service

  test:
    needs: matrix
    if: needs.matrix.outputs.changed-services != '[]'
    strategy:
      fail-fast: false
      matrix:
        service: ${{ fromJson(needs.matrix.outputs.changed-services) }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ruby/setup-ruby@v1
        with:
          working-directory: ${{ matrix.service }}
```

## Specification

### Path patterns

Path variables are available in the path patterns of `paths` and `transform`.

A path variable can be defined by `:VARIABLE`.
It starts with a colon `:`, and contains only alphanumeric characters.
For example,

```yaml
- uses: int128/glob-changed-files-action@v2
  with:
    paths: |
      .github/workflows/:workflow.yaml
    transform: |
      :workflow
```

### Inputs

| Name             | Default        | Description                            |
| ---------------- | -------------- | -------------------------------------- |
| `paths`          | (required)     | Glob patterns (multiline)              |
| `paths-fallback` | -              | Glob patterns to fallback (multiline)  |
| `transform`      | -              | Paths to transform (multiline)         |
| `token`          | `github.token` | GitHub token to list the changed files |

### Outputs

| Name         | Description                                    |
| ------------ | ---------------------------------------------- |
| `paths`      | Changed file paths based on the input patterns |
| `paths-json` | Changed file paths in JSON format              |

## Migration V2

The following specifications have been changed:

- `outputs` input has been removed. Instead, use `transform` input and `paths` output.
- `outputs-encoding` input has been removed.
- `fallback-method` input has been removed. The fallback behavior is now always to match the working directory files.

### Example

Before (v1):

```yaml
steps:
  - uses: int128/glob-changed-files-action@v1
    id: glob-changed-files
    with:
      paths: |
        clusters/:cluster/:component/**
      outputs: |
        kustomization=clusters/:cluster/:component/kustomization.yaml
  - uses: int128/kustomize-action@v1
    with:
      kustomization: ${{ steps.glob-changed-files.outputs.kustomization }}
```

After (v2):

```yaml
steps:
  - uses: int128/glob-changed-files-action@v2
    id: glob-changed-files
    with:
      paths: |
        clusters/:cluster/:component/**
      transform: |
        clusters/:cluster/:component/kustomization.yaml
  - uses: int128/kustomize-action@v1
    with:
      kustomization: ${{ steps.glob-changed-files.outputs.paths }}
```
