import * as stream from 'node:stream'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as git from './git.js'
import type { Context } from './github.js'
import * as match from './match.js'

type Inputs = {
  paths: string[]
  pathsFallback: string[]
  transform: string[]
}

type Outputs = {
  paths: string[]
}

export const run = async (inputs: Inputs, context: Context): Promise<Outputs> => {
  if ('pull_request' in context.payload) {
    core.info(`Comparing merge commit ${context.sha} of the pull request: ${context.payload.pull_request.html_url}`)
    const changedFiles = await git.compareMergeCommit(context.sha, context)
    core.info(`Found ${changedFiles.length} changed files in the pull request`)
    return await matchChangedFiles(changedFiles, inputs)
  }

  if ('before' in context.payload && 'after' in context.payload) {
    const before = context.payload.before
    const after = context.payload.after
    core.info(`Comparing before ${before} and after ${after} of the push event: ${context.payload.compare}`)
    const changedFiles = await git.compareTwoCommits(before, after, context)
    core.info(`Found ${changedFiles.length} changed files in the push event`)
    return await matchChangedFiles(changedFiles, inputs)
  }

  return await matchWorkingDirectory(inputs)
}

const matchChangedFiles = async (changedFiles: string[], inputs: Inputs): Promise<Outputs> => {
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
