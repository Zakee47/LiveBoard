import type { VoiceToolName } from './types'

export interface RealtimeToolDefinition {
	type: 'function'
	name: VoiceToolName
	description: string
	parameters: {
		type: 'object'
		properties: Record<string, unknown>
		required?: string[]
		additionalProperties: false
	}
}

export const realtimeTools: RealtimeToolDefinition[] = [
	{
		type: 'function',
		name: 'create_shapes',
		description: 'Create one or more tldraw shapes on the canvas.',
		parameters: {
			type: 'object',
			properties: {
				shapes: {
					type: 'array',
					items: { type: 'object' },
				},
			},
			required: ['shapes'],
			additionalProperties: false,
		},
	},
	{
		type: 'function',
		name: 'update_shapes',
		description: 'Update one or more existing tldraw shapes.',
		parameters: {
			type: 'object',
			properties: {
				shapes: {
					type: 'array',
					items: { type: 'object' },
				},
			},
			required: ['shapes'],
			additionalProperties: false,
		},
	},
	{
		type: 'function',
		name: 'delete_shapes',
		description: 'Delete one or more existing tldraw shapes.',
		parameters: {
			type: 'object',
			properties: {
				shapeIds: {
					type: 'array',
					items: { type: 'string' },
				},
			},
			required: ['shapeIds'],
			additionalProperties: false,
		},
	},
	{
		type: 'function',
		name: 'layout_shapes',
		description: 'Align, distribute, or pack existing tldraw shapes.',
		parameters: {
			type: 'object',
			properties: {
				shapeIds: {
					type: 'array',
					items: { type: 'string' },
				},
				operation: {
					type: 'string',
					enum: ['align', 'distribute', 'pack'],
				},
				axis: {
					type: 'string',
					enum: ['horizontal', 'vertical'],
				},
				alignment: {
					type: 'string',
					enum: ['top', 'bottom', 'left', 'right', 'center-horizontal', 'center-vertical'],
				},
				gap: { type: 'number' },
			},
			required: ['shapeIds', 'operation'],
			additionalProperties: false,
		},
	},
	{
		type: 'function',
		name: 'critique_canvas',
		description: 'Inspect the current canvas and return concise design or structure feedback.',
		parameters: {
			type: 'object',
			properties: {
				focus: {
					type: 'string',
					enum: ['selection', 'viewport', 'canvas'],
				},
			},
			additionalProperties: false,
		},
	},
]

export const createShapesTool = realtimeTools[0]
export const updateShapesTool = realtimeTools[1]
export const deleteShapesTool = realtimeTools[2]
export const layoutShapesTool = realtimeTools[3]
export const critiqueCanvasTool = realtimeTools[4]
