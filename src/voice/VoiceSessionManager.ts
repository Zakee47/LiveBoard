import { realtimeTools } from './tools'
import type {
	VoiceSessionConfig,
	VoiceState,
	VoiceToolAction,
	VoiceToolResult,
} from './types'

export interface VoiceSessionManager {
	state: VoiceState
	connect(): Promise<void>
	disconnect(): void
	startListening(): Promise<void>
	release(): Promise<void>
	sendText(text: string): Promise<void>
	sendToolResult(action: VoiceToolAction, result: VoiceToolResult): void
}

export interface VoiceSessionManagerOptions {
	config?: Partial<VoiceSessionConfig>
	onStateChange?: (state: VoiceState) => void
	onTranscript?: (text: string, role: 'user' | 'assistant') => void
	onToolAction?: (action: VoiceToolAction) => void
	onError?: (error: Error) => void
}

const defaultConfig: VoiceSessionConfig = {
	tokenEndpoint: '/api/realtime-token',
	model: 'gpt-realtime',
	voice: 'alloy',
}

type RealtimeDataChannelEvent = {
	type?: string
	transcript?: string
	name?: string
	arguments?: string
	call_id?: string
	item?: {
		type?: string
		name?: string
		arguments?: string
		call_id?: string
	}
	response?: {
		output?: Array<{
			type?: string
			name?: string
			arguments?: string
			call_id?: string
		}>
	}
}

type RealtimeTokenResponse = {
	value?: string
	client_secret?: {
		value?: string
	}
	mock?: boolean
	error?: string
}

const realtimeUrl = 'https://api.openai.com/v1/realtime/calls'
const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration))

function createError(message: string) {
	return new Error(message)
}

function parseVoiceToolAction(name: string | undefined, args: string | undefined): VoiceToolAction | null {
	if (!name || !args) return null

	let parsed: unknown
	try {
		parsed = JSON.parse(args)
	} catch {
		return null
	}

	if (!parsed || typeof parsed !== 'object') return null
	const body = parsed as Record<string, unknown>

	switch (name) {
		case 'create_shapes':
			if (!Array.isArray(body.shapes)) return null
			return { type: 'create_shapes', shapes: body.shapes as Extract<VoiceToolAction, { type: 'create_shapes' }>['shapes'] }
		case 'update_shapes':
			if (!Array.isArray(body.shapes)) return null
			return { type: 'update_shapes', shapes: body.shapes as Extract<VoiceToolAction, { type: 'update_shapes' }>['shapes'] }
		case 'delete_shapes':
			return {
				type: 'delete_shapes',
				shapeIds: Array.isArray(body.shapeIds)
					? (body.shapeIds as Extract<VoiceToolAction, { type: 'delete_shapes' }>['shapeIds'])
					: undefined,
				names: Array.isArray(body.names)
					? (body.names.filter((name) => typeof name === 'string') as string[])
					: undefined,
				target: body.target === 'selected' ? 'selected' : undefined,
			}
		case 'connect_shapes':
			return {
				type: 'connect_shapes',
				shapeId: typeof body.shapeId === 'string' ? body.shapeId : undefined,
				arrowFromId: typeof body.arrowFromId === 'string' ? (body.arrowFromId as Extract<VoiceToolAction, { type: 'connect_shapes' }>['arrowFromId']) : undefined,
				arrowToId: typeof body.arrowToId === 'string' ? (body.arrowToId as Extract<VoiceToolAction, { type: 'connect_shapes' }>['arrowToId']) : undefined,
				arrowFromName: typeof body.arrowFromName === 'string' ? body.arrowFromName : undefined,
				arrowToName: typeof body.arrowToName === 'string' ? body.arrowToName : undefined,
				text: typeof body.text === 'string' ? body.text : undefined,
				color: typeof body.color === 'string' ? (body.color as Extract<VoiceToolAction, { type: 'connect_shapes' }>['color']) : undefined,
			}
		case 'layout_shapes':
			if (typeof body.operation !== 'string') return null
			return {
				type: 'layout_shapes',
				shapeIds: Array.isArray(body.shapeIds)
					? (body.shapeIds as Extract<VoiceToolAction, { type: 'layout_shapes' }>['shapeIds'])
					: undefined,
				names: Array.isArray(body.names)
					? (body.names.filter((name) => typeof name === 'string') as string[])
					: undefined,
				scope: body.scope === 'selected' || body.scope === 'all' ? body.scope : undefined,
				operation: body.operation as Extract<VoiceToolAction, { type: 'layout_shapes' }>['operation'],
				gap: typeof body.gap === 'number' ? body.gap : undefined,
			}
		case 'critique_canvas':
			return {
				type: 'critique_canvas',
				focus:
					typeof body.focus === 'string'
						? (body.focus as Extract<VoiceToolAction, { type: 'critique_canvas' }>['focus'])
						: undefined,
			}
		default:
			return null
	}
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
		this.setState('idle')
	}

	disconnect() {
		this.setState('idle')
	}

	async startListening() {
		this.setState('listening')
	}

	async release() {
		if (this.state !== 'listening') return
		this.setState('processing')
		await Promise.resolve()
		this.options.onTranscript?.('Mock voice input committed. Connect OPENAI_API_KEY to test live audio.', 'user')
		this.setState('responding')
		this.options.onTranscript?.(
			'Mock realtime session is active because /api/realtime-token did not return an OpenAI ephemeral key.',
			'assistant'
		)
		this.setState('idle')
	}

	async sendText(text: string) {
		this.options.onTranscript?.(text, 'user')
		this.setState('processing')
		await wait(650)
		this.setState('responding')
		this.options.onTranscript?.(
			'Mock realtime session received your prompt. WebRTC integration will replace this stub.',
			'assistant'
		)
		await wait(850)
		this.setState('idle')
	}

	sendToolResult(_action: VoiceToolAction, result: VoiceToolResult) {
		this.options.onTranscript?.(result.message, 'assistant')
	}

	private setState(state: VoiceState) {
		this.state = state
		this.options.onStateChange?.(state)
	}
}

