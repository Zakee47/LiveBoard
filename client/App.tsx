import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	DefaultSizeStyle,
	Editor,
	ErrorBoundary,
	TLComponents,
	Tldraw,
	TldrawUiToastsProvider,
	TLUiOverrides,
	createShapeId,
	toRichText,
} from 'tldraw'
import { TldrawAgentApp } from './agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	TldrawAgentAppProvider,
} from './agent/TldrawAgentAppProvider'
import { ChatPanel } from './components/ChatPanel'
import { ChatPanelFallback } from './components/ChatPanelFallback'
import { CustomHelperButtons } from './components/CustomHelperButtons'
import { AgentViewportBoundsHighlights } from './components/highlights/AgentViewportBoundsHighlights'
import { AllContextHighlights } from './components/highlights/ContextHighlights'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { TargetShapeTool } from './tools/TargetShapeTool'
import { createActionBridge } from '../src/voice/ActionBridge'
import { createCanvasContextProvider } from '../src/voice/CanvasContextProvider'
import { createPushToTalkController } from '../src/voice/PushToTalkController'
import { createVoiceSessionManager } from '../src/voice/VoiceSessionManager'
import type { TranscriptEntry, VoiceState } from '../src/voice/types'

// Customize tldraw's styles to play to the agent's strengths
DefaultSizeStyle.setDefaultValue('s')

// Custom tools for picking context items
const tools = [TargetShapeTool, TargetAreaTool]
const overrides: TLUiOverrides = {
	tools: (editor, tools) => {
		return {
			...tools,
			'target-area': {
				id: 'target-area',
				label: 'Pick Area',
				kbd: 'c',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-area')
				},
			},
			'target-shape': {
				id: 'target-shape',
				label: 'Pick Shape',
				kbd: 's',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-shape')
				},
			},
		}
	},
}

