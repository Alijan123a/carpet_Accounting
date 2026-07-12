import { describe, it, expect } from 'vitest'
import {
  roundCents,
  floorCentsToWholeUnits,
  formatCents,
  formatCentsCompact,
  formatMoney,
  parseMoneyToCents
} from '../money'

describe('roundCents', () => {
  it('rounds to the nearest whole cent', () => {
    expect(roundCents(109.989 * 100)).toBe(10999)
    expect(roundCents(10999.4)).toBe(10999)
    expect(roundCents(10999.5)).toBe(11000)
  })

  it('normalizes negative zero', () => {
    expect(Object.is(roundCents(-0.1), 0)).toBe(true)
  })
})

describe('floorCentsToWholeUnits', () => {
  it('drops the fraction, never rounds up (17.99 → 17.00)', () => {
    expect(floorCentsToWholeUnits(1799)).toBe(1700)
    expect(floorCentsToWholeUnits(1701)).toBe(1700)
    expect(floorCentsToWholeUnits(1700)).toBe(1700)
    expect(floorCentsToWholeUnits(0)).toBe(0)
  })
})

describe('formatCentsCompact', () => {
  it('hides a zero fraction but keeps a real one', () => {
    expect(formatCentsCompact(1700)).toBe('17')
    expect(formatCentsCompact(1234500)).toBe('12,345')
    expect(formatCentsCompact(1750)).toBe('17.50')
    expect(formatCentsCompact(0)).toBe('0')
  })
})

describe('formatCents / formatMoney (display only)', () => {
  it('formats with two decimals and thousands grouping', () => {
    expect(formatCents(4550)).toBe('45.50')
    expect(formatCents(100000)).toBe('1,000.00')
    expect(formatCents(1234567)).toBe('12,345.67')
    expect(formatCents(0)).toBe('0.00')
  })

  it('formats negatives', () => {
    expect(formatCents(-1234567)).toBe('-12,345.67')
    expect(formatCents(-5)).toBe('-0.05')
  })

  it('appends the currency symbol (؋ for AFN, $ for USD)', () => {
    expect(formatMoney(4550, 'AFN')).toBe('45.50 ؋')
    expect(formatMoney(32000, 'USD')).toBe('320.00 $')
  })
})

describe('parseMoneyToCents', () => {
  it('parses major-unit strings into integer cents', () => {
    expect(parseMoneyToCents('45.50')).toBe(4550)
    expect(parseMoneyToCents('1,000')).toBe(100000)
    expect(parseMoneyToCents('0')).toBe(0)
    expect(parseMoneyToCents('1250.5')).toBe(125050)
  })

  it('returns null for empty or invalid input', () => {
    expect(parseMoneyToCents('')).toBeNull()
    expect(parseMoneyToCents('   ')).toBeNull()
    expect(parseMoneyToCents('abc')).toBeNull()
  })
})
