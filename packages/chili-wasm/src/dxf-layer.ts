// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IShape } from "chili-core";
import { ShapeFactory } from "./factory";

/**
 * DXF Layer information
 */
export interface DxfLayer {
    name: string;
    color: string;
    isVisible: boolean;
    isLocked: boolean;
    shapes: IShape[];
}

/**
 * DXF Layer management system
 */
export class DxfLayerManager {
    private layers: Map<string, DxfLayer> = new Map();
    private factory: ShapeFactory;

    constructor() {
        this.factory = new ShapeFactory();
        // Initialize with default layer
        this.addLayer("0", "#FFFFFF", true, false);
    }

    /**
     * Add a new layer
     */
    addLayer(name: string, color: string, isVisible: boolean = true, isLocked: boolean = false): DxfLayer {
        const layer: DxfLayer = {
            name,
            color,
            isVisible,
            isLocked,
            shapes: []
        };
        this.layers.set(name, layer);
        return layer;
    }

    /**
     * Get a layer by name
     */
    getLayer(name: string): DxfLayer | undefined {
        return this.layers.get(name);
    }

    /**
     * Get all layers
     */
    getAllLayers(): DxfLayer[] {
        return Array.from(this.layers.values());
    }

    /**
     * Remove a layer
     */
    removeLayer(name: string): boolean {
        if (name === "0") return false; // Cannot remove default layer
        return this.layers.delete(name);
    }

    /**
     * Toggle layer visibility
     */
    toggleLayerVisibility(name: string): boolean {
        const layer = this.layers.get(name);
        if (layer) {
            layer.isVisible = !layer.isVisible;
            return true;
        }
        return false;
    }

    /**
     * Toggle layer lock state
     */
    toggleLayerLock(name: string): boolean {
        const layer = this.layers.get(name);
        if (layer) {
            layer.isLocked = !layer.isLocked;
            return true;
        }
        return false;
    }

    /**
     * Change layer color
     */
    changeLayerColor(name: string, color: string): boolean {
        const layer = this.layers.get(name);
        if (layer) {
            layer.color = color;
            return true;
        }
        return false;
    }

    /**
     * Add shape to layer
     */
    addShapeToLayer(shape: IShape, layerName: string): boolean {
        const layer = this.layers.get(layerName);
        if (layer && !layer.isLocked) {
            layer.shapes.push(shape);
            return true;
        }
        return false;
    }

    /**
     * Remove shape from layer
     */
    removeShapeFromLayer(shape: IShape, layerName: string): boolean {
        const layer = this.layers.get(layerName);
        if (layer && !layer.isLocked) {
            const index = layer.shapes.indexOf(shape);
            if (index > -1) {
                layer.shapes.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    /**
     * Move shape to different layer
     */
    moveShapeToLayer(shape: IShape, fromLayer: string, toLayer: string): boolean {
        const from = this.layers.get(fromLayer);
        const to = this.layers.get(toLayer);
        
        if (from && to && !from.isLocked && !to.isLocked) {
            const index = from.shapes.indexOf(shape);
            if (index > -1) {
                from.shapes.splice(index, 1);
                to.shapes.push(shape);
                return true;
            }
        }
        return false;
    }

    /**
     * Select all shapes in a layer
     */
    selectShapesInLayer(layerName: string): IShape[] {
        const layer = this.layers.get(layerName);
        return layer ? [...layer.shapes] : [];
    }

    /**
     * Get all visible shapes from all layers
     */
    getAllVisibleShapes(): IShape[] {
        const visibleShapes: IShape[] = [];
        for (const layer of this.layers.values()) {
            if (layer.isVisible) {
                visibleShapes.push(...layer.shapes);
            }
        }
        return visibleShapes;
    }

    /**
     * Get all unlocked shapes from all layers
     */
    getAllUnlockedShapes(): IShape[] {
        const unlockedShapes: IShape[] = [];
        for (const layer of this.layers.values()) {
            if (!layer.isLocked) {
                unlockedShapes.push(...layer.shapes);
            }
        }
        return unlockedShapes;
    }

    /**
     * Clear all shapes from a layer
     */
    clearLayer(name: string): boolean {
        const layer = this.layers.get(name);
        if (layer && !layer.isLocked) {
            layer.shapes = [];
            return true;
        }
        return false;
    }

    /**
     * Get layer statistics
     */
    getLayerStats(): { name: string; shapeCount: number; isVisible: boolean; isLocked: boolean }[] {
        return Array.from(this.layers.values()).map(layer => ({
            name: layer.name,
            shapeCount: layer.shapes.length,
            isVisible: layer.isVisible,
            isLocked: layer.isLocked
        }));
    }
}