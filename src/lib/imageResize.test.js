import { describe, it, expect } from 'vitest'
import { fitWithin, downscaleImage } from './imageResize'

describe('fitWithin', () => {
  it('scales the longer side down to the max, keeping aspect ratio', () => {
    expect(fitWithin(3000, 3000, 1600)).toEqual({ width: 1600, height: 1600 })
    expect(fitWithin(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 })
    expect(fitWithin(1000, 3000, 1500)).toEqual({ width: 500, height: 1500 })
  })
  it('never scales up and never returns a zero dimension', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 })
  })
})

describe('downscaleImage', () => {
  it('returns non-images, SVG and GIF untouched', async () => {
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    const svg = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' })
    expect(await downscaleImage(pdf)).toBe(pdf)
    expect(await downscaleImage(svg)).toBe(svg)
    expect(await downscaleImage(gif)).toBe(gif)
  })
  it('falls back to the original file when decoding is unavailable or fails', async () => {
    const png = new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })
    expect(await downscaleImage(png)).toBe(png)
  })
})
