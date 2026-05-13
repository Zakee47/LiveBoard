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
	onContextRequest?: () => Promise<void> | void
}

export function createPushToTalkController({
	getState,
	onStart,
	onStop,
	onContextRequest,
}: PushToTalkControllerOptions): PushToTalkController {
	const start = async () => {
		await onContextRequest?.()
		await onStart()
	}
	const stop = async () => {
		await onStop()
	}
	return {
		get state() {
			return getState()
		},
		start,
		stop,
		async toggle() {
			if (getState() === 'idle') {
				await start()
			} else {
				await stop()
			}
		},
	}
}
