import * as fs from 'node:fs/promises'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { type Context, getToken } from './github.js'

export const lsFiles = async (): Promise<string[] | undefined> => {
  try {
    const code = await exec.exec('sh', ['-c', 'exec git ls-files > files'], { ignoreReturnCode: true })
    if (code > 0) {
      core.warning(`git ls-files exited with code ${code}`)
      return
    }
    const files = await fs.readFile('files', 'utf-8')
    return files.split('\n').filter((f) => f)
  } finally {
    await fs.rm('files', { force: true })
  }
}

export type DiffFilter = {
  added: boolean
  modified: boolean
  deleted: boolean
  // Currently not supported to keep the specification simple.
  // renamed (R)
  // copied (C)
}

const diffFilterFlagValue = (filter: DiffFilter): string =>
  [filter.added ? 'A' : '', filter.modified ? 'M' : '', filter.deleted ? 'D' : ''].join('')

export const compareMergeCommit = async (merge: string, filter: DiffFilter, context: Context): Promise<string[]> => {
  core.info(`merge commit: ${merge}`)
  return await withWorkspaceOrTemporaryDirectory(context, async (cwd) => {
    await exec.exec(
      'git',
      [
        ...gitTokenConfigFlags(context),
        'fetch',
        '--quiet',
        '--no-tags',
        // Fetch the merge commit and its first parent commit.
        '--depth=2',
        'origin',
        merge,
      ],
      {
        cwd,
        env: {
          ...process.env,
          CONFIG_VALUE_AUTHORIZATION_HEADER: authorizationHeader(),
        },
      },
    )
    const gitDiff = await exec.getExecOutput(
      'git',
      [
        'diff',
        '--name-only',
        `--diff-filter=${diffFilterFlagValue(filter)}`,
        // The merge commit has two parents.
        // The first parent is the base branch to be merged into.
        // The second parent is the head commit.
        `${merge}^1`,
        merge,
      ],
      { cwd },
    )
    return gitDiff.stdout.trim().split('\n')
  })
}

export const compareTwoCommits = async (
  before: string,
  after: string,
  filter: DiffFilter,
  context: Context,
): Promise<string[]> => {
  core.info(`before commit: ${before}`)
  core.info(`after commit: ${after}`)
  return await withWorkspaceOrTemporaryDirectory(context, async (cwd) => {
    await exec.exec(
      'git',
      [
        ...gitTokenConfigFlags(context),
        'fetch',
        '--quiet',
        '--no-tags',
        // Fetch the before commit and after commit.
        '--depth=1',
        'origin',
        before,
        after,
      ],
      {
        cwd,
        env: {
          ...process.env,
          CONFIG_VALUE_AUTHORIZATION_HEADER: authorizationHeader(),
        },
      },
    )
    const gitDiff = await exec.getExecOutput(
      'git',
      ['diff', '--name-only', `--diff-filter=${diffFilterFlagValue(filter)}`, before, after],
      { cwd },
    )
    return gitDiff.stdout.trim().split('\n')
  })
}

const withWorkspaceOrTemporaryDirectory = async <T>(context: Context, fn: (cwd: string) => Promise<T>): Promise<T> => {
  if (await workspaceHasGitRepository(context)) {
    return await fn(context.workspace)
  }

  const cwd = await fs.mkdtemp(`${context.runnerTemp}/glob-changed-files-action-`)
  core.info(`Fetching the repository into ${cwd}`)
  try {
    await exec.exec('git', ['init', '--quiet'], { cwd })
    await exec.exec(
      'git',
      ['remote', 'add', 'origin', `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`],
      { cwd },
    )
    return await fn(cwd)
  } finally {
    await fs.rm(cwd, { recursive: true, force: true })
    core.info(`Removed ${cwd}`)
  }
}

const workspaceHasGitRepository = async (context: Context) => {
  const gitGetUrl = await exec.getExecOutput('git', ['ls-remote', '--get-url'], {
    cwd: context.workspace,
    ignoreReturnCode: true,
  })
  if (gitGetUrl.exitCode !== 0) {
    return false
  }
  const remoteUrl = gitGetUrl.stdout.trim()
  return (
    remoteUrl === `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}.git` ||
    remoteUrl === `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`
  )
}

const gitTokenConfigFlags = (context: Context) => {
  const origin = new URL(context.serverUrl).origin
  return [
    // Reset http.extraheader config set by actions/checkout
    // https://github.com/actions/checkout/issues/162#issuecomment-590821598
    `-c`,
    `http.${origin}/.extraheader=`,
    `--config-env=http.${origin}/.extraheader=CONFIG_VALUE_AUTHORIZATION_HEADER`,
  ]
}

const authorizationHeader = () => {
  const credentials = Buffer.from(`x-access-token:${getToken()}`).toString('base64')
  core.setSecret(credentials)
  return `AUTHORIZATION: basic ${credentials}`
}
