import type { VoiceState } from './types'

export interface PushToTalkController {
	state: VoiceState
	start(): Promise<void>
	stop(): Promise<void>
	toggle(): Promise<void>
}

export interface PushToTalkControllerOptions {
	getState: () => VoiceState
	onStart: () => Promise<void> | void
	onStop: () => Promise<void> | void
}

export function createPushToTalkController({
	getState,
	onStart,
	onStop,
}: PushToTalkControllerOptions): PushToTalkController {
	return {
		get state() {
			return getState()
		},
		async start() {
			await onStart()
		},
		async stop() {
			await onStop()
		},
		async toggle() {
			if (getState() === 'idle') {
				await onStart()
			} else {
				await onStop()
			}
		},
	}
}
