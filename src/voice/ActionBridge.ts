import {
	Box,
	createBindingId,
	createShapeId,
	renderPlaintextFromRichText,
	toRichText,
	type Editor,
	type TLArrowBinding,
	type TLArrowShape,
	type TLCreateShapePartial,
	type TLDefaultColorStyle,
	type TLGeoShapeProps,
	type TLGeoShape,
	type TLGeoShapeGeoStyle,
	type TLNoteShape,
	type TLNoteShapeProps,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
	type TLTextShape,
	type TLTextShapeProps,
} from 'tldraw'
import { createCanvasContextDebugText, type CanvasContextProvider } from './CanvasContextProvider'
import type {
	ConnectShapesAction,
	DeleteShapesAction,
	LayoutShapesAction,
	ShapeReference,
	VoiceShapeInput,
	VoiceShapeUpdate,
	VoiceToolAction,
	VoiceToolResult,
	CritiqueCanvasAction,
} from './types'

export interface ActionBridge {
	execute(action: VoiceToolAction): Promise<VoiceToolResult>
}

export interface ActionBridgeOptions {
	editor: Editor
	canvasContext?: CanvasContextProvider
	onBriefVoiceSummary?: (summary: string) => void
}

type OkShapeResult = { status: 'ok'; shape: TLShape }
type OkShapeIdsResult = { status: 'ok'; shapeIds: TLShapeId[] }
type OkArrowResult = {
	status: 'ok'
	shape: TLCreateShapePartial<TLArrowShape>
	bindings: TLArrowBinding[]
}

export function createActionBridge({
	editor,
	canvasContext,
	onBriefVoiceSummary,
}: ActionBridgeOptions): ActionBridge {
	return {
		async execute(action) {
			switch (action.type) {
				case 'create_shapes':
					return withActionContext(canvasContext, createShapes(editor, action.shapes))
				case 'update_shapes':
					return withActionContext(canvasContext, updateShapes(editor, action.shapes))
				case 'delete_shapes':
					return withActionContext(canvasContext, deleteShapes(editor, action))
				case 'connect_shapes':
					return withActionContext(canvasContext, connectShapes(editor, action))
				case 'layout_shapes':
					return withActionContext(canvasContext, layoutShapes(editor, action))
				case 'critique_canvas':
					return critiqueCanvas(canvasContext, onBriefVoiceSummary, action)
			}
		},
	}
}

async function withActionContext(
	canvasContext: CanvasContextProvider | undefined,
	result: VoiceToolResult
): Promise<VoiceToolResult> {
	if (result.status === 'ok') await canvasContext?.sendContext('action_batch')
	return result
}

async function critiqueCanvas(
	canvasContext: CanvasContextProvider | undefined,
	onBriefVoiceSummary: ((summary: string) => void) | undefined,
	action: CritiqueCanvasAction
): Promise<VoiceToolResult> {
	if (!canvasContext) {
		return ok('Canvas critique unavailable: no canvas context provider is attached.')
	}

	const snapshot = await canvasContext.sendContext('manual', {
		focus: action.focus ?? 'viewport',
		includeScreenshot: true,
	})
	const critique = buildStructuredCanvasCritique(
		action.focus ?? 'viewport',
		createCanvasContextDebugText(snapshot)
	)
	onBriefVoiceSummary?.(summarizeCritiqueForVoice(critique))
	return ok(critique)
}

function buildStructuredCanvasCritique(focus: NonNullable<CritiqueCanvasAction['focus']>, context: string) {
	return [
		`Canvas critique (${focus})`,
		'',
		'Strengths',
		'- Context payload captured selection, viewport shapes, off-viewport clusters, and a critique-only PNG screenshot.',
		'- The current canvas structure is ready for the realtime model to inspect without flooding the prompt with every shape.',
		'',
		'Potential improvements',
		'- Ask for a more specific goal if the critique should focus on hierarchy, visual design, spacing, or content clarity.',
		'- Use selected-shape details for precise edits and cluster summaries to decide whether to zoom or inspect peripheral groups.',
		'',
		'Context payload',
		context,
	].join('\n')
}

