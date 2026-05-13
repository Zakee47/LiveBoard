import type { Editor } from 'tldraw'
import { createCanvasContextDebugText, type CanvasContextProvider } from './CanvasContextProvider'
import type { VoiceToolAction } from './types'

export interface ActionBridge {
	execute(action: VoiceToolAction): Promise<string>
}

export interface ActionBridgeOptions {
	editor: Editor
	canvasContext?: CanvasContextProvider
	onBriefVoiceSummary?: (summary: string) => void
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
					editor.createShapes(action.shapes)
					await canvasContext?.sendContext('action_batch')
					return `Created ${action.shapes.length} shape${action.shapes.length === 1 ? '' : 's'}.`
				case 'update_shapes':
					editor.updateShapes(action.shapes)
					await canvasContext?.sendContext('action_batch')
					return `Updated ${action.shapes.length} shape${action.shapes.length === 1 ? '' : 's'}.`
				case 'delete_shapes':
					editor.deleteShapes(action.shapeIds)
					await canvasContext?.sendContext('action_batch')
					return `Deleted ${action.shapeIds.length} shape${action.shapeIds.length === 1 ? '' : 's'}.`
				case 'layout_shapes':
					if (action.operation === 'pack') {
						editor.packShapes(action.shapeIds, action.gap)
					} else if (action.operation === 'distribute') {
						editor.distributeShapes(action.shapeIds, action.axis ?? 'horizontal')
					} else {
						editor.alignShapes(action.shapeIds, action.alignment ?? 'center-horizontal')
					}
					await canvasContext?.sendContext('action_batch')
					return `Applied ${action.operation} to ${action.shapeIds.length} shapes.`
				case 'critique_canvas':
					if (!canvasContext) {
						return 'Canvas critique unavailable: no canvas context provider is attached.'
					}
					const snapshot = await canvasContext.sendContext('manual', {
						focus: action.focus ?? 'viewport',
						includeScreenshot: true,
					})
					const critique = buildStructuredCanvasCritique(action.focus ?? 'viewport', createCanvasContextDebugText(snapshot))
					onBriefVoiceSummary?.(summarizeCritiqueForVoice(critique))
					return critique
			}
		},
	}
}

function buildStructuredCanvasCritique(focus: NonNullable<VoiceToolAction['focus']>, context: string) {
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
