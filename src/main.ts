import * as core from '@actions/core'
import { run } from './run.js'
import { getContext, getOctokit } from './github.js'

const main = async (): Promise<void> => {
  if (core.getInput('outputs')) {
    throw new Error(
      `The outputs parameter has been removed. See https://github.com/int128/glob-changed-files-action#migration-v2`,
    )
  }
  if (core.getInput('outputs-encoding')) {
    throw new Error(
      `The outputs-encoding parameter has been removed. See https://github.com/int128/glob-changed-files-action#migration-v2`,
    )
  }
  if (core.getInput('fallback-method')) {
    throw new Error(
      `The fallback-method parameter has been removed. See https://github.com/int128/glob-changed-files-action#migration-v2`,
    )
  }

  const outputs = await run(
    {
      paths: core.getMultilineInput('paths', { required: true }),
      pathsFallback: core.getMultilineInput('paths-fallback'),
      transform: core.getMultilineInput('transform'),
    },
    await getContext(),
    getOctokit(),
  )
  core.setOutput('paths', outputs.paths.join('\n'))
  core.setOutput('paths-json', outputs.paths)
}

main().catch((e: Error) => {
  core.setFailed(e)
  console.error(e)
})
