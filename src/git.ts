import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import { Context, getToken } from './github.js'

export const compareCommits = async (base: string, head: string, context: Context): Promise<string[]> => {
  return await withWorkspaceOrTemporary(context, async (cwd) => {
    await exec.exec('git', ['fetch', '--no-tags', '--depth=1', 'origin', base, head], { cwd })

    const gitDiff = await exec.getExecOutput('git', ['diff', '--name-only', base, head], { cwd })
    return gitDiff.stdout.trim().split('\n')
  })
}

const withWorkspaceOrTemporary = async <T>(context: Context, fn: (cwd: string) => Promise<T>): Promise<T> => {
  const gitGetUrl = await exec.getExecOutput('git', ['ls-remote', '--get-url'], {
    cwd: context.workspace,
    ignoreReturnCode: true,
  })
  if (gitGetUrl.exitCode === 0) {
    const workspaceUrl = gitGetUrl.stdout.trim()
    if (
      workspaceUrl === `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}.git` ||
      workspaceUrl === `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`
    ) {
      return await fn(context.workspace)
    }
  }

  const cwd = await fs.mkdtemp(`${context.runnerTemp}/glob-changed-files-action-`)
  try {
    await exec.exec('git', ['init', '--quiet'], { cwd })
    await exec.exec(
      'git',
      ['remote', 'add', 'origin', `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`],
      { cwd },
    )
    const credentials = Buffer.from(`x-access-token:${getToken()}`).toString('base64')
    core.setSecret(credentials)
    await exec.exec(
      'git',
      ['config', '--local', `http.${context.serverUrl}/.extraheader`, `AUTHORIZATION: basic ${credentials}`],
      { cwd },
    )
    return await fn(cwd)
  } finally {
    await fs.rm(cwd, { recursive: true, force: true })
  }
}
