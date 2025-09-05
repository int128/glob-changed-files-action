import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import { Context, getToken } from './github.js'

export const compareCommits = async (base: string, head: string, context: Context): Promise<string[]> => {
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
    await exec.exec('git', ['fetch', '--depth=1', 'origin', base, head], { cwd })

    const gitDiff = await exec.getExecOutput('git', ['diff', '--name-only', base, head], { cwd })
    return gitDiff.stdout.trim().split('\n')
  } finally {
    await fs.rm(cwd, { recursive: true, force: true })
  }
}
