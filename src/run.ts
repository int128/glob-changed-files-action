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
    core.startGroup(`Comparing the base branch and merge commit of the pull request`)
    const changedFiles = await git.compareMergeCommit(context.sha, context)
    core.endGroup()
    core.info(`${changedFiles.length} files changed`)
    return await matchChangedFiles(changedFiles, inputs)
  }

  if ('before' in context.payload && 'after' in context.payload) {
    core.startGroup(`Comparing the before and after commits of the push event`)
    const changedFiles = await git.compareTwoCommits(context.payload.before, context.payload.after, context)
    core.endGroup()
    core.info(`${changedFiles.length} files changed`)
    return await matchChangedFiles(changedFiles, inputs)
  }

  return await matchWorkingDirectory(inputs)
}

const matchChangedFiles = async (changedFiles: string[], inputs: Inputs): Promise<Outputs> => {
  if (match.matchGroups(inputs.pathsFallback, changedFiles).paths.length > 0) {
    core.info(`paths-fallback matched to the changed files`)
    return await matchWorkingDirectory(inputs)
  }

  const matchResult = match.matchGroups(inputs.paths, changedFiles)
  if (inputs.transform.length > 0) {
    core.info(`Transforming paths`)
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
  core.info(`${workingDirectoryFiles.length} files in the working directory`)

  const matchResult = match.matchGroups(inputs.paths, workingDirectoryFiles)
  if (inputs.transform.length > 0) {
    core.info(`Transforming paths`)
    const transformedPaths = inputs.transform.flatMap((pattern) => match.transform(pattern, matchResult.variableMaps))
    return {
      paths: transformedPaths,
    }
  }
  return {
    paths: matchResult.paths,
  }
}
