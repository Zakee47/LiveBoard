import {
	Box,
	renderPlaintextFromRichText,
	type BoxModel,
	type Editor,
	type TLShape,
	type TLShapeId,
} from 'tldraw'
import type {
	CanvasClusterSummary,
	CanvasContextUpdate,
	CanvasSnapshot,
	CompactCanvasShape,
	SelectedCanvasShape,
} from './types'

const MAX_VISIBLE_SHAPES = 80
const MAX_SELECTED_SHAPES = 30
const MAX_CLUSTER_SAMPLES = 6
const CLUSTER_CELL_SIZE = 1600

export type CanvasContextUpdateReason = CanvasContextUpdate['reason']

export interface CanvasContextProvider {
	getSnapshot(options?: CanvasSnapshotOptions): Promise<CanvasSnapshot>
	sendContext(reason: CanvasContextUpdateReason, options?: CanvasSnapshotOptions): Promise<CanvasSnapshot>
	onUpdate(listener: CanvasContextUpdateListener): () => void
	dispose(): void
}

export interface CanvasContextProviderOptions {
	editor: Editor
	onContextUpdate?: CanvasContextUpdateListener
	debounceMs?: number
	maxVisibleShapes?: number
	maxSelectedShapes?: number
}

export interface CanvasSnapshotOptions {
	includeScreenshot?: boolean
	focus?: 'selection' | 'viewport' | 'canvas'
}

export type CanvasContextUpdateListener = (update: CanvasContextUpdate) => void | Promise<void>

export function createCanvasContextProvider({
	editor,
	onContextUpdate,
	debounceMs = 250,
	maxVisibleShapes = MAX_VISIBLE_SHAPES,
	maxSelectedShapes = MAX_SELECTED_SHAPES,
}: CanvasContextProviderOptions): CanvasContextProvider {
	const listeners = new Set<CanvasContextUpdateListener>()
	if (onContextUpdate) listeners.add(onContextUpdate)
	let debounceTimer: ReturnType<typeof setTimeout> | null = null

	const emitUpdate = async (
		reason: CanvasContextUpdateReason,
		options?: CanvasSnapshotOptions
	): Promise<CanvasSnapshot> => {
		const snapshot = await buildCanvasSnapshot(editor, { maxVisibleShapes, maxSelectedShapes }, options)
		const update: CanvasContextUpdate = { reason, snapshot }
		await Promise.all([...listeners].map((listener) => listener(update)))
		return snapshot
	}

	const scheduleUpdate = () => {
		if (debounceTimer) clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			void emitUpdate('canvas_change')
		}, debounceMs)
	}

	editor.on('change', scheduleUpdate)

	return {
		getSnapshot(options) {
			return buildCanvasSnapshot(editor, { maxVisibleShapes, maxSelectedShapes }, options)
		},
		sendContext(reason, options) {
			return emitUpdate(reason, options)
		},
		onUpdate(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		dispose() {
			if (debounceTimer) clearTimeout(debounceTimer)
			editor.off('change', scheduleUpdate)
			listeners.clear()
		},
	}
}

export function createCanvasContextDebugText(snapshot: CanvasSnapshot): string {
	const selected = snapshot.selectedShapes.map(formatShapeForDebug).join('\n')
	const visible = snapshot.visibleShapes.map(formatShapeForDebug).join('\n')
	const clusters = snapshot.clusters
		.map((cluster) => `${cluster.position}: ${cluster.count} shapes in ${formatBounds(cluster.bounds)}`)
		.join('\n')

	return [
		`Canvas context @ ${new Date(snapshot.generatedAt).toISOString()}`,
		`Viewport: ${formatBounds(snapshot.viewportBounds)}`,
		`Shapes: ${snapshot.totalShapeCount} total, ${snapshot.visibleShapes.length} visible, ${snapshot.omittedShapeCount} clustered/off-viewport`,
		`Selection: ${snapshot.selectedShapes.length} selected`,
		selected ? `Selected:\n${selected}` : 'Selected: none',
		visible ? `Visible:\n${visible}` : 'Visible: none',
		clusters ? `Clusters:\n${clusters}` : 'Clusters: none',
		snapshot.screenshotBase64Png ? 'Screenshot: included as base64 PNG' : 'Screenshot: omitted',
	].join('\n\n')
}

interface CanvasSnapshotLimits {
	maxVisibleShapes: number
	maxSelectedShapes: number
}

