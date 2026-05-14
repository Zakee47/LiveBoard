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
		description:
			'Create geo, text, note, or arrow shapes. Use arrowFromId/arrowToId or arrowFromName/arrowToName to connect arrows to existing shapes.',
		parameters: {
			type: 'object',
			properties: {
				shapes: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							shapeId: { type: 'string' },
							type: { type: 'string', enum: ['geo', 'text', 'note', 'arrow'] },
							text: { type: 'string' },
							color: {
								type: 'string',
								enum: [
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
								],
							},
							x: { type: 'number' },
							y: { type: 'number' },
							w: { type: 'number' },
							h: { type: 'number' },
							geo: { type: 'string' },
							arrowFromId: { type: 'string' },
							arrowToId: { type: 'string' },
							arrowFromName: { type: 'string' },
							arrowToName: { type: 'string' },
						},
						required: ['type'],
						additionalProperties: false,
					},
				},
			},
			required: ['shapes'],
			additionalProperties: false,
		},
	},
	{
		type: 'function',
		name: 'update_shapes',
		description:
			'Update shape text, color, position, or size by shapeId, selected/this/these, or by name. If a name matches multiple shapes, the bridge returns a clarification event.',
		parameters: {
			type: 'object',
			properties: {
				shapes: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							shapeId: { type: 'string' },
							name: { type: 'string' },
							text: { type: 'string' },
							color: { type: 'string' },
							x: { type: 'number' },
							y: { type: 'number' },
							w: { type: 'number' },
							h: { type: 'number' },
						},
						additionalProperties: false,
					},
				},
			},
			required: ['shapes'],
			additionalProperties: false,
		},
	},
	{
		type: 'function',
		name: 'delete_shapes',
		description:
			'Delete shapes by shapeIds, by names, or target selected. Use selected/this/these only when the user clearly refers to selected shapes.',
		parameters: {
			type: 'object',
			properties: {
				shapeIds: {
					type: 'array',
					items: { type: 'string' },
				},
				names: {
					type: 'array',
					items: { type: 'string' },
				},
				target: {
					type: 'string',
					enum: ['selected'],
				},
			},
			additionalProperties: false,
		},
	},
	{
		type: 'function',
		name: 'connect_shapes',
		description:
			'Connect two existing shapes with an arrow. Resolve endpoints by shape ID, selected/this/these, or exact visible shape text.',
		parameters: {
			type: 'object',
			properties: {
				shapeId: { type: 'string' },
				arrowFromId: { type: 'string' },
				arrowToId: { type: 'string' },
				arrowFromName: { type: 'string' },
				arrowToName: { type: 'string' },
				text: { type: 'string' },
				color: { type: 'string' },
			},
			additionalProperties: false,
		},
	},
	{
		type: 'function',
		name: 'layout_shapes',
		description:
			'Lay out selected, all, named, or explicitly referenced shapes using auto, top-down, left-right, grid, or radial layouts.',
		parameters: {
			type: 'object',
			properties: {
				shapeIds: {
					type: 'array',
					items: { type: 'string' },
				},
				names: {
					type: 'array',
					items: { type: 'string' },
				},
				scope: {
					type: 'string',
					enum: ['selected', 'all'],
				},
				operation: {
					type: 'string',
					enum: ['auto', 'top-down', 'left-right', 'grid', 'radial'],
				},
				gap: { type: 'number' },
			},
			required: ['operation'],
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
export const connectShapesTool = realtimeTools[3]
export const layoutShapesTool = realtimeTools[4]
export const critiqueCanvasTool = realtimeTools[5]