function summarizeCritiqueForVoice(critique: string) {
	return critique.split('\n').find((line) => line.startsWith('- '))?.slice(2) ?? 'Canvas critique is ready in chat.'
}

export function lookupShapesByText(editor: Editor, text: string): TLShape[] {
	const needle = normalizeText(text)
	if (!needle) return []

	return editor
		.getCurrentPageShapes()
		.filter((shape) => normalizeText(getShapeText(editor, shape)).includes(needle))
}

export function getShapeText(editor: Editor, shape: TLShape): string {
	if (shape.type === 'geo' || shape.type === 'text' || shape.type === 'note' || shape.type === 'arrow') {
		return renderPlaintextFromRichText(editor, shape.props.richText).trim()
	}

	return ''
}

function createShapes(editor: Editor, inputs: VoiceShapeInput[]): VoiceToolResult {
	const shapes: TLCreateShapePartial[] = []
	const bindings: TLArrowBinding[] = []
	const createdIds: TLShapeId[] = []

	for (const input of inputs) {
		const shapeId = toNewShapeId(editor, input.shapeId ?? input.id)
		if (!shapeId) {
			return error(`Shape id "${input.shapeId}" is invalid or already exists.`)
		}

		if (input.type === 'arrow') {
			const arrowResult = buildArrowShape(editor, {
				shapeId,
				text: input.text,
				color: input.color,
				arrowFromId: input.arrowFromId,
				arrowToId: input.arrowToId,
				arrowFromName: input.arrowFromName,
				arrowToName: input.arrowToName,
				x: input.x,
				y: input.y,
			})
			if (!isOkArrowResult(arrowResult)) return arrowResult
			shapes.push(arrowResult.shape)
			bindings.push(...arrowResult.bindings)
		} else {
			shapes.push(buildBoxShape(shapeId, input))
		}

		createdIds.push(shapeId)
	}

	editor.run(() => {
		editor.createShapes(shapes)
		if (bindings.length > 0) editor.createBindings(bindings)
	})

	return ok(`Created ${createdIds.length} shape${createdIds.length === 1 ? '' : 's'}.`, createdIds)
}

function updateShapes(editor: Editor, updates: VoiceShapeUpdate[]): VoiceToolResult {
	const shapePartials: TLShapePartial[] = []

	for (const update of updates) {
		const resolved = resolveOneShape(editor, update)
		if (!isOkShapeResult(resolved)) return resolved

		const shape = resolved.shape
		shapePartials.push(buildShapeUpdate(editor, shape, update))
	}

	editor.updateShapes(shapePartials)

	return ok(
		`Updated ${shapePartials.length} shape${shapePartials.length === 1 ? '' : 's'}.`,
		shapePartials.map((shape) => shape.id)
	)
}

function deleteShapes(editor: Editor, action: DeleteShapesAction): VoiceToolResult {
	const resolved = resolveManyShapes(editor, {
		shapeIds: action.target === 'selected' ? ['selected'] : action.shapeIds,
		names: action.names,
	})
	if (!isOkShapeIdsResult(resolved)) return resolved

	editor.deleteShapes(resolved.shapeIds)

	return ok(
		`Deleted ${resolved.shapeIds.length} shape${resolved.shapeIds.length === 1 ? '' : 's'}.`,
		resolved.shapeIds
	)
}

function connectShapes(editor: Editor, action: ConnectShapesAction): VoiceToolResult {
	const shapeId = toNewShapeId(editor, action.shapeId)
	if (!shapeId) {
		return error(`Shape id "${action.shapeId}" is invalid or already exists.`)
	}

	const arrowResult = buildArrowShape(editor, {
		shapeId,
		text: action.text,
		color: action.color,
		arrowFromId: action.arrowFromId,
		arrowToId: action.arrowToId,
		arrowFromName: action.arrowFromName,
		arrowToName: action.arrowToName,
	})
	if (!isOkArrowResult(arrowResult)) return arrowResult

	editor.run(() => {
		editor.createShape(arrowResult.shape)
		if (arrowResult.bindings.length > 0) editor.createBindings(arrowResult.bindings)
	})

	return ok('Connected shapes with an arrow.', [shapeId])
}