function App() {
	const [app, setApp] = useState<TldrawAgentApp | null>(null)
	const [editor, setEditor] = useState<Editor | null>(null)
	const [voiceState, setVoiceState] = useState<VoiceState>('idle')
	const [audioLevel, setAudioLevel] = useState(0)
	const [isTranscriptOpen, setIsTranscriptOpen] = useState(false)
	const [transcript, setTranscript] = useState<TranscriptEntry[]>([
		{
			id: 'system-welcome',
			role: 'system',
			text: 'VoiceBoard scaffold is running with mocked realtime voice behavior.',
			createdAt: Date.now(),
			isFinal: true,
		},
	])
	const addTranscriptEntry = useCallback(
		(entry: Omit<TranscriptEntry, 'id' | 'createdAt' | 'isFinal'> & Partial<TranscriptEntry>) => {
			setTranscript((entries) => [
				...entries,
				{
					id: entry.id ?? crypto.randomUUID(),
					role: entry.role,
					text: entry.text,
					createdAt: entry.createdAt ?? Date.now(),
					isFinal: entry.isFinal ?? true,
				},
			])
		},
		[]
	)
	const sessionRef = useRef(
		createVoiceSessionManager({
			onStateChange: setVoiceState,
			onTranscript: (text, role) => {
				addTranscriptEntry({ role, text })
			},
		})
	)

	const handleUnmount = useCallback(() => {
		setApp(null)
		setEditor(null)
	}, [])

	const handleEditorMount = useCallback((mountedEditor: Editor) => {
		setEditor(mountedEditor)
	}, [])

	useEffect(() => {
		if (voiceState === 'idle') {
			setAudioLevel(0)
			return
		}

		let frameId = 0
		const startedAt = performance.now()
		const updateLevel = () => {
			const elapsed = (performance.now() - startedAt) / 1000
			const baseLevel =
				voiceState === 'listening' ? 0.58 : voiceState === 'responding' ? 0.42 : 0.28
			const wave = Math.sin(elapsed * 9) * 0.18 + Math.sin(elapsed * 15) * 0.08
			setAudioLevel(Math.max(0.08, Math.min(1, baseLevel + wave)))
			frameId = window.requestAnimationFrame(updateLevel)
		}
		updateLevel()

		return () => window.cancelAnimationFrame(frameId)
	}, [voiceState])

	const voiceController = useMemo(
		() =>
			createPushToTalkController({
				getState: () => sessionRef.current.state,
				onContextRequest: async () => {
					if (!editor) return
					const contextProvider = createCanvasContextProvider({ editor })
					try {
						await contextProvider.sendContext('ptt_start')
					} finally {
						contextProvider.dispose()
					}
				},
				onStart: async () => {
					await sessionRef.current.startListening()
				},
				onStop: async () => {
					await sessionRef.current.release()
				},
			}),
		[editor]
	)

	const handleVoiceHoldStart = useCallback(async () => {
		if (sessionRef.current.state === 'idle') {
			await voiceController.start()
		}
	}, [voiceController])

	const handleVoiceHoldEnd = useCallback(async () => {
		if (sessionRef.current.state === 'listening') {
			await voiceController.stop()
		}
	}, [voiceController])

	const handleMockPrompt = useCallback(async () => {
		if (voiceState === 'idle') {
			await sessionRef.current.connect()
		}

		if (editor) {
			const contextProvider = createCanvasContextProvider({ editor })
			try {
				const actionBridge = createActionBridge({ editor, canvasContext: contextProvider })
				const snapshot = await contextProvider.getSnapshot()
				const result = await actionBridge.execute({
				type: 'create_shapes',
				shapes: [
					{
						id: createShapeId(),
						type: 'geo',
						x: snapshot.viewportBounds.x + 96,
						y: snapshot.viewportBounds.y + 96,
						props: {
							geo: 'rectangle',
							w: 220,
							h: 96,
							richText: toRichText('Mock voice action'),
						},
					},
					{
						id: createShapeId(),
						type: 'geo',
						x: snapshot.viewportBounds.x + 348,
						y: snapshot.viewportBounds.y + 96,
						props: {
							geo: 'ellipse',
							w: 144,
							h: 96,
							richText: toRichText('Idea'),
						},
					},
					{
						id: createShapeId(),
						type: 'note',
						x: snapshot.viewportBounds.x + 96,
						y: snapshot.viewportBounds.y + 232,
						props: {
							richText: toRichText('Voice note'),
						},
					},
				],
				})
				addTranscriptEntry({
					role: 'system',
					text: compactFunctionSummary(result.message),
					kind: 'function',
				})
			} finally {
				contextProvider.dispose()
			}
		}

		await sessionRef.current.sendText('Create a simple sticky-note idea on the board.')
	}, [addTranscriptEntry, editor, voiceState])

	const handleMockCritique = useCallback(async () => {
		if (!editor) return

		const contextProvider = createCanvasContextProvider({ editor })
		try {
			const actionBridge = createActionBridge({ editor, canvasContext: contextProvider })
			const result = await actionBridge.execute({ type: 'critique_canvas', focus: 'viewport' })
			addTranscriptEntry({
				role: 'assistant',
				text: `Critique: ${result.message}`,
			})
		} finally {
			contextProvider.dispose()
		}
	}, [addTranscriptEntry, editor])

	// Custom components to visualize what the agent is doing
	// These use TldrawAgentAppContextProvider to access the app/agent
	const components: TLComponents = useMemo(() => {
		return {
			HelperButtons: () =>
				app && (
					<TldrawAgentAppContextProvider app={app}>
						<CustomHelperButtons />
					</TldrawAgentAppContextProvider>
				),
			OnTheCanvas: () =>
				app ? (
					<TldrawAgentAppContextProvider app={app}>
						<AgentViewportBoundsHighlights />
						<AllContextHighlights />
					</TldrawAgentAppContextProvider>
				) : null,
		}
	}, [app])

	return (
		<TldrawUiToastsProvider>
			<div className="tldraw-agent-container">
				<div className="tldraw-canvas">
					<Tldraw
						persistenceKey="tldraw-agent-demo"
						tools={tools}
						overrides={overrides}
						components={components}
						onMount={handleEditorMount}
					>
						<TldrawAgentAppProvider onMount={setApp} onUnmount={handleUnmount} />
					</Tldraw>
					<BrowserCompatibilityWarning />
					<VoiceButton
						state={voiceState}
						onHoldEnd={handleVoiceHoldEnd}
						onHoldStart={handleVoiceHoldStart}
					/>
				</div>
				<aside className="voiceboard-sidebar">
					<header className="voiceboard-sidebar-header">
						<div>
							<p className="voiceboard-kicker">VoiceBoard MVP</p>
							<h1>Canvas copilot</h1>
						</div>
						<StateIndicator state={voiceState} />
					</header>
					<VoiceActivityIndicator level={audioLevel} state={voiceState} />
					<TranscriptPanel
						entries={transcript}
						isOpen={isTranscriptOpen}
						onMockCritique={handleMockCritique}
						onMockPrompt={handleMockPrompt}
						onToggle={() => setIsTranscriptOpen((isOpen) => !isOpen)}
					/>
					<MockStateControls
						onSelectState={(state) => {
							setVoiceState(state)
							sessionRef.current.state = state
						}}
						state={voiceState}
					/>
					<div className="text-fallback-header">
						<div>
							<h2>Text fallback</h2>
							<p>Use the Agent Kit chat for prompts and critique output.</p>
						</div>
					</div>
					<ErrorBoundary fallback={ChatPanelFallback}>
						{app && (
							<TldrawAgentAppContextProvider app={app}>
								<ChatPanel />
							</TldrawAgentAppContextProvider>
						)}
					</ErrorBoundary>
				</aside>
			</div>
		</TldrawUiToastsProvider>
	)
}

