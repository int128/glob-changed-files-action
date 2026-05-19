import { describe, expect, it } from 'vitest'
import { parseTypes } from '../src/run.js'

describe('parseTypes', () => {
  it('returns a filter with the specified types set to true', () => {
    expect(parseTypes(['added'])).toEqual({ added: true, modified: false, deleted: false })
    expect(parseTypes(['modified'])).toEqual({ added: false, modified: true, deleted: false })
    expect(parseTypes(['deleted'])).toEqual({ added: false, modified: false, deleted: true })
    expect(parseTypes(['added', 'modified'])).toEqual({ added: true, modified: true, deleted: false })
    expect(parseTypes(['added', 'modified', 'deleted'])).toEqual({ added: true, modified: true, deleted: true })
  })

  it('throws an error for invalid types', () => {
    expect(() => parseTypes(['invalid'])).toThrow()
  })
})
