import type { VoiceState } from './types'

export interface PushToTalkController {
	state: VoiceState
	start(): Promise<void>
	stop(): Promise<void>
	toggle(): Promise<void>
	destroy(): void
}

export interface PushToTalkControllerOptions {
	getState: () => VoiceState
	onStart: () => Promise<void> | void
	onStop: () => Promise<void> | void
	button?: HTMLElement | null
	target?: Document
	onContextRequest?: () => Promise<void> | void
}

const interactiveChatSelector = [
	'[contenteditable="true"]',
	'[data-chat-input]',
	'[role="textbox"]',
	'[aria-label*="chat" i]',
	'[name*="chat" i]',
	'[id*="chat" i]',
].join(', ')

const targetCleanups = new WeakMap<Document, () => void>()
const buttonCleanups = new WeakMap<HTMLElement, () => void>()
const pushToTalkStartDepthKey = '__liveboardPushToTalkStartDepth'
const pushToTalkStopDepthKey = '__liveboardPushToTalkStopDepth'

function withPushToTalkContext<T>(key: string, callback: () => T): T {
	const globalState = globalThis as unknown as Record<string, number | undefined>
	globalState[key] = (globalState[key] ?? 0) + 1
	try {
		return callback()
	} finally {
		const nextDepth = (globalState[key] ?? 1) - 1
		if (nextDepth > 0) {
			globalState[key] = nextDepth
		} else {
			delete globalState[key]
		}
	}
}

export function createPushToTalkController({
	getState,
	onStart,
	onStop,
	button,
	target = typeof document === 'undefined' ? undefined : document,
	onContextRequest,
}: PushToTalkControllerOptions): PushToTalkController {
	let isPressed = false

	const shouldIgnoreKeyboardEvent = (event: KeyboardEvent) => {
		if (event.code !== 'Space' || event.repeat) return true
		const targetElement = event.target
		if (!(targetElement instanceof HTMLElement)) return false
		if (targetElement.isContentEditable) return true
		if (targetElement.closest(interactiveChatSelector)) return true
		return targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement
	}

	const press = async () => {
		if (isPressed && getState() === 'idle') isPressed = false
		if (isPressed) return
		isPressed = true
		try {
			await onContextRequest?.()
			await withPushToTalkContext(pushToTalkStartDepthKey, onStart)
		} catch (error) {
			isPressed = false
			throw error
		}
	}

	const release = async (force = false) => {
		if (!isPressed && !force) return
		isPressed = false
		await withPushToTalkContext(pushToTalkStopDepthKey, onStop)
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		if (shouldIgnoreKeyboardEvent(event)) return
		event.preventDefault()
		void press()
	}

	const handleKeyUp = (event: KeyboardEvent) => {
		if (event.code !== 'Space') return
		if (!isPressed) return
		event.preventDefault()
		void release()
	}

	const handlePointerDown = (event: PointerEvent) => {
		event.preventDefault()
		button?.setPointerCapture(event.pointerId)
		void press()
	}

	const handlePointerUp = (event: PointerEvent) => {
		event.preventDefault()
		if (button?.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId)
		void release()
	}

	const handleAutoRelease = () => {
		void release()
	}

	const removeTargetListeners = () => {
		target?.removeEventListener('keydown', handleKeyDown)
		target?.removeEventListener('keyup', handleKeyUp)
		target?.removeEventListener('visibilitychange', handleAutoRelease)
		if (typeof window !== 'undefined') window.removeEventListener('blur', handleAutoRelease)
	}
	const removeButtonListeners = () => {
		button?.removeEventListener('pointerdown', handlePointerDown)
		button?.removeEventListener('pointerup', handlePointerUp)
		button?.removeEventListener('pointercancel', handlePointerUp)
		button?.removeEventListener('pointerleave', handlePointerUp)
	}

	if (target) {
		targetCleanups.get(target)?.()
		target.addEventListener('keydown', handleKeyDown)
		target.addEventListener('keyup', handleKeyUp)
		target.addEventListener('visibilitychange', handleAutoRelease)
		if (typeof window !== 'undefined') window.addEventListener('blur', handleAutoRelease)
		targetCleanups.set(target, removeTargetListeners)
	}

	if (button) {
		buttonCleanups.get(button)?.()
		button.addEventListener('pointerdown', handlePointerDown)
		button.addEventListener('pointerup', handlePointerUp)
		button.addEventListener('pointercancel', handlePointerUp)
		button.addEventListener('pointerleave', handlePointerUp)
		buttonCleanups.set(button, removeButtonListeners)
	}

	return {
		get state() {
			return getState()
		},
		async start() {
			await press()
		},
		async stop() {
			await release()
		},
		async toggle() {
			if (getState() === 'idle') {
				await press()
			} else {
				await release(true)
			}
		},
		destroy() {
			removeTargetListeners()
			removeButtonListeners()
			if (target && targetCleanups.get(target) === removeTargetListeners) targetCleanups.delete(target)
			if (button && buttonCleanups.get(button) === removeButtonListeners) buttonCleanups.delete(button)
			void release()
		},
	}
}
