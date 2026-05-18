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
