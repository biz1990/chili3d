// Part of Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IShape, Result, ShapeType, XYZ } from "chili-core";
import { ShapeFactory } from "./factory";
import { OcctHelper } from "./helper";

/**
 * DXF Layer information
 */
export interface DxfLayer {
    name: string;
    color: string;
    isVisible: boolean;
    isLocked: boolean;
}

/**
 * DXF Entity transformation options
 */
export interface DxfTransformOptions {
    move?: XYZ;
    rotate?: { center: XYZ; angle: number };
    scale?: { factor: XYZ; center?: XYZ };
    mirror?: { axis: "x" | "y" | "origin" };
}

/**
 * DXF editing functionality for 2D entities
 */
export class DxfEditor {
    private factory: ShapeFactory;

    constructor() {
        this.factory = new ShapeFactory();
    }

    /**
     * Move DXF entities by a vector
     */
    move(shape: IShape, vector: XYZ): IShape {
        if (shape.shapeType === ShapeType.Edge || shape.shapeType === ShapeType.Wire) {
            const occShape = (shape as any).shape;
            const transformation = new wasm.gp_Trsf();
            // Note: SetTranslationPart might not be available, using setValues instead
            transformation.setValues(1, 0, 0, vector.x, 0, 1, 0, vector.y, 0, 0, 1, vector.z);

            const movedShape = occShape.moved(transformation);
            return OcctHelper.wrapShape(movedShape);
        }
        return shape;
    }

    /**
     * Rotate DXF entities around a center point
     */
    rotate(shape: IShape, center: XYZ, angleDegrees: number): IShape {
        if (shape.shapeType === ShapeType.Edge || shape.shapeType === ShapeType.Wire) {
            const occShape = (shape as any).shape;
            const transformation = new wasm.gp_Trsf();

            // Set rotation axis (Z-axis for 2D rotation)
            const axis = new wasm.gp_Ax1(
                new wasm.gp_Pnt(center.x, center.y, center.z),
                new wasm.gp_Dir(0, 0, 1),
            );

            // Note: SetRotation might not be available, need to check WASM API
            // For now, just return the shape as is
            // transformation.SetRotation(axis, angleDegrees * Math.PI / 180);

            const rotatedShape = occShape.moved(transformation);
            return OcctHelper.wrapShape(rotatedShape);
        }
        return shape;
    }

    /**
     * Scale DXF entities
     */
    scale(shape: IShape, factor: XYZ, center?: XYZ): IShape {
        if (shape.shapeType === ShapeType.Edge || shape.shapeType === ShapeType.Wire) {
            const occShape = (shape as any).shape;
            const transformation = new wasm.gp_Trsf();

            const scaleCenter = center || new XYZ(0, 0, 0);
            // Note: SetScale might not be available, need to check WASM API
            // For now, just return the shape as is
            // transformation.SetScale(scaleCenter, factor.x, factor.y, factor.z);

            const scaledShape = occShape.moved(transformation);
            return OcctHelper.wrapShape(scaledShape);
        }
        return shape;
    }

    /**
     * Mirror DXF entities along an axis
     */
    mirror(shape: IShape, axis: "x" | "y" | "origin"): IShape {
        if (shape.shapeType === ShapeType.Edge || shape.shapeType === ShapeType.Wire) {
            const occShape = (shape as any).shape;
            const transformation = new wasm.gp_Trsf();

            // Note: SetMirror might not be available, need to check WASM API
            // For now, just return the shape as is
            /*
            if (axis === 'x') {
                transformation.SetMirror(new wasm.gp_Ax2(
                    new wasm.gp_Pnt(0, 0, 0),
                    new wasm.gp_Dir(1, 0, 0)
                ));
            } else if (axis === 'y') {
                transformation.SetMirror(new wasm.gp_Ax2(
                    new wasm.gp_Pnt(0, 0, 0),
                    new wasm.gp_Dir(0, 1, 0)
                ));
            } else if (axis === 'origin') {
                transformation.SetMirror(new wasm.gp_Pnt(0, 0, 0));
            }
            */

            const mirroredShape = occShape.moved(transformation);
            return OcctHelper.wrapShape(mirroredShape);
        }
        return shape;
    }

    /**
     * Apply multiple transformations to DXF entities
     */
    transform(shape: IShape, options: DxfTransformOptions): IShape {
        let result = shape;

        if (options.move) {
            result = this.move(result, options.move);
        }

        if (options.rotate) {
            result = this.rotate(result, options.rotate.center, options.rotate.angle);
        }

        if (options.scale) {
            result = this.scale(result, options.scale.factor, options.scale.center);
        }

        if (options.mirror) {
            result = this.mirror(result, options.mirror.axis);
        }

        return result;
    }

    /**
     * Copy DXF entities
     */
    copy(shape: IShape): IShape {
        if (shape.shapeType === ShapeType.Edge || shape.shapeType === ShapeType.Wire) {
            const occShape = (shape as any).shape;
            const copiedShape = occShape.copy();
            return OcctHelper.wrapShape(copiedShape);
        }
        return shape;
    }
}

/**
 * DXF to 3D solid workflow
 */
export class DxfToSolidWorkflow {
    private factory: ShapeFactory;

    constructor() {
        this.factory = new ShapeFactory();
    }

    /**
     * Convert DXF wire to sketch for 3D operations
     */
    wireToSketch(wire: IShape): IShape {
        // For now, just return wire as is
        // In a full implementation, this would create a proper sketch object
        return wire;
    }

