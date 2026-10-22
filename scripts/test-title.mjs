import assert from 'node:assert/strict'
import { sessionTitleForRun } from '../dist/title.js'
const p = 'You were mentioned in a comment on issue AE-69 "【销售/PCM】缺陷：参数值类型"布尔"编码不一致，条件判断可能认不出布尔参数" of your project.\nWork out'
assert.equal(sessionTitleForRun({ id: 1125, prompt: p, issueIdentifier: 'AE-69' }, '开发'),
  'AE-69 · 开发 · 【销售/PCM】缺陷：参数值类型"布尔"编码不一致，条件判断可能认不出布尔参数')
assert.equal(sessionTitleForRun({ id: 7, prompt: 'Carry out the following task:\n\n# x\n do  it', issueIdentifier: null }, '开发'),
  'itsaplan run 7 · 开发 · do it')
const long = sessionTitleForRun({ id: 8, prompt: 'AE-70 "' + '长'.repeat(100) + '"', issueIdentifier: 'AE-70' }, '开发')
assert.equal(long.length, 80); assert.ok(long.endsWith('…'))
console.log('title tests ok')