function layoutShapes(editor: Editor, action: LayoutShapesAction): VoiceToolResult {
	const resolved = resolveManyShapes(editor, action)
	if (!isOkShapeIdsResult(resolved)) return resolved
	if (resolved.shapeIds.length < 2) {
		return clarification('Which shapes should I lay out? Select or name at least two shapes.')
	}

	const shapes = resolved.shapeIds
		.map((shapeId) => editor.getShape(shapeId))
		.filter((shape): shape is TLShape => shape !== undefined)

	const gap = sanitizeNumber(action.gap, 48)
	const ordered =
		action.shapeIds?.length || action.names?.length
			? shapes
			: shapes.sort((a, b) => a.y - b.y || a.x - b.x)
	const shapeBounds = ordered
		.map((shape) => editor.getShapePageBounds(shape.id))
		.filter((box): box is Box => box !== undefined)
	const bounds = shapeBounds.length > 0 ? Box.Common(shapeBounds) : new Box()

	if (action.operation === 'auto') {
		editor.packShapes(resolved.shapeIds, gap)
		return ok(`Applied auto layout to ${resolved.shapeIds.length} shapes.`, resolved.shapeIds)
	}

	const partials = ordered.map((shape, index) => {
		const shapeBounds = editor.getShapePageBounds(shape.id)
		const width = shapeBounds?.w ?? getShapeWidth(shape)
		const height = shapeBounds?.h ?? getShapeHeight(shape)
		const position = getLayoutPosition(action.operation, index, ordered.length, bounds, width, height, gap)
		return {
			id: shape.id,
			type: shape.type,
			x: position.x + (shape.x - (shapeBounds?.x ?? shape.x)),
			y: position.y + (shape.y - (shapeBounds?.y ?? shape.y)),
		} as TLShapePartial
	})

	editor.updateShapes(partials)

	return ok(`Applied ${action.operation} layout to ${resolved.shapeIds.length} shapes.`, resolved.shapeIds)
}

function resolveManyShapes(
	editor: Editor,
	request: { shapeIds?: ShapeReference[]; names?: string[]; scope?: 'selected' | 'all' }
): VoiceToolResult | { status: 'ok'; shapeIds: TLShapeId[] } {
	const shapeIds: TLShapeId[] = []

	if (request.scope === 'all') {
		shapeIds.push(...editor.getCurrentPageShapes().map((shape) => shape.id))
	}

	for (const reference of request.shapeIds ?? []) {
		const resolved = resolveShapeReference(editor, reference)
		if (!isOkShapeIdsResult(resolved)) return resolved
		shapeIds.push(...resolved.shapeIds)
	}

	for (const name of request.names ?? []) {
		const resolved = resolveShapeName(editor, name)
		if (!isOkShapeResult(resolved)) return resolved
		shapeIds.push(resolved.shape.id)
	}

	if (shapeIds.length === 0 && request.scope === 'selected') {
		shapeIds.push(...editor.getSelectedShapeIds())
	}

	const uniqueShapeIds = [...new Set(shapeIds)].filter((shapeId) => editor.getShape(shapeId))
	if (uniqueShapeIds.length === 0) {
		return clarification('Which shapes should I use? Select shapes or refer to them by exact text.')
	}

	return { status: 'ok', shapeIds: uniqueShapeIds }
}

function resolveOneShape(editor: Editor, target: VoiceShapeUpdate): VoiceToolResult | OkShapeResult {
	if (target.name !== undefined) {
		return resolveShapeName(editor, target.name)
	}

	if (target.shapeId !== undefined) {
		const resolved = resolveShapeReference(editor, target.shapeId)
		if (!isOkShapeIdsResult(resolved)) return resolved
		if (resolved.shapeIds.length !== 1) {
			return clarification('Which selected shape should I update?', shapeMatches(editor, resolved.shapeIds))
		}

		const shape = editor.getShape(resolved.shapeIds[0])
		if (!shape) return error(`Shape "${resolved.shapeIds[0]}" was not found.`)
		return { status: 'ok', shape }
	}

	return clarification('Which shape should I update? Select one shape or refer to it by text.')
}

