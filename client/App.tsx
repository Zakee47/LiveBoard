import { useCallback, useMemo, useRef, useState } from 'react'
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
	const [transcript, setTranscript] = useState<TranscriptEntry[]>([
		{
			id: 'system-welcome',
			role: 'system',
			text: 'VoiceBoard scaffold is running with mocked realtime voice behavior.',
			createdAt: Date.now(),
			isFinal: true,
		},
	])
	const sessionRef = useRef(
		createVoiceSessionManager({
			onStateChange: setVoiceState,
			onTranscript: (text, role) => {
				setTranscript((entries) => [
					...entries,
					{
						id: crypto.randomUUID(),
						role,
						text,
						createdAt: Date.now(),
						isFinal: true,
					},
				])
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

	const handleVoiceToggle = useCallback(async () => {
		const controller = createPushToTalkController({
			getState: () => sessionRef.current.state,
			onStart: async () => {
				await sessionRef.current.connect()
			},
			onStop: () => {
				sessionRef.current.disconnect()
			},
		})
		await controller.toggle()
	}, [])

	const handleMockPrompt = useCallback(async () => {
		if (voiceState === 'idle') {
			await sessionRef.current.connect()
		}

		if (editor) {
			const contextProvider = createCanvasContextProvider({ editor })
			const actionBridge = createActionBridge({ editor })
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
				],
			})
			sessionRef.current.sendToolResult({ type: 'critique_canvas', focus: 'viewport' }, result)
		}

		await sessionRef.current.sendText('Create a simple sticky-note idea on the board.')
	}, [editor, voiceState])

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
					<VoiceButton state={voiceState} onClick={handleVoiceToggle} />
				</div>
				<aside className="voiceboard-sidebar">
					<header className="voiceboard-sidebar-header">
						<div>
							<p className="voiceboard-kicker">VoiceBoard MVP</p>
							<h1>Canvas copilot</h1>
						</div>
						<StateIndicator state={voiceState} />
					</header>
					<VoiceActivityIndicator state={voiceState} />
					<TranscriptPanel entries={transcript} onMockPrompt={handleMockPrompt} />
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

function VoiceButton({ state, onClick }: { state: VoiceState; onClick: () => void }) {
	const isActive = state !== 'idle'
	return (
		<button
			className={`voice-button ${isActive ? 'voice-button-active' : ''}`}
			type="button"
			onClick={onClick}
		>
			<span className="voice-button-dot" />
			{isActive ? 'Stop voice' : 'Hold to talk'}
		</button>
	)
}

function VoiceActivityIndicator({ state }: { state: VoiceState }) {
	return (
		<section className="voice-activity" aria-label="Voice activity">
			<div className={`voice-activity-ring voice-activity-ring-${state}`} />
			<p>{activityCopy[state]}</p>
		</section>
	)
}

function TranscriptPanel({
	entries,
	onMockPrompt,
}: {
	entries: TranscriptEntry[]
	onMockPrompt: () => void
}) {
	return (
		<section className="transcript-panel" aria-label="Transcript">
			<div className="transcript-panel-header">
				<h2>Transcript</h2>
				<button type="button" onClick={onMockPrompt}>
					Run mock action
				</button>
			</div>
			<div className="transcript-entries">
				{entries.map((entry) => (
					<article className={`transcript-entry transcript-entry-${entry.role}`} key={entry.id}>
						<span>{entry.role}</span>
						<p>{entry.text}</p>
					</article>
				))}
			</div>
		</section>
	)
}

function StateIndicator({ state }: { state: VoiceState }) {
	return <span className={`state-indicator state-indicator-${state}`}>{state}</span>
}

const activityCopy: Record<VoiceState, string> = {
	idle: 'Ready for push-to-talk.',
	listening: 'Listening through mocked local session.',
	processing: 'Processing transcript and canvas context.',
	responding: 'Responding with mocked realtime output.',
}

export default App
