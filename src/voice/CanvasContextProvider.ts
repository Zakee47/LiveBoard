import type { Editor } from 'tldraw'
import type { CanvasSnapshot } from './types'

export interface CanvasContextProvider {
	getSnapshot(): CanvasSnapshot
}

export interface CanvasContextProviderOptions {
	editor: Editor
}

export function createCanvasContextProvider({
	editor,
}: CanvasContextProviderOptions): CanvasContextProvider {
	return {
		getSnapshot() {
			const selectionBounds = editor.getSelectionPageBounds()
			return {
				shapes: editor.getCurrentPageShapes(),
				selectedShapeIds: editor.getSelectedShapeIds(),
				viewportBounds: editor.getViewportPageBounds().toJson(),
				selectionBounds: selectionBounds ? selectionBounds.toJson() : null,
			}
		},
	}
}
