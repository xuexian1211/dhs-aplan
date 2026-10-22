import assert from 'node:assert/strict'

/** Keep in sync with src/harness.ts isPlaceholderOnlyOutput */
function isPlaceholderOnlyOutput(raw) {
  const t = raw.trim()
  if (!t) return true
  return /^(?:\[[^\]]+\])+$/i.test(t)
}

assert.equal(isPlaceholderOnlyOutput('[reasoning]'), true)
assert.equal(isPlaceholderOnlyOutput('[thinking]'), true)
assert.equal(isPlaceholderOnlyOutput('[reasoning][thinking]'), true)
assert.equal(isPlaceholderOnlyOutput('  [reasoning]  '), true)
assert.equal(isPlaceholderOnlyOutput(''), true)
assert.equal(isPlaceholderOnlyOutput('   '), true)
assert.equal(isPlaceholderOnlyOutput('done'), false)
assert.equal(isPlaceholderOnlyOutput('[reasoning] done'), false)
assert.equal(isPlaceholderOnlyOutput('(tools this turn: edit)'), false)
console.log('ok placeholder gate')
