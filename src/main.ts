import * as core from '@actions/core'
import { run } from './run.js'
import { getContext, getOctokit } from './github.js'

const main = async (): Promise<void> => {
  if (core.getInput('outputs')) {
    throw new Error(`outputs has been removed. See https://github.com/int128/glob-changed-files-action for migration`)
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