function VoiceButton({
	state,
	onHoldEnd,
	onHoldStart,
}: {
	state: VoiceState
	onHoldEnd: () => Promise<void>
	onHoldStart: () => Promise<void>
}) {
	return (
		<button
			aria-label="Hold to talk"
			className={`voice-button voice-button-${state}`}
			type="button"
			onPointerCancel={onHoldEnd}
			onPointerDown={onHoldStart}
			onPointerUp={onHoldEnd}
		>
			<span className="voice-button-dot" />
			<span>{voiceButtonLabel[state]}</span>
		</button>
	)
}

function VoiceActivityIndicator({ level, state }: { level: number; state: VoiceState }) {
	const style = { '--voice-level': level.toFixed(2) } as CSSProperties

	return (
		<section className="voice-activity" aria-label="Voice activity">
			<div className={`voice-activity-ring voice-activity-ring-${state}`} style={style}>
				<span />
			</div>
			<div>
				<strong>Voice activity</strong>
				<p>{activityCopy[state]}</p>
			</div>
		</section>
	)
}

function TranscriptPanel({
	entries,
	isOpen,
	onMockCritique,
	onMockPrompt,
	onToggle,
}: {
	entries: TranscriptEntry[]
	isOpen: boolean
	onMockCritique: () => void
	onMockPrompt: () => void
	onToggle: () => void
}) {
	const latestEntry = entries[entries.length - 1]

	return (
		<section
			aria-label="Transcript"
			className={`transcript-panel ${isOpen ? 'transcript-panel-open' : 'transcript-panel-collapsed'}`}
		>
			<div className="transcript-panel-header">
				<div>
					<h2>Transcript</h2>
					<p>{isOpen ? `${entries.length} entries` : latestEntry.text}</p>
				</div>
				<button type="button" onClick={onToggle}>
					{isOpen ? 'Collapse' : 'Open'}
				</button>
			</div>
			{isOpen && (
				<>
					<div className="transcript-entries">
						{entries.map((entry) => (
							<article
								className={`transcript-entry transcript-entry-${entry.role}`}
								key={entry.id}
							>
								<div className="transcript-entry-meta">
									<span>{speakerLabel(entry)}</span>
									<time dateTime={new Date(entry.createdAt).toISOString()}>
										{formatTranscriptTime(entry.createdAt)}
									</time>
								</div>
								<p>{entry.text}</p>
							</article>
						))}
					</div>
					<div className="mock-actions">
						<button type="button" onClick={onMockPrompt}>
							Mock: create 3 shapes
						</button>
						<button type="button" onClick={onMockCritique}>
							Mock critique
						</button>
					</div>
				</>
			)}
		</section>
	)
}

function StateIndicator({ state }: { state: VoiceState }) {
	return <span className={`state-indicator state-indicator-${state}`}>{stateLabel[state]}</span>
}

function MockStateControls({
	onSelectState,
	state,
}: {
	onSelectState: (state: VoiceState) => void
	state: VoiceState
}) {
	return (
		<section className="mock-state-controls" aria-label="Mock voice state controls">
			<p>Mock voice states</p>
			<div>
				{voiceStates.map((voiceState) => (
					<button
						className={state === voiceState ? 'mock-state-active' : ''}
						key={voiceState}
						type="button"
						onClick={() => onSelectState(voiceState)}
					>
						{stateLabel[voiceState]}
					</button>
				))}
			</div>
		</section>
	)
}

function BrowserCompatibilityWarning() {
	const [shouldWarn, setShouldWarn] = useState(false)

	useEffect(() => {
		const userAgent = window.navigator.userAgent
		const isChrome = userAgent.includes('Chrome') || userAgent.includes('Chromium')
		const isEdge = userAgent.includes('Edg/')
		setShouldWarn(!isChrome || isEdge)
	}, [])

	if (!shouldWarn) return null

	return (
		<div className="browser-warning" role="status">
			VoiceBoard voice capture is optimized for desktop Chrome.
		</div>
	)
}

function speakerLabel(entry: TranscriptEntry) {
	if (entry.role === 'user') return 'You'
	if (entry.role === 'assistant') return 'Agent'
	return 'VoiceBoard'
}

function formatTranscriptTime(createdAt: number) {
	return new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
	}).format(createdAt)
}

function compactFunctionSummary(result: string) {
	return result.endsWith('.') ? result.slice(0, -1) : result
}

const voiceStates: VoiceState[] = ['idle', 'listening', 'processing', 'responding']

const stateLabel: Record<VoiceState, string> = {
	idle: 'Ready',
	listening: 'Listening',
	processing: 'Thinking',
	responding: 'Speaking',
}

const voiceButtonLabel: Record<VoiceState, string> = {
	idle: 'Hold to talk',
	listening: 'Release to send',
	processing: 'Thinking…',
	responding: 'Speaking…',
}

const activityCopy: Record<VoiceState, string> = {
	idle: 'Ready for push-to-talk.',
	listening: 'Listening through the local voice session.',
	processing: 'Thinking through transcript and canvas context.',
	responding: 'Speaking with mocked realtime output.',
}

export default App
