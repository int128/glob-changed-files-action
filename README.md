# glob-changed-files-action [![ts](https://github.com/int128/glob-changed-files-action/actions/workflows/ts.yaml/badge.svg)](https://github.com/int128/glob-changed-files-action/actions/workflows/ts.yaml)

This is an action to list the changed files of a pull request.

## Motivation

This action is designed for a cross-cutting concern in a monorepo (mono repository).
For example,

- Test the Kubernetes manifests
- Test the security policies

A monorepo contains multiple modules.

```
monorepo
├── microservice1
├── microservice2
├── ...
├── microserviceN
└── common-policy
```

For a large monorepo, it takes a long time to test all modules.
You can reduce the number of modules to process using this action.

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
      - run: echo "$CHANGED_FILES"
        env:
          CHANGED_FILES: ${{ steps.glob-changed-files.outputs.paths }}
```

### Transform path variables

Let's think about the following directory structure for Kubernetes clusters.

```
clusters
├── staging
|   ├── cluster-autoscaler
|   └── coredns
└── production
    └── cluster-autoscaler
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
            clusters/:cluster/:component/**
          transform: |
            clusters/:cluster/:component/kustomization.yaml
      - uses: int128/kustomize-action@v1
        with:
          kustomization: ${{ steps.glob-changed-files.outputs.paths }}
```

If `clusters/staging/cluster-autoscaler/config.yaml` is changed in a pull request, this action transforms the path as follows:

- Evaluate the path pattern `clusters/:cluster/:component/**`.
  - It has the path variable `:cluster`.
  - It has the path variable `:component`.
- Match the changed path `clusters/staging/cluster-autoscaler/config.yaml` against the pattern.
  - The path variable `:cluster` is `staging`.
  - The path variable `:component` is `cluster-autoscaler`.
  - The transformed path is `clusters/staging/cluster-autoscaler/kustomization.yaml`.

Finally, this action returns `clusters/staging/cluster-autoscaler/kustomization.yaml`.

A path variable can be defined by `:VARIABLE` in the patterns of `paths`.
It can be used in `transform` to set the output value.

A path variable starts with a colon `:`, and contains alphanumeric characters.
You can use a path variable in a path segment.
For example,

```yaml
paths: |
  .github/workflows/:workflow.yaml
transform: |
  :workflow
```

If a pattern is prefixed with `!`, it is treated as a negative pattern.
For example, if the following path patterns are given,

```yaml
paths: |
  clusters/:cluster/:component/**
  !**/*.md
transform: |
  clusters/:cluster/:component/kustomization.yaml
```

this action ignores files matching negative patterns such as `README.md`.

If any changed files did not match the patterns, the output value is empty.

### Fall back to working directory files

For the following cases, this action falls back to matching the working directory files.

- Any pattern of `paths-fallback` is matched.
- Pull request contains more than 1,000 changed files.
- This action is not run on a `pull_request` or `pull_request_target` event.

Here is an example workflow.

```yaml
paths: |
  :service/manifest/**
paths-fallback: |
  conftest/**
transform: |
  :service/manifest/kustomization.yaml
```

If `conftest/policy/foo.rego` is changed in a pull request, this action matches against the working directory files.

## Specification

When this action is run on a `pull_request` or `pull_request_target` event, it inspects the changed files in the pull request.
Otherwise, it matches the working directory files.

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
