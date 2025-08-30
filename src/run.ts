import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as match from './match.js'
import { Context } from './github.js'
import { Octokit } from '@octokit/action'

type Inputs = {
  paths: string[]
  pathsFallback: string[]
  fallbackMethod: 'wildcard' | 'match-working-directory'
  transform: string[]
  outputsMap: Map<string, string>
  outputsEncoding: 'multiline' | 'json'
}

type Outputs = {
  paths: string[]
  map: Map<string, string>
}

export const run = async (inputs: Inputs, context: Context, octokit: Octokit): Promise<Outputs> => {
  core.info(`eventName: ${context.eventName}`)
  core.info(`outputs: ${JSON.stringify([...inputs.outputsMap], undefined, 2)}`)

  if (!('pull_request' in context.payload && 'number' in context.payload)) {
    core.info(`Fallback due to not pull_request event`)
    return await fallback(inputs)
  }

  // Limit the max number of changed files to prevent GitHub API rate limit
  core.info(`${context.payload.pull_request.changed_files} files are changed in the pull request`)
  if (context.payload.pull_request.changed_files > 1000) {
    core.info(`Fallback due to too many changed files`)
    return await fallback(inputs)
  }

  core.info(`List files in the pull request`)
  const listFiles = await octokit.paginate(
    octokit.rest.pulls.listFiles,
    {
      owner: context.payload.pull_request.base.repo.owner.login,
      repo: context.payload.pull_request.base.repo.name,
      pull_number: context.payload.pull_request.number,
      per_page: 100,
    },
    (r) => r.data,
  )
  const changedFiles = listFiles.map((f) => f.filename)
  core.info(`Received a list of ${changedFiles.length} files`)

  if (match.matchAny(inputs.pathsFallback, changedFiles)) {
    core.info(`Fallback due to paths-fallback matches to the changed files`)
    return await fallback(inputs)
  }

  const matchResult = match.matchGroups(inputs.paths, changedFiles)
  core.info(`Transform paths by the changed files`)
  const variableMap = new Map<string, string>()
  for (const [key, pattern] of inputs.outputsMap) {
    const paths = match.transform(pattern, matchResult.variableMaps)
    const variableValue = encodeVariableValues(paths, inputs.outputsEncoding)
    variableMap.set(key, variableValue)
  }
  if (inputs.transform.length > 0) {
    const transformedPaths = inputs.transform.flatMap((pattern) => match.transform(pattern, matchResult.variableMaps))
    return {
      paths: transformedPaths,
      map: variableMap,
    }
  }
  return {
    paths: matchResult.paths,
    map: variableMap,
  }
}

const fallback = async (inputs: Inputs): Promise<Outputs> => {
  if (inputs.fallbackMethod === 'wildcard') {
    return fallbackToWildcard(inputs)
  }
  return await matchWorkingDirectory(inputs)
}

const matchWorkingDirectory = async (inputs: Inputs): Promise<Outputs> => {
  core.startGroup(`git ls-files`)
  const { stdout } = await exec.getExecOutput('git', ['ls-files'])
  const workingDirectoryFiles = stdout.trim().split('\n')
  core.endGroup()

  core.info(`Working directory files: ${workingDirectoryFiles.length} files`)
  const matchResult = match.matchGroups(inputs.paths, workingDirectoryFiles)
  core.info(`Transform paths by the working directory files`)
  const variableMap = new Map<string, string>()
  for (const [key, pattern] of inputs.outputsMap) {
    const paths = match.transform(pattern, matchResult.variableMaps)
    const variableValue = encodeVariableValues(paths, inputs.outputsEncoding)
    variableMap.set(key, variableValue)
  }
  if (inputs.transform.length > 0) {
    const transformedPaths = inputs.transform.flatMap((pattern) => match.transform(pattern, matchResult.variableMaps))
    return {
      paths: transformedPaths,
      map: variableMap,
    }
  }
  return {
    paths: matchResult.paths,
    map: variableMap,
  }
}

const fallbackToWildcard = (inputs: Inputs): Outputs => {
  const variableMap = new Map<string, string>()
  for (const [key, pattern] of inputs.outputsMap) {
    const paths = match.transformToWildcard(pattern)
    const variableValue = encodeVariableValues(paths, inputs.outputsEncoding)
    variableMap.set(key, variableValue)
  }
  if (inputs.transform.length > 0) {
    const transformedPaths = inputs.transform.flatMap((pattern) => match.transformToWildcard(pattern))
    return {
      paths: transformedPaths,
      map: variableMap,
    }
  }
  return {
    paths: [],
    map: variableMap,
  }
}

const encodeVariableValues = (values: string[], encoding: 'multiline' | 'json'): string => {
  if (encoding === 'json') {
    return JSON.stringify(values)
  }
  return values.join('\n')
}
