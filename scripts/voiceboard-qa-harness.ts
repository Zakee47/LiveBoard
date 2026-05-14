import assert from 'node:assert/strict'

import { createActionBridge } from '../src/voice/ActionBridge'
import { createPushToTalkController } from '../src/voice/PushToTalkController'
import { MockVoiceSessionManager } from '../src/voice/VoiceSessionManager'
import { realtimeTools } from '../src/voice/tools'
import type { TLCreateShapePartial, TLShape, TLShapeId, TLShapePartial } from 'tldraw'
import type {
	ConnectShapesAction,
	CreateShapesAction,
	DeleteShapesAction,
	LayoutShapesAction,
	UpdateShapesAction,
	VoiceShapeUpdate,
	VoiceState,
} from '../src/voice/types'

type TestCase = {
	name: string
	run: () => Promise<void> | void
}

type GoldenPathStatus = 'automated' | 'partial' | 'planned' | 'manual'

type GoldenPath = {
	id: string
	description: string
	status: GoldenPathStatus
}

const goldenPaths: GoldenPath[] = [
	{
		id: 'push-to-talk-state',
		description: 'hold spacebar/button state transitions',
		status: 'partial',
	},
	{
		id: 'mock-architecture-create',
		description: 'mock voice command creates frontend/API/Postgres architecture within 2s',
		status: 'planned',
	},
	{
		id: 'selection-rename-auth-service',
		description: "select API shape and 'Rename this to Auth Service'",
		status: 'planned',
	},
	{
		id: 'name-reference-database-update',
		description: 'name-based reference moves/updates database',
		status: 'planned',
	},
	{
		id: 'ambiguous-move-clarification',
		description: "ambiguous 'move the box' with multiple boxes yields clarification",
		status: 'planned',
	},
	{
		id: 'clean-up-layout',
		description: "'Clean this up' triggers layout",
		status: 'partial',
	},
	{
		id: 'critique-chat',
		description: "'What is wrong with this?' writes text critique to chat panel",
		status: 'partial',
	},
	{
		id: 'silent-vs-narration',
		description: 'simple actions silent vs multi-step narration hook',
		status: 'planned',
	},
	{
		id: 'transcript-collapse-expand',
		description: 'transcript collapse/expand and entries',
		status: 'planned',
	},
	{
		id: 'text-chat-fallback',
		description: 'text chat fallback invokes same action path',
		status: 'partial',
	},
	{
		id: 'manual-openai',
		description: 'manual real OpenAI validation with OPENAI_API_KEY',
		status: 'manual',
	},
]

function createShape(id: string): TLCreateShapePartial {
	return {
		id,
		type: 'geo',
		x: 0,
		y: 0,
		props: { geo: 'rectangle', w: 160, h: 80 },
	} as unknown as TLCreateShapePartial
}

function updateShape(id: string): VoiceShapeUpdate {
	return {
		shapeId: shapeId(id),
		text: 'Auth Service',
	}
}

function shapeId(id: string): TLShapeId {
	return id as unknown as TLShapeId
}

function shapeIdFromString(id: string): TLShapeId {
	return id as unknown as TLShapeId
}

function existingShape(id: string, x: number, y: number): TLShape {
	return {
		id: shapeIdFromString(id),
		type: 'geo',
		x,
		y,
		props: { geo: 'rectangle', w: 160, h: 80 },
	} as unknown as TLShape
}

async function testPushToTalkStateTransitions() {
	let state: VoiceState = 'idle'
	const events: string[] = []
	const controller = createPushToTalkController({
		getState: () => state,
		onStart: () => {
			state = 'listening'
			events.push('start')
		},
		onStop: () => {
			state = 'idle'
			events.push('stop')
		},
	})

	assert.equal(controller.state, 'idle')
	await controller.start()
	assert.equal(controller.state, 'listening')
	await controller.toggle()
	assert.equal(controller.state, 'idle')
	await controller.toggle()
	assert.equal(controller.state, 'listening')
	await controller.stop()
	assert.equal(controller.state, 'idle')
	assert.deepEqual(events, ['start', 'stop', 'start', 'stop'])
}

