// Part of Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IShape, Result, XYZ } from "chili-core";
import { DxfEditor } from "./dxf-editor";
import { ShapeFactory } from "./factory";

/**
 * DXF Block definition
 */
export interface DxfBlock {
    name: string;
    shapes: IShape[];
    origin: XYZ;
    isExploded: boolean;
}

/**
 * DXF Block instance (insertion)
 */
export interface DxfBlockInstance {
    blockName: string;
    position: XYZ;
    scale: XYZ;
    rotation: number; // in degrees
    shapes: IShape[];
}

/**
 * DXF Block management system
 */
export class DxfBlockManager {
    private blocks: Map<string, DxfBlock> = new Map();
    private instances: DxfBlockInstance[] = [];
    private factory: ShapeFactory;

    constructor() {
        this.factory = new ShapeFactory();
    }

    /**
     * Create a new block from shapes
     */
    createBlock(name: string, shapes: IShape[], origin: XYZ = new XYZ(0, 0, 0)): Result<DxfBlock> {
        if (this.blocks.has(name)) {
            return Result.err(`Block with name '${name}' already exists`);
        }

        const block: DxfBlock = {
            name,
            shapes: [...shapes], // Copy shapes
            origin,
            isExploded: false,
        };

        this.blocks.set(name, block);
        return Result.ok(block);
    }

    /**
     * Get a block by name
     */
    getBlock(name: string): DxfBlock | undefined {
        return this.blocks.get(name);
    }

    /**
     * Get all blocks
     */
    getAllBlocks(): DxfBlock[] {
        return Array.from(this.blocks.values());
    }

    /**
     * Remove a block
     */
    removeBlock(name: string): boolean {
        // Remove all instances of this block first
        this.instances = this.instances.filter((instance) => instance.blockName !== name);
        return this.blocks.delete(name);
    }

    /**
     * Insert a block instance at a specific position
     */
    insertBlock(
        blockName: string,
        position: XYZ,
        scale: XYZ = new XYZ(1, 1, 1),
        rotation: number = 0,
    ): Result<DxfBlockInstance> {
        const block = this.blocks.get(blockName);
        if (!block) {
            return Result.err(`Block '${blockName}' not found`);
        }

        // Create transformed copies of block shapes
        const transformedShapes: IShape[] = [];
        const dxfEditor = new DxfEditor();

        for (const shape of block.shapes) {
            let transformedShape = shape;

            // Apply scale
            if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
                transformedShape = dxfEditor.scale(transformedShape, scale, block.origin);
            }

            // Apply rotation
            if (rotation !== 0) {
                transformedShape = dxfEditor.rotate(transformedShape, block.origin, rotation);
            }

            // Apply translation
            if (position.x !== 0 || position.y !== 0 || position.z !== 0) {
                transformedShape = dxfEditor.move(transformedShape, position);
            }

            transformedShapes.push(transformedShape);
        }

        const instance: DxfBlockInstance = {
            blockName,
            position,
            scale,
            rotation,
            shapes: transformedShapes,
        };

        this.instances.push(instance);
        return Result.ok(instance);
    }

    /**
     * Explode a block instance into individual shapes
     */
    explodeBlockInstance(instanceIndex: number): Result<IShape[]> {
        if (instanceIndex < 0 || instanceIndex >= this.instances.length) {
            return Result.err("Invalid block instance index");
        }

        const instance = this.instances[instanceIndex];

        // Mark the original block as exploded if this is the first instance
        const block = this.blocks.get(instance.blockName);
        if (block && !block.isExploded) {
            block.isExploded = true;
        }

        // Remove the instance and return its shapes
        this.instances.splice(instanceIndex, 1);
        return Result.ok(instance.shapes);
    }

    /**
     * Explode all instances of a block
     */
    explodeAllBlockInstances(blockName: string): Result<IShape[]> {
        const block = this.blocks.get(blockName);
        if (!block) {
            return Result.err(`Block '${blockName}' not found`);
        }

        const allShapes: IShape[] = [];

        // Process all instances in reverse order to avoid index issues
        for (let i = this.instances.length - 1; i >= 0; i--) {
            if (this.instances[i].blockName === blockName) {
                const result = this.explodeBlockInstance(i);
                if (result.isOk) {
                    allShapes.push(...result.value);
                }
            }
        }

        block.isExploded = true;
        return Result.ok(allShapes);
    }

    /**
     * Get all block instances
     */
    getAllInstances(): DxfBlockInstance[] {
        return [...this.instances];
    }

    /**
     * Get instances of a specific block
     */
    getBlockInstances(blockName: string): DxfBlockInstance[] {
        return this.instances.filter((instance) => instance.blockName === blockName);
    }

    /**
     * Remove a block instance
     */
    removeInstance(index: number): boolean {
        if (index >= 0 && index < this.instances.length) {
            this.instances.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Update a block instance transformation
     */
    updateInstanceTransformation(
        index: number,
        position: XYZ,
        scale: XYZ,
        rotation: number,
    ): Result<DxfBlockInstance> {
        if (index < 0 || index >= this.instances.length) {
            return Result.err("Invalid block instance index");
        }

        const instance = this.instances[index];
        const block = this.blocks.get(instance.blockName);

        if (!block) {
            return Result.err(`Block '${instance.blockName}' not found`);
        }

        // Recreate transformed shapes with new transformation
        const transformedShapes: IShape[] = [];
        const dxfEditor = new DxfEditor();

        for (const shape of block.shapes) {
            let transformedShape = shape;

            // Apply scale
            if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
                transformedShape = dxfEditor.scale(transformedShape, scale, block.origin);
            }

            // Apply rotation
            if (rotation !== 0) {
                transformedShape = dxfEditor.rotate(transformedShape, block.origin, rotation);
            }

            // Apply translation
            if (position.x !== 0 || position.y !== 0 || position.z !== 0) {
                transformedShape = dxfEditor.move(transformedShape, position);
            }

            transformedShapes.push(transformedShape);
        }

        // Update instance
        instance.position = position;
        instance.scale = scale;
        instance.rotation = rotation;
        instance.shapes = transformedShapes;

        return Result.ok(instance);
    }

    /**
     * Get all shapes from all instances
     */
    getAllInstanceShapes(): IShape[] {
        const allShapes: IShape[] = [];
        for (const instance of this.instances) {
            allShapes.push(...instance.shapes);
        }
        return allShapes;
    }

    /**
     * Clear all blocks and instances
     */
    clear(): void {
        this.blocks.clear();
        this.instances = [];
    }

    /**
     * Get block statistics
     */
    getBlockStats(): { name: string; instanceCount: number; shapeCount: number; isExploded: boolean }[] {
        return Array.from(this.blocks.values()).map((block) => ({
            name: block.name,
            instanceCount: this.instances.filter((instance) => instance.blockName === block.name).length,
            shapeCount: block.shapes.length,
            isExploded: block.isExploded,
        }));
    }
}
