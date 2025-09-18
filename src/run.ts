import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as git from './git.js'
import * as match from './match.js'
import * as stream from 'stream'
import { Context } from './github.js'
import { Octokit } from '@octokit/action'

type Inputs = {
  paths: string[]
  pathsFallback: string[]
  transform: string[]
}

type Outputs = {
  paths: string[]
}

export const run = async (inputs: Inputs, octokit: Octokit, context: Context): Promise<Outputs> => {
  const compare = await determineCommitsToCompare(octokit, context)
  if (compare) {
    return await matchChangedFiles(compare.base, compare.head, inputs, context)
  }
  return await matchWorkingDirectory(inputs)
}

const determineCommitsToCompare = async (octokit: Octokit, context: Context) => {
  if ('pull_request' in context.payload) {
    const head = context.payload.pull_request.head.sha
    const maybeBase = context.payload.pull_request.base.sha
    core.startGroup(`Fetching the first commit of #${context.payload.pull_request.number}`)
    const { data: commits } = await octokit.rest.pulls.listCommits({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
      per_page: 1,
      page: 1,
    })
    core.info(`listCommits = ${JSON.stringify(commits, null, 2)}`)
    core.info(`context.payload.pull_request.base.sha = ${maybeBase}`)
    core.endGroup()
    if (commits.length === 0 || commits[0].parents.length === 0) {
      core.warning(
        `The pull request does not have any parent commit. Using the base sha ${maybeBase} of pull_request event.`,
      )
      return { base: maybeBase, head }
    }
    const base = commits[0].parents[0].sha
    core.info(`Comparing base ${base} and head ${head} of the pull request: ${context.payload.pull_request.html_url}`)
    return { base, head }
  }
  if ('before' in context.payload && 'after' in context.payload) {
    const before = context.payload.before
    const after = context.payload.after
    core.info(`Comparing before ${before} and after ${after} of the push event: ${context.payload.compare}`)
    return { base: before, head: after }
  }
}

const matchChangedFiles = async (base: string, head: string, inputs: Inputs, context: Context): Promise<Outputs> => {
  const changedFiles = await git.compareCommits(base, head, context)
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