function resolveShapeReference(editor: Editor, reference: ShapeReference | undefined): VoiceToolResult | OkShapeIdsResult {
	if (reference === undefined) {
		return clarification('Which shape should I use?')
	}

	if (reference === 'selected' || reference === 'this' || reference === 'these') {
		const selectedShapeIds = editor.getSelectedShapeIds()
		if (selectedShapeIds.length === 0) {
			return clarification('No shapes are selected. Select shapes or refer to them by text.')
		}
		return { status: 'ok', shapeIds: selectedShapeIds }
	}

	const shapeId = toShapeId(reference)
	if (!shapeId || !editor.getShape(shapeId)) {
		return error(`Shape "${reference}" was not found.`)
	}

	return { status: 'ok', shapeIds: [shapeId] }
}

function resolveShapeName(editor: Editor, name: string): VoiceToolResult | OkShapeResult {
	const matches = lookupShapesByText(editor, name)
	if (matches.length === 0) {
		return clarification(`I couldn't find a shape named "${name}".`)
	}
	if (matches.length > 1) {
		return clarification(`I found multiple shapes named "${name}". Which one should I use?`, shapeMatches(editor, matches))
	}

	return { status: 'ok', shape: matches[0] }
}

function buildBoxShape(shapeId: TLShapeId, input: VoiceShapeInput): TLCreateShapePartial {
	const x = sanitizeNumber(input.x, 0)
	const y = sanitizeNumber(input.y, 0)
	const w = sanitizePositiveNumber(input.w, input.type === 'text' ? 160 : 180)
	const h = sanitizePositiveNumber(input.h, input.type === 'note' ? 160 : 100)
	const color = sanitizeColor(input.color)

	if (input.type === 'text') {
		return {
			id: shapeId,
			type: 'text',
			x,
			y,
			props: {
				...(input.props as Partial<TLTextShapeProps> | undefined),
				autoSize: input.w === undefined,
				color,
				richText: toRichText(input.text ?? ''),
				w,
			},
		} satisfies TLCreateShapePartial<TLTextShape>
	}

	if (input.type === 'note') {
		return {
			id: shapeId,
			type: 'note',
			x,
			y,
			props: {
				...(input.props as Partial<TLNoteShapeProps> | undefined),
				color,
				richText: toRichText(input.text ?? ''),
				scale: Math.max(0.25, w / 160),
			},
		} satisfies TLCreateShapePartial<TLNoteShape>
	}

	return {
		id: shapeId,
		type: 'geo',
		x,
		y,
		props: {
			...(input.props as Partial<TLGeoShapeProps> | undefined),
			color,
			geo: input.geo ?? 'rectangle',
			h,
			richText: toRichText(input.text ?? ''),
			w,
		},
	} satisfies TLCreateShapePartial<TLGeoShape>
}

function buildShapeUpdate(editor: Editor, shape: TLShape, update: VoiceShapeUpdate): TLShapePartial {
	const partial = {
		id: shape.id,
		type: shape.type,
	} as TLShapePartial

	if (update.x !== undefined) partial.x = sanitizeNumber(update.x, shape.x)
	if (update.y !== undefined) partial.y = sanitizeNumber(update.y, shape.y)

	if (shape.type === 'geo') {
		partial.props = {
			...(update.text !== undefined ? { richText: toRichText(update.text) } : {}),
			...(update.color !== undefined ? { color: sanitizeColor(update.color) } : {}),
			...(update.w !== undefined ? { w: sanitizePositiveNumber(update.w, shape.props.w) } : {}),
			...(update.h !== undefined ? { h: sanitizePositiveNumber(update.h, shape.props.h) } : {}),
		}
	} else if (shape.type === 'text') {
		partial.props = {
			...(update.text !== undefined ? { richText: toRichText(update.text) } : {}),
			...(update.color !== undefined ? { color: sanitizeColor(update.color) } : {}),
			...(update.w !== undefined ? { autoSize: false, w: sanitizePositiveNumber(update.w, shape.props.w) } : {}),
		}
	} else if (shape.type === 'note') {
		partial.props = {
			...(update.text !== undefined ? { richText: toRichText(update.text) } : {}),
			...(update.color !== undefined ? { color: sanitizeColor(update.color) } : {}),
			...(update.w !== undefined ? { scale: Math.max(0.25, sanitizePositiveNumber(update.w, 160) / 160) } : {}),
		}
	} else if (shape.type === 'arrow') {
		partial.props = {
			...(update.text !== undefined ? { richText: toRichText(update.text) } : {}),
			...(update.color !== undefined ? { color: sanitizeColor(update.color) } : {}),
		}
	}

	return partial
}

