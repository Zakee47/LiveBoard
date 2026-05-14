import type {
	BoxModel,
	TLCreateShapePartial,
	TLDefaultColorStyle,
	TLGeoShapeGeoStyle,
	TLShapeId,
} from 'tldraw'

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
	| 'connect_shapes'
	| 'layout_shapes'
	| 'critique_canvas'

export type VoiceShapeKind = 'geo' | 'text' | 'note' | 'arrow'

export type ShapeReference = TLShapeId | 'selected' | 'this' | 'these'

export type ShapeTarget =
	| {
			shapeId: ShapeReference
	  }
	| {
			name: string
	  }

export interface VoiceShapeInput {
	id?: string
	shapeId?: string
	type: VoiceShapeKind
	text?: string
	color?: TLDefaultColorStyle
	x?: number
	y?: number
	w?: number
	h?: number
	geo?: TLGeoShapeGeoStyle
	arrowFromId?: ShapeReference
	arrowToId?: ShapeReference
	arrowFromName?: string
	arrowToName?: string
	props?: TLCreateShapePartial['props']
}

export interface VoiceShapeUpdate {
	shapeId?: ShapeReference
	name?: string
	text?: string
	color?: TLDefaultColorStyle
	x?: number
	y?: number
	w?: number
	h?: number
}

export interface CreateShapesAction {
	type: 'create_shapes'
	shapes: VoiceShapeInput[]
}

export interface UpdateShapesAction {
	type: 'update_shapes'
	shapes: VoiceShapeUpdate[]
}

export interface DeleteShapesAction {
	type: 'delete_shapes'
	shapeIds?: ShapeReference[]
	names?: string[]
	target?: 'selected'
}

export interface ConnectShapesAction {
	type: 'connect_shapes'
	shapeId?: string
	arrowFromId?: ShapeReference
	arrowToId?: ShapeReference
	arrowFromName?: string
	arrowToName?: string
	text?: string
	color?: TLDefaultColorStyle
}

export type LayoutOperation = 'auto' | 'top-down' | 'left-right' | 'grid' | 'radial'

export interface LayoutShapesAction {
	type: 'layout_shapes'
	shapeIds?: ShapeReference[]
	names?: string[]
	scope?: 'selected' | 'all'
	operation: LayoutOperation
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
	| ConnectShapesAction
	| LayoutShapesAction
	| CritiqueCanvasAction

export type VoiceToolResultStatus = 'ok' | 'clarification' | 'error'

export interface VoiceToolResult {
	status: VoiceToolResultStatus
	message: string
	shapeIds?: TLShapeId[]
	clarification?: string
	matches?: Array<{
		shapeId: TLShapeId
		text: string
		type: string
	}>
}

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
