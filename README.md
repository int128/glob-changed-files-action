# glob-changed-files-action [![ts](https://github.com/int128/glob-changed-files-action/actions/workflows/ts.yaml/badge.svg)](https://github.com/int128/glob-changed-files-action/actions/workflows/ts.yaml)

This is an action to expand path patterns by changed files in a pull request.

## Motivation

This action provides an alternative of `paths` trigger for a monorepo (mono repository).
Typically a monorepo contains many modules, for example,

```
monorepo
├── microservice1
├── microservice2
├── ...
├── microserviceN
└── common-policy
```

This action is useful to inspect crosscutting concern against all modules.
For example,

- Policy test for Kubernetes manifests
- Security test with common rules

If a monorepo has many modules, it takes a long time to process all modules.
You can reduce the number of modules to process by this action.

## Features

### Transform path variables

This action expands path patterns by changed files in a pull request.

For example, if the following path patterns are given,

```yaml
paths: |
  :service/manifest/**
transform: |
  :service/manifest/kustomization.yaml
```

and the following file is changed in a pull request,

```
microservice1/manifest/deployment.yaml
```

this action determines the path variable as follows:

```
":service" => "microservice1"
```

Finally this action expands the pattern as follows:

```
microservice1/manifest/kustomization.yaml
```

A path variable can be defined by `:VARIABLE` in the patterns of `paths`.
It can be used in `outputs` to set the output value.

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

This feature reduces a number of modules to process in a workflow.

### Fallback

This action falls back for the following cases:

- Any pattern in `paths-fallback` is matched
- Pull request contains more than 1,000 changed files

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

## Examples

### Usecase: build manifests against changed paths

Let's think a case of monorepo with Kubernetes components.
For example,

```
clusters
├── staging
|   ├── cluster-autoscaler
|   └── coredns
└── production
    └── cluster-autoscaler
```

To run `kustomize build` for changed components in a pull request:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: int128/glob-changed-files-action@v1
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

This action transforms the paths by the following rule:

```
clusters/:cluster/:component/**
↓
clusters/:cluster/:component/kustomization.yaml
```

If `clusters/staging/cluster-autoscaler/config.yaml` is changed in a pull request, the rule would be:

```
clusters/staging/cluster-autoscaler/**
↓
clusters/staging/cluster-autoscaler/kustomization.yaml
```

and finally this action sets an output to `clusters/staging/cluster-autoscaler/kustomization.yaml`.

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
