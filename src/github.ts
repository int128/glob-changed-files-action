import assert from 'node:assert'
import * as fs from 'node:fs/promises'
import type { webhooks } from '@octokit/openapi-webhooks-types'

export const getToken = (): string => {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN
  } else if (process.env.INPUT_TOKEN) {
    return process.env.INPUT_TOKEN
  }
  throw new Error('GITHUB_TOKEN or INPUT_TOKEN is required')
}

type Payload<Event extends keyof webhooks> = webhooks[Event]['post']['requestBody']['content']['application/json']
type PossiblePayload = Payload<keyof webhooks>

export type Context = {
  repo: {
    owner: string
    repo: string
  }
  sha: string
  serverUrl: string
  workspace: string
  runnerTemp: string
  payload: PossiblePayload
}

export const getContext = async (): Promise<Context> => {
  // https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables#default-environment-variables
  return {
    repo: getRepo(),
    sha: getEnv('GITHUB_SHA'),
    serverUrl: getEnv('GITHUB_SERVER_URL'),
    workspace: getEnv('GITHUB_WORKSPACE'),
    runnerTemp: getEnv('RUNNER_TEMP'),
    payload: JSON.parse(await fs.readFile(getEnv('GITHUB_EVENT_PATH'), 'utf-8')) as PossiblePayload,
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