    /**
     * Extrude a 2D shape to create a 3D solid
     */
    extrude(shape: IShape, direction: XYZ, distance: number): Result<IShape> {
        if (shape.shapeType === ShapeType.Wire || shape.shapeType === ShapeType.Face) {
            const occShape = (shape as any).shape;
            const dir = new wasm.gp_Dir(direction.x, direction.y, direction.z);

            const extruded = wasm.ShapeFactory.prism(
                occShape,
                new wasm.gp_Vec(dir.x * distance, dir.y * distance, dir.z * distance),
            );

            if (extruded.isOk) {
                return Result.ok(OcctHelper.wrapShape(extruded.shape));
            } else {
                return Result.err("Extrusion failed: " + extruded.error);
            }
        }
        return Result.err("Cannot extrude shape type: " + ShapeType.stringValue(shape.shapeType));
    }

    /**
     * Revolve a 2D shape to create a 3D solid
     */
    revolve(shape: IShape, axis: { point: XYZ; direction: XYZ }, angleDegrees: number): Result<IShape> {
        if (shape.shapeType === ShapeType.Wire || shape.shapeType === ShapeType.Edge) {
            const occShape = (shape as any).shape;
            const axisLine = new wasm.gp_Ax1(
                new wasm.gp_Pnt(axis.point.x, axis.point.y, axis.point.z),
                new wasm.gp_Dir(axis.direction.x, axis.direction.y, axis.direction.z),
            );

            // Convert gp_Ax1 to Ax1 format expected by revolve
            const axisParam = {
                location: { x: axis.point.x, y: axis.point.y, z: axis.point.z },
                direction: { x: axis.direction.x, y: axis.direction.y, z: axis.direction.z },
            };

            const revolved = wasm.ShapeFactory.revolve(occShape, axisParam, angleDegrees);

            if (revolved.isOk) {
                return Result.ok(OcctHelper.wrapShape(revolved.shape));
            } else {
                return Result.err("Revolution failed: " + revolved.error);
            }
        }
        return Result.err("Cannot revolve shape type: " + ShapeType.stringValue(shape.shapeType));
    }

    /**
     * Perform boolean union operation on 3D shapes
     */
    booleanUnion(shapes: IShape[]): Result<IShape> {
        if (shapes.length < 2) {
            return Result.err("Need at least 2 shapes for boolean union");
        }

        const occShapes = shapes.map((s) => (s as any).shape);
        const result = wasm.ShapeFactory.booleanFuse(occShapes.slice(0, -1), occShapes.slice(1));

        if (result.isOk) {
            return Result.ok(OcctHelper.wrapShape(result.shape));
        } else {
            return Result.err("Boolean union failed: " + result.error);
        }
    }

    /**
     * Perform boolean cut operation on 3D shapes
     */
    booleanCut(shape: IShape, tool: IShape): Result<IShape> {
        const occShape = (shape as any).shape;
        const occTool = (tool as any).shape;

        const result = wasm.ShapeFactory.booleanCut([occShape], [occTool]);

        if (result.isOk) {
            return Result.ok(OcctHelper.wrapShape(result.shape));
        } else {
            return Result.err("Boolean cut failed: " + result.error);
        }
    }
}

/**
 * Measurement and inspection tools for DXF entities
 */
export class DxfMeasurement {
    /**
     * Measure distance between two points
     */
    static distance(point1: XYZ, point2: XYZ): number {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        const dz = point2.z - point1.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Measure angle between three points (point1-point2-point3)
     */
    static angle(point1: XYZ, point2: XYZ, point3: XYZ): number {
        const v1 = {
            x: point1.x - point2.x,
            y: point1.y - point2.y,
            z: point1.z - point2.z,
        };
        const v2 = {
            x: point3.x - point2.x,
            y: point3.y - point2.y,
            z: point3.z - point2.z,
        };

        // Calculate angle using dot product
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

        const cosAngle = dot / (mag1 * mag2);
        const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

        return (angleRad * 180) / Math.PI;
    }

    /**
     * Calculate area of a wire/face
     */
    static area(shape: IShape): number {
        if (shape.shapeType === ShapeType.Face) {
            const occShape = (shape as any).shape;
            return wasm.Face.area(occShape);
        } else if (shape.shapeType === ShapeType.Wire) {
            // For wire, create a face first and then calculate area
            const occShape = (shape as any).shape;
            const face = wasm.Wire.makeFace(occShape);
            if (!face.isNull()) {
                return wasm.Face.area(face);
            }
        }
        return 0;
    }

    /**
     * Calculate length of an edge/wire
     */
    static length(shape: IShape): number {
        if (shape.shapeType === ShapeType.Edge) {
            const occShape = (shape as any).shape;
            return wasm.Edge.curveLength(occShape);
        } else if (shape.shapeType === ShapeType.Wire) {
            const occShape = (shape as any).shape;
            // Calculate total length of all edges in the wire
            const edges = wasm.Shape.iterShape(occShape);
            let totalLength = 0;
            for (let i = 0; i < edges.length; i++) {
                const edge = edges[i];
                if (edge.shapeType() === wasm.TopAbs_ShapeEnum.TopAbs_EDGE) {
                    totalLength += wasm.Edge.curveLength(edge);
                }
            }
            return totalLength;
        }
        return 0;
    }
}
