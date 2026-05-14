import assert from 'node:assert/strict'
import test from 'node:test'
import type { VoiceState } from './types'
import { createPushToTalkController } from './PushToTalkController'

test('toggle requests context before starting from idle', async () => {
	const calls: string[] = []
	let state: VoiceState = 'idle'
	const controller = createPushToTalkController({
		getState: () => state,
		onContextRequest: () => {
			calls.push('context')
		},
		onStart: () => {
			calls.push('start')
			state = 'listening'
		},
		onStop: () => {
			calls.push('stop')
			state = 'idle'
		},
	})

	await controller.toggle()

	assert.deepEqual(calls, ['context', 'start'])
})

test('toggle does not request context when stopping', async () => {
	const calls: string[] = []
	let state: VoiceState = 'listening'
	const controller = createPushToTalkController({
		getState: () => state,
		onContextRequest: () => {
			calls.push('context')
		},
		onStart: () => {
			calls.push('start')
			state = 'listening'
		},
		onStop: () => {
			calls.push('stop')
			state = 'idle'
		},
	})

	await controller.toggle()

	assert.deepEqual(calls, ['stop'])
})


test('start does not begin listening outside idle state', async () => {
	const calls: string[] = []
	let state: VoiceState = 'processing'
	const controller = createPushToTalkController({
		getState: () => state,
		onContextRequest: () => {
			calls.push('context')
		},
		onStart: () => {
			calls.push('start')
			state = 'listening'
		},
		onStop: () => {
			calls.push('stop')
			state = 'idle'
		},
	})

	await controller.start()

	assert.deepEqual(calls, [])
	assert.equal(state, 'processing')
})

test('release during context request prevents late start', async () => {
	const calls: string[] = []
	let state: VoiceState = 'idle'
	let resolveContext: (() => void) | undefined
	const contextRequest = new Promise<void>((resolve) => {
		resolveContext = resolve
	})
	const controller = createPushToTalkController({
		getState: () => state,
		onContextRequest: async () => {
			calls.push('context')
			await contextRequest
		},
		onStart: () => {
			calls.push('start')
			state = 'listening'
		},
		onStop: () => {
			calls.push('stop')
			state = 'idle'
		},
	})

	const start = controller.start()
	await Promise.resolve()
	await controller.stop()
	resolveContext?.()
	await start

	assert.deepEqual(calls, ['context', 'stop'])
	assert.equal(state, 'idle')
})

test('release during start request stops after late start completes', async () => {
	const calls: string[] = []
	let state: VoiceState = 'idle'
	let resolveStart: (() => void) | undefined
	const startRequest = new Promise<void>((resolve) => {
		resolveStart = resolve
	})
	const controller = createPushToTalkController({
		getState: () => state,
		onStart: async () => {
			calls.push('start')
			await startRequest
			state = 'listening'
		},
		onStop: () => {
			calls.push('stop')
			state = 'idle'
		},
	})

	const start = controller.start()
	await Promise.resolve()
	await controller.stop()
	resolveStart?.()
	await start

	assert.deepEqual(calls, ['start', 'stop', 'stop'])
	assert.equal(state, 'idle')
})
