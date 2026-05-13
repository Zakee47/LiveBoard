import type { BoxModel, TLCreateShapePartial, TLShapeId, TLShapePartial } from 'tldraw'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'responding'

export type TranscriptEntryRole = 'user' | 'assistant' | 'system'

export interface TranscriptEntry {
	id: string
	role: TranscriptEntryRole
	text: string
	createdAt: number
	isFinal: boolean
}

export type VoiceToolName =
	| 'create_shapes'
	| 'update_shapes'
	| 'delete_shapes'
	| 'layout_shapes'
	| 'critique_canvas'

export interface CreateShapesAction {
	type: 'create_shapes'
	shapes: TLCreateShapePartial[]
}

export interface UpdateShapesAction {
	type: 'update_shapes'
	shapes: TLShapePartial[]
}

export interface DeleteShapesAction {
	type: 'delete_shapes'
	shapeIds: TLShapeId[]
}

export type LayoutOperation = 'align' | 'distribute' | 'pack'

export interface LayoutShapesAction {
	type: 'layout_shapes'
	shapeIds: TLShapeId[]
	operation: LayoutOperation
	axis?: 'horizontal' | 'vertical'
	alignment?: 'top' | 'bottom' | 'left' | 'right' | 'center-horizontal' | 'center-vertical'
	gap?: number
}

export interface CritiqueCanvasAction {
	type: 'critique_canvas'
	focus?: 'selection' | 'viewport' | 'canvas'
}

export type VoiceToolAction =
	| CreateShapesAction
	| UpdateShapesAction
	| DeleteShapesAction
	| LayoutShapesAction
	| CritiqueCanvasAction

export interface CompactCanvasShape {
	id: TLShapeId
	type: string
	text?: string
	bounds: BoxModel | null
	center: { x: number; y: number } | null
	parentId?: string
	meta?: {
		color?: string
		fill?: string
		geo?: string
		name?: string
	}
}

export interface SelectedCanvasShape extends CompactCanvasShape {
	x: number
	y: number
	rotation: number
	isLocked: boolean
	opacity: number
}

export interface CanvasClusterSummary {
	id: string
	position: 'above' | 'below' | 'left' | 'right' | 'above-left' | 'above-right' | 'below-left' | 'below-right'
	count: number
	shapeTypes: Record<string, number>
	bounds: BoxModel
	sampleShapeIds: TLShapeId[]
	sampleTexts: string[]
}

export interface CanvasSnapshot {
	selectedShapeIds: TLShapeId[]
	selectedShapes: SelectedCanvasShape[]
	visibleShapes: CompactCanvasShape[]
	viewportBounds: BoxModel
	selectionBounds: BoxModel | null
	clusters: CanvasClusterSummary[]
	totalShapeCount: number
	omittedShapeCount: number
	generatedAt: number
	screenshotBase64Png?: string
}

export interface CanvasContextUpdate {
	reason: 'initial' | 'action_batch' | 'ptt_start' | 'canvas_change' | 'manual'
	snapshot: CanvasSnapshot
}

export interface VoiceSessionConfig {
	tokenEndpoint: string
	model: string
	voice: string
}

export interface VoiceSessionEventMap {
	statechange: VoiceState
	transcript: TranscriptEntry
	toolaction: VoiceToolAction
	error: Error
}
