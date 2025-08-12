import * as core from '@actions/core'
import { run } from './run.js'
import { getContext, getOctokit } from './github.js'

const main = async (): Promise<void> => {
  const outputs = await run(
    {
      paths: core.getMultilineInput('paths', { required: true }),
      pathsFallback: core.getMultilineInput('paths-fallback'),
      transform: core.getMultilineInput('transform', { required: true }),
    },
    await getContext(),
    getOctokit(),
  )
  core.setOutput('paths', outputs.paths.join('\n'))
  core.setOutput('paths-json', JSON.stringify(outputs.paths))
}

main().catch((e: Error) => {
  core.setFailed(e)
  console.error(e)
})
