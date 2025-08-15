import * as core from '@actions/core'
import { run } from './run.js'
import { getContext, getOctokit } from './github.js'

const main = async (): Promise<void> => {
  const outputs = await run(
    {
      paths: core.getMultilineInput('paths', { required: true }),
      pathsFallback: core.getMultilineInput('paths-fallback'),
      fallbackMethod: parseFallbackMethod(core.getInput('fallback-method', { required: true })),
      outputsMap: parseOutputs(core.getMultilineInput('outputs', { required: true })),
      outputsEncoding: parseOutputsEncoding(core.getInput('outputs-encoding', { required: true })),
    },
    await getContext(),
    getOctokit(),
  )
  for (const [k, v] of outputs.map) {
    core.startGroup(`Set output ${k}`)
    core.setOutput(k, v)
    core.info(v)
    core.endGroup()
  }
}

const parseOutputs = (outputs: string[]): Map<string, string> => {
  const map = new Map<string, string>()
  for (const entry of outputs) {
    const i = entry.indexOf('=')
    if (i < 0) {
      throw new Error(`outputs must be in form of NAME=PATH but was ${entry}`)
    }
    const k = entry.substring(0, i)
    const v = entry.substring(i + 1)
    map.set(k, v)
  }
  return map
}

const parseOutputsEncoding = (encoding: string): 'multiline' | 'json' => {
  if (encoding === 'multiline') {
    return 'multiline'
  }
  if (encoding === 'json') {
    return 'json'
  }
  throw new Error(`outputs-encoding must be either 'multiline' or 'json'`)
}

const parseFallbackMethod = (method: string): 'wildcard' | 'working-directory' => {
  if (method === 'wildcard') {
    return 'wildcard'
  }
  if (method === 'working-directory') {
    return 'working-directory'
  }
  throw new Error(`fallback-method must be either 'wildcard' or 'working-directory'`)
}

main().catch((e: Error) => {
  core.setFailed(e)
  console.error(e)
})