async function testMockRealtimeTextPath() {
	const states: VoiceState[] = []
	const transcripts: string[] = []
	const manager = new MockVoiceSessionManager({
		onStateChange: (state) => states.push(state),
		onTranscript: (text, role) => transcripts.push(`${role}:${text}`),
	})

	await manager.connect()
	assert.equal(manager.state, 'listening')
	await manager.sendText('Create frontend, API, and Postgres boxes')
	assert.equal(manager.state, 'listening')
	manager.disconnect()
	assert.equal(manager.state, 'idle')

	assert.deepEqual(states, ['listening', 'processing', 'responding', 'listening', 'idle'])
	assert.equal(transcripts[0], 'user:Create frontend, API, and Postgres boxes')
	assert.match(transcripts[1], /^assistant:Mock realtime session received your prompt/)
}

function testRealtimeToolDefinitions() {
	const names = realtimeTools.map((tool) => tool.name)
	assert.deepEqual(names, [
		'create_shapes',
		'update_shapes',
		'delete_shapes',
		'connect_shapes',
		'layout_shapes',
		'critique_canvas',
	])

	for (const tool of realtimeTools) {
		assert.equal(tool.type, 'function')
		assert.equal(tool.parameters.type, 'object')
		assert.equal(tool.parameters.additionalProperties, false)
	}
}