async function buildCanvasSnapshot(
	editor: Editor,
	limits: CanvasSnapshotLimits,
	options: CanvasSnapshotOptions = {}
): Promise<CanvasSnapshot> {
	const viewportBounds = editor.getViewportPageBounds()
	const selectionBounds = editor.getSelectionPageBounds()
	const allShapes = editor.getCurrentPageShapesSorted()
	const selectedShapeIds = editor.getSelectedShapeIds()
	const selectedShapeIdSet = new Set<TLShapeId>(selectedShapeIds)
	const visibleShapeIdSet = editor.getShapeIdsInsideBounds(viewportBounds)
	const selectedShapes = selectedShapeIds
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => Boolean(shape))
		.slice(0, limits.maxSelectedShapes)
		.map((shape) => toSelectedCanvasShape(editor, shape))

	const visibleShapes = allShapes
		.filter((shape) => visibleShapeIdSet.has(shape.id))
		.slice(0, limits.maxVisibleShapes)
		.map((shape) => toCompactCanvasShape(editor, shape))

	const clusteredShapes = allShapes.filter(
		(shape) => !visibleShapeIdSet.has(shape.id) && !selectedShapeIdSet.has(shape.id)
	)
	const clusters = summarizePeripheralClusters(editor, viewportBounds, clusteredShapes)
	const screenshotBase64Png = options.includeScreenshot
		? await createScreenshotBase64Png(editor, options.focus ?? 'viewport', selectedShapeIds, viewportBounds)
		: undefined

	return {
		selectedShapeIds,
		selectedShapes,
		visibleShapes,
		viewportBounds: viewportBounds.toJson(),
		selectionBounds: selectionBounds ? selectionBounds.toJson() : null,
		clusters,
		totalShapeCount: allShapes.length,
		omittedShapeCount: countOmittedShapes(allShapes.length, visibleShapes, selectedShapes, clusters),
		generatedAt: Date.now(),
		screenshotBase64Png,
	}
}

function toSelectedCanvasShape(editor: Editor, shape: TLShape): SelectedCanvasShape {
	return {
		...toCompactCanvasShape(editor, shape),
		x: round(shape.x),
		y: round(shape.y),
		rotation: round(shape.rotation),
		isLocked: shape.isLocked,
		opacity: round(shape.opacity),
	}
}

function toCompactCanvasShape(editor: Editor, shape: TLShape): CompactCanvasShape {
	const bounds = editor.getShapePageBounds(shape)
	const compact: CompactCanvasShape = {
		id: shape.id,
		type: shape.type,
		text: getShapeText(editor, shape),
		bounds: bounds ? toRoundedBounds(bounds.toJson()) : null,
		center: bounds ? { x: round(bounds.center.x), y: round(bounds.center.y) } : null,
	}
	if (shape.parentId) compact.parentId = shape.parentId
	const meta = getShapeMeta(shape)
	if (Object.keys(meta).length > 0) compact.meta = meta
	return compact
}

function summarizePeripheralClusters(
	editor: Editor,
	viewportBounds: Box,
	shapes: TLShape[]
): CanvasClusterSummary[] {
	const clusterMap = new Map<string, TLShape[]>()
	for (const shape of shapes) {
		const bounds = editor.getShapePageBounds(shape)
		if (!bounds) continue
		const key = `${getClusterPosition(viewportBounds, bounds)}:${Math.floor(
			bounds.center.x / CLUSTER_CELL_SIZE
		)}:${Math.floor(bounds.center.y / CLUSTER_CELL_SIZE)}`
		const clusterShapes = clusterMap.get(key)
		if (clusterShapes) {
			clusterShapes.push(shape)
		} else {
			clusterMap.set(key, [shape])
		}
	}

	return [...clusterMap.entries()]
		.map(([id, clusterShapes]) => toClusterSummary(editor, viewportBounds, id, clusterShapes))
		.sort((a, b) => b.count - a.count)
		.slice(0, 12)
}