function buildArrowShape(
	editor: Editor,
	input: {
		shapeId: TLShapeId
		text?: string
		color?: TLDefaultColorStyle
		arrowFromId?: ShapeReference
		arrowToId?: ShapeReference
		arrowFromName?: string
		arrowToName?: string
		x?: number
		y?: number
	}
): VoiceToolResult | OkArrowResult {
	const from = resolveArrowEndpoint(editor, { shapeId: input.arrowFromId, name: input.arrowFromName })
	if (!isOkShapeResult(from)) return from

	const to = resolveArrowEndpoint(editor, { shapeId: input.arrowToId, name: input.arrowToName })
	if (!isOkShapeResult(to)) return to

	const fromBounds = editor.getShapePageBounds(from.shape.id)
	const toBounds = editor.getShapePageBounds(to.shape.id)
	const start = fromBounds?.center ?? { x: sanitizeNumber(input.x, 0), y: sanitizeNumber(input.y, 0) }
	const end = toBounds?.center ?? { x: start.x + 180, y: start.y }
	const x = Math.min(start.x, end.x)
	const y = Math.min(start.y, end.y)

	const shape = {
		id: input.shapeId,
		type: 'arrow',
		x,
		y,
		props: {
			color: sanitizeColor(input.color),
			richText: toRichText(input.text ?? ''),
			start: { x: start.x - x, y: start.y - y },
			end: { x: end.x - x, y: end.y - y },
		},
	} satisfies TLCreateShapePartial<TLArrowShape>

	const bindings: TLArrowBinding[] = [
		createArrowBinding(input.shapeId, from.shape.id, 'start'),
		createArrowBinding(input.shapeId, to.shape.id, 'end'),
	]

	return { status: 'ok', shape, bindings }
}

function resolveArrowEndpoint(
	editor: Editor,
	target: { shapeId?: ShapeReference; name?: string }
): VoiceToolResult | OkShapeResult {
	if (target.name) return resolveShapeName(editor, target.name)

	const resolved = resolveShapeReference(editor, target.shapeId)
	if (!isOkShapeIdsResult(resolved)) return resolved
	if (resolved.shapeIds.length !== 1) {
		return clarification('Which selected shape should this arrow connect to?', shapeMatches(editor, resolved.shapeIds))
	}

	const shape = editor.getShape(resolved.shapeIds[0])
	if (!shape) return error(`Shape "${resolved.shapeIds[0]}" was not found.`)

	return { status: 'ok', shape }
}

function createArrowBinding(
	fromId: TLShapeId,
	toId: TLShapeId,
	terminal: 'start' | 'end'
): TLArrowBinding {
	return {
		id: createBindingId(),
		typeName: 'binding',
		type: 'arrow',
		fromId,
		toId,
		props: {
			terminal,
			normalizedAnchor: { x: 0.5, y: 0.5 },
			isExact: false,
			isPrecise: false,
			snap: 'edge',
		},
		meta: {},
	}
}

