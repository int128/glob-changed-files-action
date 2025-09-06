import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as git from './git.js'
import * as match from './match.js'
import * as stream from 'stream'
import { Context } from './github.js'

type Inputs = {
  paths: string[]
  pathsFallback: string[]
  transform: string[]
}

type Outputs = {
  paths: string[]
}

export const run = async (inputs: Inputs, context: Context): Promise<Outputs> => {
  if (!('pull_request' in context.payload && 'number' in context.payload)) {
    core.info(`Fallback due to not pull_request event`)
    return await matchWorkingDirectory(inputs)
  }

  core.info(`Comparing the base and head of the pull request`)
  const changedFiles = await git.compareCommits(
    context.payload.pull_request.base.sha,
    context.payload.pull_request.head.sha,
    context,
  )
  core.info(`Found ${changedFiles.length} changed files`)

  if (match.matchGroups(inputs.pathsFallback, changedFiles).paths.length > 0) {
    core.info(`Fallback due to paths-fallback matches to the changed files`)
    return await matchWorkingDirectory(inputs)
  }

  const matchResult = match.matchGroups(inputs.paths, changedFiles)
  core.info(`Transform paths by the changed files`)
  if (inputs.transform.length > 0) {
    const transformedPaths = inputs.transform.flatMap((pattern) => match.transform(pattern, matchResult.variableMaps))
    return {
      paths: transformedPaths,
    }
  }
  return {
    paths: matchResult.paths,
  }
}

const matchWorkingDirectory = async (inputs: Inputs): Promise<Outputs> => {
  core.info(`Finding the working directory files`)
  const gitLsFiles = await exec.getExecOutput('git', ['ls-files'], {
    outStream: new stream.PassThrough(),
    ignoreReturnCode: true,
  })
  if (gitLsFiles.exitCode > 0) {
    core.warning(`Failed to list the working directory files. Empty paths will be returned`)
    return {
      paths: [],
    }
  }
  const workingDirectoryFiles = gitLsFiles.stdout.trim().split('\n')
  core.info(`Found ${workingDirectoryFiles.length} files in the working directory`)

  const matchResult = match.matchGroups(inputs.paths, workingDirectoryFiles)
  core.info(`Transform paths by the working directory files`)
  if (inputs.transform.length > 0) {
    const transformedPaths = inputs.transform.flatMap((pattern) => match.transform(pattern, matchResult.variableMaps))
    return {
      paths: transformedPaths,
    }
  }
  return {
    paths: matchResult.paths,
  }
}
