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

  const variableMap = await matchChangedFiles(inputs, context, octokit)

  const map = new Map<string, string>()
  for (const [key, paths] of variableMap) {
    if (inputs.outputsEncoding === 'json') {
      map.set(key, JSON.stringify(paths))
    } else {
      map.set(key, paths.join('\n'))
    }
  }
  return { map }
}

const matchChangedFiles = async (inputs: Inputs, context: Context, octokit: Octokit): Promise<Outputs> => {
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

  const groups = match.matchGroups(inputs.paths, changedFiles)

  const transformedPaths = inputs.transform.flatMap((pattern) => match.transform(pattern, groups))
  const transformedMap = new Map<string, string[]>()
  for (const [key, pattern] of inputs.outputsMap) {
    const paths = match.transform(pattern, groups)
    transformedMap.set(key, paths)
  }
  return {
    paths: transformedPaths,
    map: transformedMap,
  }
}

const fallback = async (inputs: Inputs): Promise<Outputs> => {
  if (inputs.fallbackMethod === 'wildcard') {
    return fallbackToWildcard(inputs.outputsMap)
  }
  return await matchWorkingDirectory(inputs)
}

const matchWorkingDirectory = async (inputs: Inputs): Promise<Outputs> => {
  core.startGroup(`git ls-files`)
  const { stdout } = await exec.getExecOutput('git', ['ls-files'])
  const workingDirectoryFiles = stdout.trim().split('\n')
  core.endGroup()

  core.info(`Working directory files: ${workingDirectoryFiles.length} files`)
  const groups = match.matchGroups(inputs.paths, workingDirectoryFiles)
  core.info(`Transform paths by the working directory files`)
  const variableMap = new Map<string, string[]>()
  for (const [key, pattern] of inputs.outputsMap) {
    const paths = match.transform(pattern, groups)
    variableMap.set(key, paths)
  }
  return variableMap
}

const fallbackToWildcard = (outputsMap: Map<string, string>): Outputs => {
  const variableMap = new Map<string, string[]>()
  for (const [key, pattern] of outputsMap) {
    const paths = match.transformToWildcard(pattern)
    variableMap.set(key, paths)
  }
  return variableMap
}
