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
	onContextRequest?: () => Promise<void> | void
	button?: HTMLElement | null
	target?: Document
}

const interactiveChatSelector = [
	'[contenteditable="true"]',
	'[data-chat-input]',
	'[role="textbox"]',
	'[aria-label*="chat" i]',
	'[name*="chat" i]',
	'[id*="chat" i]',
].join(', ')

export function createPushToTalkController({
	getState,
	onStart,
	onStop,
	onContextRequest,
	button,
	target = typeof document === 'undefined' ? undefined : document,
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
		if (isPressed) return
		isPressed = true
		try {
			await onContextRequest?.()
			await onStart()
		} catch (error) {
			isPressed = false
			throw error
		}
	}

	const release = async () => {
		if (!isPressed) return
		isPressed = false
		await onStop()
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

	target?.addEventListener('keydown', handleKeyDown)
	target?.addEventListener('keyup', handleKeyUp)
	target?.addEventListener('visibilitychange', handleAutoRelease)
	if (typeof window !== 'undefined') window.addEventListener('blur', handleAutoRelease)
	button?.addEventListener('pointerdown', handlePointerDown)
	button?.addEventListener('pointerup', handlePointerUp)
	button?.addEventListener('pointercancel', handlePointerUp)
	button?.addEventListener('pointerleave', handlePointerUp)

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
				await release()
			}
		},
		destroy() {
			target?.removeEventListener('keydown', handleKeyDown)
			target?.removeEventListener('keyup', handleKeyUp)
			target?.removeEventListener('visibilitychange', handleAutoRelease)
			if (typeof window !== 'undefined') window.removeEventListener('blur', handleAutoRelease)
			button?.removeEventListener('pointerdown', handlePointerDown)
			button?.removeEventListener('pointerup', handlePointerUp)
			button?.removeEventListener('pointercancel', handlePointerUp)
			button?.removeEventListener('pointerleave', handlePointerUp)
			void release()
		},
	}
}
