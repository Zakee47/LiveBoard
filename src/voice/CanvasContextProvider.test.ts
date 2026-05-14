import assert from 'node:assert/strict'
import test from 'node:test'
import { createShapeId } from 'tldraw'
import { createCanvasContextDebugText } from './CanvasContextProvider'
import type { CanvasSnapshot } from './types'

const selectedShapeId = createShapeId('selected')
const visibleNoteShapeId = createShapeId('visible-note')
const offscreenShapeId1 = createShapeId('offscreen-1')
const offscreenShapeId2 = createShapeId('offscreen-2')

const payload: CanvasSnapshot = {
	selectedShapeIds: [selectedShapeId],
	selectedShapes: [
		{
			id: selectedShapeId,
			type: 'geo',
			text: 'Launch plan',
			bounds: { x: 10, y: 20, w: 200, h: 100 },
			center: { x: 110, y: 70 },
			parentId: 'page:page',
			meta: { color: 'blue', fill: 'semi', geo: 'rectangle' },
			x: 10,
			y: 20,
			rotation: 0,
			isLocked: false,
			opacity: 1,
		},
	],
	visibleShapes: [
		{
			id: selectedShapeId,
			type: 'geo',
			text: 'Launch plan',
			bounds: { x: 10, y: 20, w: 200, h: 100 },
			center: { x: 110, y: 70 },
			parentId: 'page:page',
			meta: { color: 'blue', fill: 'semi', geo: 'rectangle' },
		},
		{
			id: visibleNoteShapeId,
			type: 'note',
			text: 'Risk: timeline',
			bounds: { x: 280, y: 30, w: 160, h: 160 },
			center: { x: 360, y: 110 },
			parentId: 'page:page',
			meta: { color: 'yellow' },
		},
	],
	viewportBounds: { x: 0, y: 0, w: 1000, h: 800 },
	selectionBounds: { x: 10, y: 20, w: 200, h: 100 },
	clusters: [
		{
			id: 'right:2:0',
			position: 'right',
			count: 8,
			shapeTypes: { geo: 5, text: 3 },
			bounds: { x: 3200, y: 120, w: 900, h: 400 },
			sampleShapeIds: [offscreenShapeId1, offscreenShapeId2],
			sampleTexts: ['Future ideas'],
		},
	],
	totalShapeCount: 10,
	omittedShapeCount: 0,
	generatedAt: Date.parse('2026-05-13T18:00:00Z'),
}

test('debug context text includes compact payload sections', () => {
	const text = createCanvasContextDebugText(payload)

	assert.match(text, /Viewport: x=0, y=0, w=1000, h=800/)
	assert.match(text, /Selection: 1 selected/)
	assert.match(text, /shape:selected geo "Launch plan"/)
	assert.match(text, /right: 8 shapes/)
	assert.match(text, /Screenshot: omitted/)
})

test('critique payload may include base64 PNG without changing compact context', () => {
	const withScreenshot: CanvasSnapshot = {
		...payload,
		screenshotBase64Png: 'iVBORw0KGgo=',
	}

	assert.equal(withScreenshot.screenshotBase64Png, 'iVBORw0KGgo=')
	assert.equal(withScreenshot.visibleShapes.length, 2)
	assert.equal(withScreenshot.clusters[0].count, 8)
	assert.match(createCanvasContextDebugText(withScreenshot), /Screenshot: included as base64 PNG/)
})
