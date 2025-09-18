import assert from 'assert'
import * as fs from 'fs/promises'
import { Octokit } from '@octokit/action'
import { WebhookEvent } from '@octokit/webhooks-types'
import { retry } from '@octokit/plugin-retry'

export const getOctokit = () => new (Octokit.plugin(retry))()

export const getToken = (): string => {
  if (process.env['GITHUB_TOKEN']) {
    return process.env['GITHUB_TOKEN']
  } else if (process.env['INPUT_TOKEN']) {
    return process.env['INPUT_TOKEN']
  }
  throw new Error('GITHUB_TOKEN or INPUT_TOKEN is required')
}

export type Context = {
  repo: {
    owner: string
    repo: string
  }
  eventName: string
  serverUrl: string
  workspace: string
  runnerTemp: string
  payload: WebhookEvent
}

export const getContext = async (): Promise<Context> => {
  // https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables#default-environment-variables
  return {
    repo: getRepo(),
    eventName: getEnv('GITHUB_EVENT_NAME'),
    serverUrl: getEnv('GITHUB_SERVER_URL'),
    workspace: getEnv('GITHUB_WORKSPACE'),
    runnerTemp: getEnv('RUNNER_TEMP'),
    payload: JSON.parse(await fs.readFile(getEnv('GITHUB_EVENT_PATH'), 'utf-8')) as WebhookEvent,
  }
}

const getRepo = () => {
  const [owner, repo] = getEnv('GITHUB_REPOSITORY').split('/')
  return { owner, repo }
}

const getEnv = (name: string): string => {
  assert(process.env[name], `${name} is required`)
  return process.env[name]
}
