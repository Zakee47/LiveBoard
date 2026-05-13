import type { TLCreateShapePartial, TLShapeId, TLShapePartial } from 'tldraw'
import { realtimeTools } from './tools'
import type {
	LayoutOperation,
	VoiceSessionConfig,
	VoiceState,
	VoiceToolAction,
	VoiceToolName,
} from './types'

export interface VoiceSessionManager {
	state: VoiceState
	connect(): Promise<void>
	disconnect(): void
	startListening(): Promise<void>
	release(): Promise<void>
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

	switch (name as VoiceToolName) {
		case 'create_shapes':
			if (!Array.isArray(body.shapes)) return null
			return { type: 'create_shapes', shapes: body.shapes as TLCreateShapePartial[] }
		case 'update_shapes':
			if (!Array.isArray(body.shapes)) return null
			return { type: 'update_shapes', shapes: body.shapes as TLShapePartial[] }
		case 'delete_shapes':
			if (!Array.isArray(body.shapeIds)) return null
			return { type: 'delete_shapes', shapeIds: body.shapeIds as TLShapeId[] }
		case 'layout_shapes':
			if (!Array.isArray(body.shapeIds) || typeof body.operation !== 'string') return null
			return {
				type: 'layout_shapes',
				shapeIds: body.shapeIds as TLShapeId[],
				operation: body.operation as LayoutOperation,
				axis: typeof body.axis === 'string' ? (body.axis as 'horizontal' | 'vertical') : undefined,
				alignment:
					typeof body.alignment === 'string'
						? (body.alignment as
								| 'top'
								| 'bottom'
								| 'left'
								| 'right'
								| 'center-horizontal'
								| 'center-vertical')
						: undefined,
				gap: typeof body.gap === 'number' ? body.gap : undefined,
			}
		case 'critique_canvas':
			return {
				type: 'critique_canvas',
				focus:
					typeof body.focus === 'string'
						? (body.focus as 'selection' | 'viewport' | 'canvas')
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

	sendToolResult(action: VoiceToolAction, result: string) {
		this.options.onTranscript?.(result, 'assistant')

		if (this.isMockMode) return

		const callId = this.pendingToolCallIds.get(action)
		this.sendRealtimeEvent({
			type: 'conversation.item.create',
			item: {
				type: 'function_call_output',
				...(callId ? { call_id: callId } : {}),
				output: result,
			},
		})
		this.sendRealtimeEvent({ type: 'response.create' })
		this.pendingToolCallIds.delete(action)
	}

	private async connectRealtime() {
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

		this.options.onToolAction?.(action)
		if (callId) this.pendingToolCallIds.set(action, callId)
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
