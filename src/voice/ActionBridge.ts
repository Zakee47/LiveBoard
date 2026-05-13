import type { Editor } from 'tldraw'
import type { VoiceToolAction } from './types'

export interface ActionBridge {
	execute(action: VoiceToolAction): Promise<string>
}

export interface ActionBridgeOptions {
	editor: Editor
}

export function createActionBridge({ editor }: ActionBridgeOptions): ActionBridge {
	return {
		async execute(action) {
			switch (action.type) {
				case 'create_shapes':
					editor.createShapes(action.shapes)
					return `Created ${action.shapes.length} shape${action.shapes.length === 1 ? '' : 's'}.`
				case 'update_shapes':
					editor.updateShapes(action.shapes)
					return `Updated ${action.shapes.length} shape${action.shapes.length === 1 ? '' : 's'}.`
				case 'delete_shapes':
					editor.deleteShapes(action.shapeIds)
					return `Deleted ${action.shapeIds.length} shape${action.shapeIds.length === 1 ? '' : 's'}.`
				case 'layout_shapes':
					if (action.operation === 'pack') {
						editor.packShapes(action.shapeIds, action.gap)
					} else if (action.operation === 'distribute') {
						editor.distributeShapes(action.shapeIds, action.axis ?? 'horizontal')
					} else {
						editor.alignShapes(action.shapeIds, action.alignment ?? 'center-horizontal')
					}
					return `Applied ${action.operation} to ${action.shapeIds.length} shapes.`
				case 'critique_canvas':
					return 'Canvas critique is stubbed for the bootstrap scaffold.'
			}
		},
	}
}