export class RealtimeVoiceSessionManager implements VoiceSessionManager {
	state: VoiceState = 'idle'
	readonly config: VoiceSessionConfig
	private readonly options: VoiceSessionManagerOptions
	private peerConnection: RTCPeerConnection | null = null
	private dataChannel: RTCDataChannel | null = null
	private mediaStream: MediaStream | null = null
	private microphoneTrack: MediaStreamTrack | null = null
	private audioElement: HTMLAudioElement | null = null
	private connecting: Promise<void> | null = null
	private readonly pendingToolCallIds = new WeakMap<VoiceToolAction, string>()
	private isMockMode = false

	constructor(options: VoiceSessionManagerOptions = {}) {
		this.options = options
		this.config = { ...defaultConfig, ...options.config }
	}

	async connect() {
		if (this.peerConnection || this.isMockMode) return
		if (this.connecting) return this.connecting
		this.connecting = this.connectRealtime()
		try {
			await this.connecting
		} finally {
			this.connecting = null
		}
	}

	disconnect() {
		this.dataChannel?.close()
		this.peerConnection?.close()
		this.mediaStream?.getTracks().forEach((track) => track.stop())
		this.audioElement?.remove()
		this.dataChannel = null
		this.peerConnection = null
		this.mediaStream = null
		this.microphoneTrack = null
		this.audioElement = null
		this.isMockMode = false
		this.setState('idle')
	}

	async startListening() {
		await this.connect()
		if (this.isMockMode) {
			this.setState('listening')
			return
		}
		if (!this.microphoneTrack) throw createError('Realtime microphone track is unavailable.')
		this.microphoneTrack.enabled = true
		this.setState('listening')
	}

	async release() {
		if (this.state !== 'listening') return

		if (this.isMockMode) {
			this.setState('processing')
			await Promise.resolve()
			this.options.onTranscript?.('Mock voice input committed. Connect OPENAI_API_KEY to test live audio.', 'user')
			this.setState('responding')
			this.options.onTranscript?.(
				'Mock realtime session is active because /api/realtime-token did not return an OpenAI ephemeral key.',
				'assistant'
			)
			this.setState('idle')
			return
		}

		this.microphoneTrack?.enabled && (this.microphoneTrack.enabled = false)
		this.sendRealtimeEvent({ type: 'input_audio_buffer.commit' })
		this.sendRealtimeEvent({ type: 'response.create' })
		this.setState('processing')
	}

	async sendText(text: string) {
		await this.connect()
		this.options.onTranscript?.(text, 'user')

		if (this.isMockMode) {
			this.setState('processing')
			await Promise.resolve()
			this.setState('responding')
			this.options.onTranscript?.(
				'Mock realtime session received your prompt. Set OPENAI_API_KEY and verify /api/realtime-token for a live test.',
				'assistant'
			)
			this.setState('idle')
			return
		}

		this.sendRealtimeEvent({
			type: 'conversation.item.create',
			item: {
				type: 'message',
				role: 'user',
				content: [{ type: 'input_text', text }],
			},
		})
		this.sendRealtimeEvent({ type: 'response.create' })
		this.setState('processing')
	}

