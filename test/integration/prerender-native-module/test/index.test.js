/* eslint-env jest */

import fs from 'fs-extra'
import { join, sep } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '..')

const runTests = () => {
  it('should render index correctly', async () => {
    const browser = await webdriver(appPort, '/')
    expect(await browser.elementByCss('#index').text()).toBe('index page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      index: true,
    })
  })

  it('should render /blog/first correctly', async () => {
    const browser = await webdriver(appPort, '/blog/first')

    expect(await browser.elementByCss('#blog').text()).toBe('blog page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: { slug: 'first' },
      blog: true,
      users: [
        { id: 1, first_name: 'john', last_name: 'deux' },
        { id: 2, first_name: 'zeit', last_name: 'geist' },
      ],
    })
  })

  it('should render /blog/second correctly', async () => {
    const browser = await webdriver(appPort, '/blog/second')
    await browser.waitForElementByCss('#blog')

    expect(await browser.elementByCss('#blog').text()).toBe('blog page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: { slug: 'second' },
      blog: true,
      users: [
        { id: 1, first_name: 'john', last_name: 'deux' },
        { id: 2, first_name: 'zeit', last_name: 'geist' },
      ],
    })
  })
}

describe('Prerender native module', () => {
  describe('production', () => {
    beforeAll(async () => {
      const result = await nextBuild(appDir, undefined, {
        cwd: appDir,
        stderr: true,
        stdout: true,
      })

      if (result.code !== 0) {
        console.error(result)
        throw new Error(`Failed to build, exited with code ${result.code}`)
      }
      appPort = await findPort()
      app = await nextStart(appDir, appPort, { cwd: appDir })
    })
    afterAll(() => killApp(app))

    it('should output traces', async () => {
      const checks = [
        {
          page: '/_app',
          tests: [
            /webpack-runtime\.js/,
            /node_modules\/react\/index\.js/,
            /node_modules\/react\/package\.json/,
            /node_modules\/react\/cjs\/react\.production\.min\.js/,
          ],
          notTests: [/node_modules\/react\/cjs\/react\.development\.js/],
        },
        {
          page: '/blog/[slug]',
          tests: [
            /webpack-runtime\.js/,
            /node_modules\/react\/index\.js/,
            /node_modules\/react\/package\.json/,
            /node_modules\/react\/cjs\/react\.production\.min\.js/,
            /node_modules\/sqlite3\/.*?\.js/,
            /node_modules\/sqlite3\/.*?\.node/,
            /node_modules\/sqlite\/.*?\.js/,
            /\/data\.sqlite/,
          ],
          notTests: [/node_modules\/react\/cjs\/react\.development\.js/],
        },
      ]

      for (const check of checks) {
        const contents = await fs.readFile(
          join(appDir, '.next/server/pages/', check.page + '.js.nft.json'),
          'utf8'
        )
        const { version, files } = JSON.parse(contents)
        expect(version).toBe(1)

        expect(
          check.tests.every((item) => files.some((file) => item.test(file)))
        ).toBe(true)

        if (sep === '/') {
          expect(
            check.notTests.some((item) => files.some((file) => item.test(file)))
          ).toBe(false)
        }
      }
    })

    runTests()
  })

  describe('dev', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, { cwd: appDir })
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
