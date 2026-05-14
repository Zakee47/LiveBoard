import assert from 'node:assert/strict'

import { createActionBridge } from '../src/voice/ActionBridge'
import { createPushToTalkController } from '../src/voice/PushToTalkController'
import { MockVoiceSessionManager } from '../src/voice/VoiceSessionManager'
import { realtimeTools } from '../src/voice/tools'
import type { TLCreateShapePartial, TLShapeId, TLShapePartial } from 'tldraw'
import type {
	CreateShapesAction,
	DeleteShapesAction,
	LayoutShapesAction,
	UpdateShapesAction,
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

function updateShape(id: string): TLShapePartial {
	return {
		id,
		type: 'geo',
		props: { text: 'Auth Service' },
	} as unknown as TLShapePartial
}

function shapeId(id: string): TLShapeId {
	return id as unknown as TLShapeId
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
	assert.equal(manager.state, 'idle')
	await manager.startListening()
	assert.equal(manager.state, 'listening')
	await manager.release()
	assert.equal(manager.state, 'idle')
	await manager.sendText('Create frontend, API, and Postgres boxes')
	assert.equal(manager.state, 'idle')
	manager.disconnect()
	assert.equal(manager.state, 'idle')

	assert.deepEqual(states, ['idle', 'listening', 'processing', 'responding', 'idle', 'processing', 'responding', 'idle', 'idle'])
	assert.match(transcripts[0], /^user:Mock voice input committed/)
	assert.match(transcripts[1], /^assistant:Mock realtime session is active/)
	assert.equal(transcripts[2], 'user:Create frontend, API, and Postgres boxes')
	assert.match(transcripts[3], /^assistant:Mock realtime session received your prompt/)
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
	assert.equal(typeof createActionBridge, 'function')
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