function getLayoutPosition(
	operation: LayoutShapesAction['operation'],
	index: number,
	count: number,
	bounds: Box,
	width: number,
	height: number,
	gap: number
) {
	if (operation === 'top-down') {
		const slotHeight = Math.max(height, bounds.h / count)
		return { x: bounds.x, y: bounds.y + index * (slotHeight + gap) }
	}

	if (operation === 'left-right') {
		const slotWidth = Math.max(width, bounds.w / count)
		return { x: bounds.x + index * (slotWidth + gap), y: bounds.y }
	}

	if (operation === 'grid') {
		const columns = Math.ceil(Math.sqrt(count))
		const slotWidth = Math.max(width, bounds.w / columns)
		const rows = Math.ceil(count / columns)
		const slotHeight = Math.max(height, bounds.h / rows)
		return {
			x: bounds.x + (index % columns) * (slotWidth + gap),
			y: bounds.y + Math.floor(index / columns) * (slotHeight + gap),
		}
	}

	const radius = Math.max(width, height, gap) * Math.max(1.5, count / 3)
	const angle = (Math.PI * 2 * index) / count - Math.PI / 2
	return {
		x: bounds.center.x + Math.cos(angle) * radius - width / 2,
		y: bounds.center.y + Math.sin(angle) * radius - height / 2,
	}
}

function toNewShapeId(editor: Editor, id: string | undefined): TLShapeId | null {
	if (!id) return createShapeId()

	const shapeId = toShapeId(id)
	if (!shapeId || editor.getShape(shapeId)) return null

	return shapeId
}

function toShapeId(id: string): TLShapeId | null {
	const cleanId = id.trim()
	if (!cleanId || cleanId.includes('/') || cleanId.includes('\\') || cleanId.length > 120) return null

	return (cleanId.startsWith('shape:') ? cleanId : `shape:${cleanId}`) as TLShapeId
}

function sanitizeNumber(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
	return Math.max(1, sanitizeNumber(value, fallback))
}

function sanitizeColor(color: TLDefaultColorStyle | undefined): TLDefaultColorStyle {
	return VALID_COLORS.has(color ?? '') ? (color as TLDefaultColorStyle) : 'black'
}

function normalizeText(text: string): string {
	return text.trim().toLocaleLowerCase()
}

function getShapeWidth(shape: TLShape): number {
	if (shape.type === 'geo' || shape.type === 'text') return shape.props.w
	if (shape.type === 'note') return 160 * shape.props.scale
	return 160
}

function getShapeHeight(shape: TLShape): number {
	if (shape.type === 'geo') return shape.props.h
	if (shape.type === 'note') return 160 * shape.props.scale
	return 100
}

function shapeMatches(editor: Editor, shapes: TLShape[] | TLShapeId[]): VoiceToolResult['matches'] {
	return shapes
		.map((shapeOrId) => (typeof shapeOrId === 'string' ? editor.getShape(shapeOrId as TLShapeId) : shapeOrId))
		.filter((shape): shape is TLShape => shape !== undefined)
		.map((shape) => ({
			shapeId: shape.id,
			text: getShapeText(editor, shape),
			type: shape.type,
		}))
}

function ok(message: string, shapeIds?: TLShapeId[]): VoiceToolResult {
	return { status: 'ok', message, shapeIds }
}

function clarification(message: string, matches?: VoiceToolResult['matches']): VoiceToolResult {
	return { status: 'clarification', message, clarification: message, matches }
}

function error(message: string): VoiceToolResult {
	return { status: 'error', message }
}

function isOkShapeResult(result: VoiceToolResult | OkShapeResult): result is OkShapeResult {
	return result.status === 'ok' && 'shape' in result
}

function isOkShapeIdsResult(result: VoiceToolResult | OkShapeIdsResult): result is OkShapeIdsResult {
	return result.status === 'ok' && 'shapeIds' in result
}

function isOkArrowResult(result: VoiceToolResult | OkArrowResult): result is OkArrowResult {
	return result.status === 'ok' && 'shape' in result && 'bindings' in result
}

const VALID_COLORS = new Set([
	'black',
	'grey',
	'light-violet',
	'violet',
	'blue',
	'light-blue',
	'yellow',
	'orange',
	'green',
	'light-green',
	'light-red',
	'red',
	'white',
])