function toClusterSummary(
	editor: Editor,
	viewportBounds: Box,
	id: string,
	shapes: TLShape[]
): CanvasClusterSummary {
	const bounds = Box.Common(
		shapes
			.map((shape) => editor.getShapePageBounds(shape))
			.filter((box): box is Box => Boolean(box))
	)
	const shapeTypes: Record<string, number> = {}
	for (const shape of shapes) {
		shapeTypes[shape.type] = (shapeTypes[shape.type] ?? 0) + 1
	}

	return {
		id,
		position: getClusterPosition(viewportBounds, bounds),
		count: shapes.length,
		shapeTypes,
		bounds: toRoundedBounds(bounds.toJson()),
		sampleShapeIds: shapes.slice(0, MAX_CLUSTER_SAMPLES).map((shape) => shape.id),
		sampleTexts: shapes
			.map((shape) => getShapeText(editor, shape))
			.filter((text): text is string => Boolean(text))
			.slice(0, MAX_CLUSTER_SAMPLES),
	}
}

async function createScreenshotBase64Png(
	editor: Editor,
	focus: 'selection' | 'viewport' | 'canvas',
	selectedShapeIds: TLShapeId[],
	viewportBounds: Box
): Promise<string | undefined> {
	const exportShapeIds =
		focus === 'selection' && selectedShapeIds.length > 0
			? selectedShapeIds
			: [...editor.getShapeIdsInsideBounds(viewportBounds)]
	if (exportShapeIds.length === 0) return undefined
	const { url } = await editor.toImageDataUrl(exportShapeIds, {
		background: false,
		bounds: focus === 'selection' ? undefined : viewportBounds,
		format: 'png',
		padding: 16,
		pixelRatio: 1,
	})
	return url.replace(/^data:image\/png;base64,/, '')
}

function getShapeText(editor: Editor, shape: TLShape): string | undefined {
	const props = shape.props
	if ('richText' in props) {
		const text = renderPlaintextFromRichText(editor, props.richText).trim()
		return text ? truncate(text, 280) : undefined
	}
	if ('name' in props && typeof props.name === 'string' && props.name.trim()) {
		return truncate(props.name.trim(), 280)
	}
	return undefined
}

function getShapeMeta(shape: TLShape): NonNullable<CompactCanvasShape['meta']> {
	const props = shape.props
	return {
		...('color' in props && typeof props.color === 'string' ? { color: props.color } : {}),
		...('fill' in props && typeof props.fill === 'string' ? { fill: props.fill } : {}),
		...('geo' in props && typeof props.geo === 'string' ? { geo: props.geo } : {}),
		...('name' in props && typeof props.name === 'string' ? { name: props.name } : {}),
	}
}

function getClusterPosition(
	viewportBounds: Box,
	bounds: Box
): CanvasClusterSummary['position'] {
	const vertical = bounds.center.y < viewportBounds.minY ? 'above' : bounds.center.y > viewportBounds.maxY ? 'below' : ''
	const horizontal = bounds.center.x < viewportBounds.minX ? 'left' : bounds.center.x > viewportBounds.maxX ? 'right' : ''
	if (vertical && horizontal) return `${vertical}-${horizontal}` as CanvasClusterSummary['position']
	return (vertical || horizontal || 'right') as CanvasClusterSummary['position']
}

function toRoundedBounds(bounds: BoxModel): BoxModel {
	return {
		x: round(bounds.x),
		y: round(bounds.y),
		w: round(bounds.w),
		h: round(bounds.h),
	}
}

function countOmittedShapes(
	totalShapeCount: number,
	visibleShapes: CompactCanvasShape[],
	selectedShapes: SelectedCanvasShape[],
	clusters: CanvasClusterSummary[]
) {
	const detailedShapeIds = new Set<TLShapeId>()
	for (const shape of visibleShapes) detailedShapeIds.add(shape.id)
	for (const shape of selectedShapes) detailedShapeIds.add(shape.id)
	return Math.max(0, totalShapeCount - detailedShapeIds.size - countClusteredShapes(clusters))
}

function countClusteredShapes(clusters: CanvasClusterSummary[]) {
	return clusters.reduce((count, cluster) => count + cluster.count, 0)
}

function formatShapeForDebug(shape: CompactCanvasShape) {
	return `- ${shape.id} ${shape.type}${shape.text ? ` "${shape.text}"` : ''} ${shape.bounds ? formatBounds(shape.bounds) : 'no bounds'}`
}

function formatBounds(bounds: BoxModel) {
	return `x=${bounds.x}, y=${bounds.y}, w=${bounds.w}, h=${bounds.h}`
}

function truncate(value: string, maxLength: number) {
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function round(value: number) {
	return Math.round(value * 100) / 100
}
