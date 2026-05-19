import * as stream from 'node:stream'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as git from './git.js'
import type { Context } from './github.js'
import * as match from './match.js'

type Inputs = {
  paths: string[]
  pathsFallback: string[]
  types: string[]
  transform: string[]
}

type Outputs = {
  paths: string[]
}

export const run = async (inputs: Inputs, context: Context): Promise<Outputs> => {
  const filter = parseTypes(inputs.types)

  if ('pull_request' in context.payload) {
    core.startGroup(`Comparing the base branch and merge commit of the pull request`)
    const changedFiles = await git.compareMergeCommit(context.sha, filter, context)
    core.endGroup()
    core.info(`${changedFiles.length} files changed`)
    return await matchChangedFiles(changedFiles, inputs)
  }

  if ('before' in context.payload && 'after' in context.payload) {
    core.startGroup(`Comparing the before and after commits of the push event`)
    const changedFiles = await git.compareTwoCommits(context.payload.before, context.payload.after, filter, context)
    core.endGroup()
    core.info(`${changedFiles.length} files changed`)
    return await matchChangedFiles(changedFiles, inputs)
  }

  return await matchWorkingDirectoryFiles(inputs)
}

const parseTypes = (types: string[]): git.CompareFilter => {
  const filter: git.CompareFilter = {
    added: false,
    modified: false,
    deleted: false,
  }
  for (const type of types) {
    if (type === 'added') {
      filter.added = true
    } else if (type === 'modified') {
      filter.modified = true
    } else if (type === 'deleted') {
      filter.deleted = true
    } else {
      throw new Error(`Invalid type: ${type}. Possible values are 'added', 'modified' and 'deleted'.`)
    }
  }
  return filter
}

const matchChangedFiles = async (changedFiles: string[], inputs: Inputs): Promise<Outputs> => {
  if (match.matchGroups(inputs.pathsFallback, changedFiles).paths.length > 0) {
    core.info(`paths-fallback matched to the changed files`)
    return await matchWorkingDirectoryFiles(inputs)
  }
  return matchFiles(changedFiles, inputs)
}

const matchWorkingDirectoryFiles = async (inputs: Inputs): Promise<Outputs> => {
  const gitLsFiles = await exec.getExecOutput('git', ['ls-files'], {
    // Suppress output to avoid large logs
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

  return matchFiles(workingDirectoryFiles, inputs)
}

const matchFiles = (files: string[], inputs: Inputs): Outputs => {
  const matchResult = match.matchGroups(inputs.paths, files)
  if (inputs.transform.length > 0) {
    core.info(`Transforming ${inputs.transform.length} patterns:`)
    for (const pattern of inputs.transform) {
      core.info(`- ${pattern}`)
    }
    core.info(`with ${matchResult.variableMaps.length} variable maps:`)
    for (const variableMap of matchResult.variableMaps) {
      core.info(`- ${JSON.stringify(variableMap)}`)
    }
    const transformedPaths = inputs.transform.flatMap((pattern) => match.transform(pattern, matchResult.variableMaps))
    return {
      paths: transformedPaths,
    }
  }
  return {
    paths: matchResult.paths,
  }
}
