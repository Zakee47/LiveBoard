import type { VoiceSessionConfig, VoiceState, VoiceToolAction } from './types'

export interface VoiceSessionManager {
	state: VoiceState
	connect(): Promise<void>
	disconnect(): void
	sendText(text: string): Promise<void>
	sendToolResult(action: VoiceToolAction, result: string): void
}

export interface VoiceSessionManagerOptions {
	config?: Partial<VoiceSessionConfig>
	onStateChange?: (state: VoiceState) => void
	onTranscript?: (text: string, role: 'user' | 'assistant') => void
	onToolAction?: (action: VoiceToolAction) => void
	onError?: (error: Error) => void
}

const defaultConfig: VoiceSessionConfig = {
	tokenEndpoint: 'http://localhost:3001/api/realtime-token',
	model: 'gpt-realtime',
	voice: 'alloy',
}

export class MockVoiceSessionManager implements VoiceSessionManager {
	state: VoiceState = 'idle'
	readonly config: VoiceSessionConfig
	private readonly options: VoiceSessionManagerOptions

	constructor(options: VoiceSessionManagerOptions = {}) {
		this.options = options
		this.config = { ...defaultConfig, ...options.config }
	}

	async connect() {
		this.setState('listening')
	}

	disconnect() {
		this.setState('idle')
	}

	async sendText(text: string) {
		this.options.onTranscript?.(text, 'user')
		this.setState('processing')
		await Promise.resolve()
		this.setState('responding')
		this.options.onTranscript?.(
			'Mock realtime session received your prompt. WebRTC integration will replace this stub.',
			'assistant'
		)
		this.setState('listening')
	}

	sendToolResult(_action: VoiceToolAction, result: string) {
		this.options.onTranscript?.(result, 'assistant')
	}

	private setState(state: VoiceState) {
		this.state = state
		this.options.onStateChange?.(state)
	}
}

export function createVoiceSessionManager(options?: VoiceSessionManagerOptions): VoiceSessionManager {
	return new MockVoiceSessionManager(options)
}
