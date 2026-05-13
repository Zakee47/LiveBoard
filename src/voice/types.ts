import type { BoxModel, TLCreateShapePartial, TLShape, TLShapeId, TLShapePartial } from 'tldraw'

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

export interface CanvasSnapshot {
	shapes: TLShape[]
	selectedShapeIds: TLShapeId[]
	viewportBounds: BoxModel
	selectionBounds: BoxModel | null
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