	sendToolResult(action: VoiceToolAction, result: VoiceToolResult) {
		this.options.onTranscript?.(result.message, 'assistant')

		if (this.isMockMode) return

		const callId = this.pendingToolCallIds.get(action)
		this.sendRealtimeEvent({
			type: 'conversation.item.create',
			item: {
				type: 'function_call_output',
				...(callId ? { call_id: callId } : {}),
				output: JSON.stringify(result),
			},
		})
		this.sendRealtimeEvent({ type: 'response.create' })
		this.pendingToolCallIds.delete(action)
	}

	private async connectRealtime() {
		try {
			const token = await this.fetchEphemeralToken()
			if (!token) {
				this.isMockMode = true
				this.setState('idle')
				return
			}

			const peerConnection = new RTCPeerConnection()
			this.peerConnection = peerConnection

			this.audioElement = document.createElement('audio')
			this.audioElement.autoplay = true
			this.audioElement.hidden = true
			document.body.appendChild(this.audioElement)

			peerConnection.addEventListener('track', (event) => {
				if (this.audioElement) this.audioElement.srcObject = event.streams[0]
				this.setState('responding')
			})

			this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
			const [track] = this.mediaStream.getAudioTracks()
			if (!track) throw createError('No microphone audio track was available.')
			track.enabled = false
			this.microphoneTrack = track
			peerConnection.addTrack(track, this.mediaStream)

			this.dataChannel = peerConnection.createDataChannel('oai-events')
			this.dataChannel.addEventListener('open', () => {
				this.sendRealtimeEvent({
					type: 'session.update',
					session: {
						type: 'realtime',
						model: this.config.model,
						audio: {
							output: { voice: this.config.voice },
							input: {
								transcription: { model: 'gpt-4o-mini-transcribe' },
								turn_detection: null,
							},
						},
						tools: realtimeTools,
						tool_choice: 'auto',
					},
				})
			})
			this.dataChannel.addEventListener('message', (message) => this.handleDataChannelMessage(message))
			this.dataChannel.addEventListener('error', () => {
				this.options.onError?.(createError('OpenAI Realtime data channel failed.'))
			})

			const offer = await peerConnection.createOffer()
			await peerConnection.setLocalDescription(offer)

			if (!offer.sdp) throw createError('WebRTC offer did not include SDP.')

			const response = await fetch(realtimeUrl, {
				method: 'POST',
				body: offer.sdp,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/sdp',
				},
			})

			if (!response.ok) {
				throw createError(`OpenAI Realtime SDP exchange failed: ${response.status} ${response.statusText}`)
			}

			await peerConnection.setRemoteDescription({
				type: 'answer',
				sdp: await response.text(),
			})
			this.setState('idle')
		} catch (error) {
			this.disconnect()
			throw error
		}
	}

	private async fetchEphemeralToken() {
		try {
			const response = await fetch(this.config.tokenEndpoint)
			if (!response.ok) return null
			const data = (await response.json()) as RealtimeTokenResponse
			if (data.mock || data.error) return null
			return data.value ?? data.client_secret?.value ?? null
		} catch (error) {
			this.options.onError?.(error instanceof Error ? error : createError('Failed to fetch realtime token.'))
			return null
		}
	}

	private handleDataChannelMessage(message: MessageEvent<string>) {
		let event: RealtimeDataChannelEvent
		try {
			event = JSON.parse(message.data) as RealtimeDataChannelEvent
		} catch {
			return
		}

		switch (event.type) {
			case 'input_audio_transcription.completed':
				if (event.transcript) this.options.onTranscript?.(event.transcript, 'user')
				break
			case 'response.audio_transcript.done':
			case 'response.output_text.done':
				if (event.transcript) this.options.onTranscript?.(event.transcript, 'assistant')
				break
			case 'response.created':
			case 'response.output_item.added':
				this.setState('processing')
				break
			case 'response.function_call_arguments.done':
				this.handleToolCall(event.name, event.arguments, event.call_id)
				break
			case 'response.audio.delta':
			case 'response.audio_transcript.delta':
				this.setState('responding')
				break
			case 'response.done':
				this.setState('idle')
				break
		}
	}

	private handleToolCall(name: string | undefined, args: string | undefined, callId: string | undefined) {
		const action = parseVoiceToolAction(name, args)
		if (!action) return

		if (callId) this.pendingToolCallIds.set(action, callId)
		this.options.onToolAction?.(action)
	}

	private sendRealtimeEvent(event: unknown) {
		if (this.dataChannel?.readyState !== 'open') return
		this.dataChannel.send(JSON.stringify(event))
	}

	private setState(state: VoiceState) {
		this.state = state
		this.options.onStateChange?.(state)
	}
}

export function createVoiceSessionManager(options?: VoiceSessionManagerOptions): VoiceSessionManager {
	return new RealtimeVoiceSessionManager(options)
}
