import * as core from '@actions/core'
import { Octokit } from '@octokit/core'
import { exec } from '@actions/exec'
import { execSync } from 'child_process'
import { getConfig } from './config'

const run = async () => {
  core.startGroup('Post cleanup script')

  if (process.env.HAS_RUN_POST_JOB) {
    core.info('Files already committed')
    core.endGroup()
    return
  }

  const files = JSON.parse(process.env.FILES || '[]')

  const date = new Date().toISOString()
  const meta = JSON.stringify(
    {
      date,
      files,
    },
    undefined,
    2
  )
  const msg = `Flat: latest data (${date})`

  // Don't want to commit if there aren't any files changed!
  if (!files.length) return

  // commit to correct branch if user enabled pull request creation.
  let branchname = await execSync('git rev-parse --abbrev-ref HEAD').toString()
  const config = getConfig()
  if (config.create_pull_request === 'true') {
    branchname = 'flat-data/'.concat(Date.now().toString())
    core.startGroup('Switch branches')
    await exec('git', ['checkout', '-b', branchname])
    core.endGroup()
  }

  // these should already be staged, in main.ts
  core.info(`Committing "${msg}"`)
  core.debug(meta)
  await exec('git', ['commit', '-m', msg + '\n' + meta])
  await exec('git', ['push', 'origin', branchname])
  core.info(`Pushed!`)
  core.exportVariable('HAS_RUN_POST_JOB', 'true')

  core.endGroup()

  core.startGroup('Create pull request')

  const github_repo = process.env.GITHUB_REPOSITORY
  let owner_repo = github_repo ? github_repo.split('/') : ['', '']
  let owner = owner_repo[0]
  let repo = owner_repo[1]
  const github_ref = process.env.GITHUB_REF
  let ref = github_ref ? github_ref.split('/') : ['']
  let base = ref[ref.length - 1]

  core.info('Creating pull request with oktokit')
  core.info(`base: ${base}; head: ${branchname}; repo: ${owner}/${repo}`)

  let octokit = new Octokit({debug: true, auth: config.token})
  const response = await octokit.request(`POST /repos/${owner}/${repo}/pulls`, {
    owner: owner,
    repo: repo,
    head: branchname,
    base: base,
  }).catch(console.log)
  core.info(
    `Created pull request #${response} (${branchname} => ${base})`
  )

  core.endGroup()
}

run().catch(error => {
  core.setFailed('Post script failed! ' + error.message)
})