async function testActionBridgeEditorOperations() {
	const calls: string[] = []
	const editor = {
		createShapes: (shapes: TLCreateShapePartial[]) => calls.push(`create:${shapes.length}`),
		updateShapes: (shapes: TLShapePartial[]) => calls.push(`update:${shapes.length}`),
		deleteShapes: (shapeIds: TLShapeId[]) => calls.push(`delete:${shapeIds.length}`),
		createShape: (shape: TLCreateShapePartial) => calls.push(`createOne:${shape.type}`),
		createBindings: (bindings: unknown[]) => calls.push(`bindings:${bindings.length}`),
		run: (callback: () => void) => callback(),
		getShape: (shapeId: TLShapeId) => {
			if (shapeId === shapeIdFromString('shape:frontend')) return existingShape('shape:frontend', 0, 0)
			if (shapeId === shapeIdFromString('shape:api')) return existingShape('shape:api', 260, 0)
			if (shapeId === shapeIdFromString('shape:postgres')) return existingShape('shape:postgres', 520, 0)
			if (shapeId === shapeIdFromString('shape:old-api')) return existingShape('shape:old-api', 780, 0)
			return undefined
		},
		getSelectedShapeIds: () => [] as TLShapeId[],
		getCurrentPageShapes: () => [
			existingShape('shape:frontend', 0, 0),
			existingShape('shape:api', 260, 0),
			existingShape('shape:postgres', 520, 0),
		],
		getShapePageBounds: (shapeId: TLShapeId) => {
			const x =
				shapeId === shapeIdFromString('shape:frontend')
					? 0
					: shapeId === shapeIdFromString('shape:api')
						? 260
						: 520
			return {
				x,
				y: 0,
				w: 160,
				h: 80,
				center: { x: x + 80, y: 40 },
			}
		},
		packShapes: (shapeIds: TLShapeId[], gap?: number) =>
			calls.push(`pack:${shapeIds.length}:${gap ?? 'default'}`),
	}
	const bridge = createActionBridge({
		editor: editor as unknown as Parameters<typeof createActionBridge>[0]['editor'],
	})

	const createAction: CreateShapesAction = {
		type: 'create_shapes',
		shapes: [createShape('shape:cache'), createShape('shape:worker')],
	}
	const updateAction: UpdateShapesAction = {
		type: 'update_shapes',
		shapes: [updateShape('shape:api')],
	}
	const deleteAction: DeleteShapesAction = {
		type: 'delete_shapes',
		shapeIds: [shapeId('shape:old-api')],
	}
	const connectAction: ConnectShapesAction = {
		type: 'connect_shapes',
		shapeId: 'shape:frontend-api-arrow',
		arrowFromId: shapeId('shape:frontend'),
		arrowToId: shapeId('shape:api'),
		text: 'requests',
	}
	const packAction: LayoutShapesAction = {
		type: 'layout_shapes',
		shapeIds: [shapeId('shape:frontend'), shapeId('shape:api'), shapeId('shape:postgres')],
		operation: 'auto',
		gap: 32,
	}
	const topDownAction: LayoutShapesAction = {
		type: 'layout_shapes',
		shapeIds: [shapeId('shape:frontend'), shapeId('shape:api')],
		operation: 'top-down',
	}

	assert.deepEqual(await bridge.execute(createAction), {
		status: 'ok',
		message: 'Created 2 shapes.',
		shapeIds: [shapeIdFromString('shape:cache'), shapeIdFromString('shape:worker')],
	})
	assert.deepEqual(await bridge.execute(updateAction), {
		status: 'ok',
		message: 'Updated 1 shape.',
		shapeIds: [shapeIdFromString('shape:api')],
	})
	assert.deepEqual(await bridge.execute(deleteAction), {
		status: 'ok',
		message: 'Deleted 1 shape.',
		shapeIds: [shapeIdFromString('shape:old-api')],
	})
	assert.deepEqual(await bridge.execute(connectAction), {
		status: 'ok',
		message: 'Connected shapes with an arrow.',
		shapeIds: [shapeIdFromString('shape:frontend-api-arrow')],
	})
	assert.deepEqual(await bridge.execute(packAction), {
		status: 'ok',
		message: 'Applied auto layout to 3 shapes.',
		shapeIds: [
			shapeIdFromString('shape:frontend'),
			shapeIdFromString('shape:api'),
			shapeIdFromString('shape:postgres'),
		],
	})
	assert.deepEqual(await bridge.execute(topDownAction), {
		status: 'ok',
		message: 'Applied top-down layout to 2 shapes.',
		shapeIds: [shapeIdFromString('shape:frontend'), shapeIdFromString('shape:api')],
	})
	assert.deepEqual(await bridge.execute({ type: 'critique_canvas', focus: 'canvas' }), {
		status: 'ok',
		message: 'Canvas critique is stubbed for the bootstrap scaffold.',
		shapeIds: undefined,
	})
	assert.deepEqual(calls, [
		'create:2',
		'update:1',
		'delete:1',
		'createOne:arrow',
		'bindings:2',
		'pack:3:32',
		'update:2',
	])
}

function testGoldenPathChecklistCoverage() {
	assert.equal(goldenPaths.length, 11)
	assert.equal(goldenPaths.filter((path) => path.status === 'planned').length, 6)
	assert.equal(goldenPaths.filter((path) => path.status === 'partial').length, 4)
	assert.equal(goldenPaths.filter((path) => path.status === 'manual').length, 1)
	assert.ok(
		goldenPaths.every((path) => path.id.length > 0 && path.description.length > 0),
		'every golden path must have a stable id and description'
	)
}

const tests: TestCase[] = [
	{
		name: 'push-to-talk exposes deterministic state transitions',
		run: testPushToTalkStateTransitions,
	},
	{
		name: 'mock Realtime text path records transcript and state events',
		run: testMockRealtimeTextPath,
	},
	{
		name: 'Realtime tool definitions cover available voice actions',
		run: testRealtimeToolDefinitions,
	},
	{
		name: 'action bridge maps tool actions onto editor operations',
		run: testActionBridgeEditorOperations,
	},
	{
		name: 'golden path checklist tracks automated, planned, and manual coverage',
		run: testGoldenPathChecklistCoverage,
	},
]

for (const test of tests) {
	await test.run()
	console.log(`PASS ${test.name}`)
}

console.log(`VoiceBoard QA harness passed ${tests.length} deterministic checks.`)
process.exit(0)
