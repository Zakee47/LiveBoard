import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
	Editor,
	createTLStore,
	defaultBindingUtils,
	defaultShapeUtils,
	defaultTools,
	tipTapDefaultExtensions,
	type TLShape,
} from 'tldraw'
import { createActionBridge } from './ActionBridge'

interface RichTextNode {
	content?: RichTextNode[]
	text?: string
}

function installDom() {
	const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>')
	const frame = (callback: Parameters<typeof requestAnimationFrame>[0]) =>
		window.setTimeout(() => callback(Date.now()), 16)

	globalThis.window = dom.window as unknown as Window & typeof globalThis
	globalThis.document = dom.window.document
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: dom.window.navigator,
	})
	globalThis.HTMLElement = dom.window.HTMLElement
	globalThis.Element = dom.window.Element
	globalThis.SVGElement = dom.window.SVGElement
	globalThis.requestAnimationFrame = frame
	globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
	window.requestAnimationFrame = frame
	window.cancelAnimationFrame = (id) => clearTimeout(id)
}

function createDemoEditor() {
	installDom()

	const store = createTLStore({
		shapeUtils: defaultShapeUtils,
		bindingUtils: defaultBindingUtils,
	})
	const container = document.getElementById('app')
	assert(container)
	container.getBoundingClientRect = () => ({
		x: 0,
		y: 0,
		top: 0,
		left: 0,
		right: 1200,
		bottom: 800,
		width: 1200,
		height: 800,
		toJSON: () => ({}),
	})

	const editor = new Editor({
		store,
		shapeUtils: defaultShapeUtils,
		bindingUtils: defaultBindingUtils,
		tools: defaultTools,
		getContainer: () => container,
		textOptions: {
			tipTapConfig: { extensions: tipTapDefaultExtensions },
			addFontsFromNode: (_node, state) => state,
		},
	})

	return { editor, store }
}

function getShapeByText(editor: Editor, text: string): TLShape {
	const shape = editor
		.getCurrentPageShapes()
		.find(
			(candidate) =>
				'richText' in candidate.props &&
				getPlainText(candidate.props.richText as RichTextNode).trim() === text
		)
	assert(shape, `Expected shape with text "${text}"`)
	return shape
}

function getPlainText(node: RichTextNode): string {
	return [node.text ?? '', ...(node.content ?? []).map(getPlainText)].join('')
}

async function main() {
	const { editor, store } = createDemoEditor()
	const bridge = createActionBridge({ editor })

	const createResult = await bridge.execute({
		type: 'create_shapes',
		shapes: [
			{ shapeId: 'alpha', type: 'geo', text: 'Alpha', color: 'blue', x: 0, y: 0, w: 140, h: 90 },
			{ shapeId: 'beta', type: 'note', text: 'Beta', color: 'yellow', x: 260, y: 0 },
			{ shapeId: 'title', type: 'text', text: 'Title', x: 0, y: 180 },
		],
	})
	assert.equal(createResult.status, 'ok')
	assert.equal(editor.getCurrentPageShapes().length, 3)

	const updateResult = await bridge.execute({
		type: 'update_shapes',
		shapes: [{ name: 'Alpha', text: 'Alpha updated', color: 'green', x: 25, y: 35, w: 180, h: 110 }],
	})
	assert.equal(updateResult.status, 'ok')
	let alpha = getShapeByText(editor, 'Alpha updated')
	assert.equal(alpha.x, 25)
	assert.equal(alpha.y, 35)

	const connectResult = await bridge.execute({
		type: 'connect_shapes',
		shapeId: 'alpha-to-beta',
		arrowFromName: 'Alpha updated',
		arrowToName: 'Beta',
	})
	assert.equal(connectResult.status, 'ok')
	assert.equal(editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow').length, 1)
	assert.equal(store.allRecords().filter((record) => record.typeName === 'binding').length, 2)

	editor.setSelectedShapes([alpha.id, getShapeByText(editor, 'Beta').id])
	const layoutResult = await bridge.execute({
		type: 'layout_shapes',
		shapeIds: [alpha.id, getShapeByText(editor, 'Beta').id],
		operation: 'left-right',
		gap: 64,
	})
	assert.equal(layoutResult.status, 'ok')
	alpha = getShapeByText(editor, 'Alpha updated')
	const beta = getShapeByText(editor, 'Beta')
	assert(beta.x > alpha.x, 'Expected left-right layout to move Beta right of Alpha')

	const ambiguousResult = await bridge.execute({
		type: 'create_shapes',
		shapes: [
			{ type: 'geo', text: 'Duplicate', x: 0, y: 320 },
			{ type: 'geo', text: 'Duplicate', x: 240, y: 320 },
		],
	})
	assert.equal(ambiguousResult.status, 'ok')
	const clarificationResult = await bridge.execute({
		type: 'update_shapes',
		shapes: [{ name: 'Duplicate', color: 'red' }],
	})
	assert.equal(clarificationResult.status, 'clarification')
	assert.equal(clarificationResult.matches?.length, 2)

	const deleteResult = await bridge.execute({
		type: 'delete_shapes',
		shapeIds: ['selected'],
	})
	assert.equal(deleteResult.status, 'ok')
	assert(!editor.getShape(alpha.id))
	assert(!editor.getShape(beta.id))

	console.log('ActionBridge demo passed: create, update, delete, connect, layout, and clarification.')
}

await main()
process.exit(0)
