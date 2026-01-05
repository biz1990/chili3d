// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Result, type IDocument, type IShape } from "chili-core";
import { ShapeFactory } from "./factory";
import { OcctHelper } from "./helper";
import * as wasm from "./wasm";

/**
 * DXF File I/O Operations
 */
export class DxfIO {
    private factory: ShapeFactory;

    constructor() {
        this.factory = new ShapeFactory();
    }

    /**
     * Open a DXF file from file path or File object
     */
    async openDxf(document: IDocument, dxfSource: string | File): Promise<Result<{ shapes: IShape[], fileName: string }>> {
        try {
            let dxfBytes: Uint8Array;
            let fileName: string;

            if (typeof dxfSource === 'string') {
                // Load from file path
                const response = await fetch(dxfSource);
                if (!response.ok) {
                    return Result.err(`Failed to fetch DXF file: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                dxfBytes = new Uint8Array(arrayBuffer);
                fileName = dxfSource.split('/').pop() || 'unknown.dxf';
            } else {
                // Load from File object
                fileName = dxfSource.name;
                dxfBytes = new Uint8Array(await dxfSource.arrayBuffer());
            }

            // Import DXF using the converter
            const importResult = this.factory.converter.convertFromDXF(document, dxfBytes);
            
            if (importResult.isOk) {
                return Result.ok({
                    shapes: this.extractShapesFromFolder(importResult.value),
                    fileName
                });
            } else {
                return Result.err(`Failed to import DXF: ${importResult.error}`);
            }
        } catch (error) {
            return Result.err(`Error opening DXF file: ${error}`);
        }
    }

    /**
     * Reload a DXF file (re-import the same file)
     */
    async reloadDxf(document: IDocument, fileName: string): Promise<Result<IShape[]>> {
        try {
            const response = await fetch(fileName);
            if (!response.ok) {
                return Result.err(`Failed to reload DXF file: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const dxfBytes = new Uint8Array(arrayBuffer);

            const importResult = this.factory.converter.convertFromDXF(document, dxfBytes);
            
            if (importResult.isOk) {
                return Result.ok(this.extractShapesFromFolder(importResult.value));
            } else {
                return Result.err(`Failed to reload DXF: ${importResult.error}`);
            }
        } catch (error) {
            return Result.err(`Error reloading DXF file: ${error}`);
        }
    }

    /**
     * Save shapes to a DXF file
     */
    async saveDxf(shapes: IShape[], fileName: string): Promise<Result<string>> {
        try {
            const exportResult = this.factory.converter.convertToDXF(...shapes);
            
            if (!exportResult.isOk) {
                return Result.err(`Failed to export DXF: ${exportResult.error}`);
            }

            const dxfContent = exportResult.value;
            
            // Create blob and download
            const blob = new Blob([dxfContent], { type: 'application/dxf' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            return Result.ok(`Successfully saved DXF file: ${fileName}`);
        } catch (error) {
            return Result.err(`Error saving DXF file: ${error}`);
        }
    }

    /**
     * Save As DXF (with file dialog)
     */
    async saveAsDxf(shapes: IShape[]): Promise<Result<string>> {
        try {
            const exportResult = this.factory.converter.convertToDXF(...shapes);
            
            if (!exportResult.isOk) {
                return Result.err(`Failed to export DXF: ${exportResult.error}`);
            }

            const dxfContent = exportResult.value;
            
            // Create blob and trigger save dialog
            const blob = new Blob([dxfContent], { type: 'application/dxf' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = ''; // Empty filename triggers save dialog
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            return Result.ok('DXF file saved successfully');
        } catch (error) {
            return Result.err(`Error saving DXF file: ${error}`);
        }
    }

    /**
     * Export DXF as wireframe (edges only)
     */
    async exportAsWireframe(shapes: IShape[], fileName: string): Promise<Result<string>> {
        try {
            // Extract only edges from shapes
            const edges: IShape[] = [];
            
            for (const shape of shapes) {
                const extractedEdges = this.extractEdgesFromShape(shape);
                edges.push(...extractedEdges);
            }

            const exportResult = this.factory.converter.convertToDXF(...edges);
            
            if (!exportResult.isOk) {
                return Result.err(`Failed to export wireframe DXF: ${exportResult.error}`);
            }

            const dxfContent = exportResult.value;
            
            // Create blob and download
            const blob = new Blob([dxfContent], { type: 'application/dxf' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            return Result.ok(`Successfully exported wireframe DXF: ${fileName}`);
        } catch (error) {
            return Result.err(`Error exporting wireframe DXF: ${error}`);
        }
    }

    /**
     * Export DXF as mesh (3DFACE entities)
     */
    async exportAsMesh(shapes: IShape[], fileName: string): Promise<Result<string>> {
        try {
            // Convert shapes to mesh representation (3DFACE entities)
            const meshShapes: IShape[] = [];
            
            for (const shape of shapes) {
                const meshFaces = this.convertShapeToMeshFaces(shape);
                meshShapes.push(...meshFaces);
            }

            const exportResult = this.factory.converter.convertToDXF(...meshShapes);
            
            if (!exportResult.isOk) {
                return Result.err(`Failed to export mesh DXF: ${exportResult.error}`);
            }

            const dxfContent = exportResult.value;
            
            // Create blob and download
            const blob = new Blob([dxfContent], { type: 'application/dxf' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            return Result.ok(`Successfully exported mesh DXF: ${fileName}`);
        } catch (error) {
            return Result.err(`Error exporting mesh DXF: ${error}`);
        }
    }

    /**
     * Helper method to extract shapes from folder node
     */
    private extractShapesFromFolder(folderNode: any): IShape[] {
        const shapes: IShape[] = [];
        
        // Recursively extract all shapes from the folder structure
        const extractFromNode = (node: any) => {
            if (node.shape && !node.shape.isNull()) {
                shapes.push(OcctHelper.wrapShape(node.shape));
            }
            
            if (node.children && node.children.length > 0) {
                for (const child of node.children) {
                    extractFromNode(child);
                }
            }
        };
        
        extractFromNode(folderNode);
        return shapes;
    }

    /**
     * Helper method to extract edges from a shape
     */
    private extractEdgesFromShape(shape: IShape): IShape[] {
        const edges: IShape[] = [];
        const occShape = (shape as any).shape;
        
        // Use OpenCascade explorer to find all edges
        const explorer = new (wasm as any).TopExp_Explorer(occShape, (wasm as any).TopAbs_ShapeEnum.TopAbs_EDGE);
        
        while (explorer.More()) {
            const edge = explorer.Current();
            edges.push(OcctHelper.wrapShape(edge));
            explorer.Next();
        }
        
        explorer.delete();
        return edges;
    }

    /**
     * Helper method to convert shape to mesh faces (3DFACE)
     */
    private convertShapeToMeshFaces(shape: IShape): IShape[] {
        const meshFaces: IShape[] = [];
        const occShape = (shape as any).shape;
        
        // For faces, convert to 3DFACE entities
        if (shape.shapeType === "face") {
            // Convert face to 3DFACE representation
            // This is a simplified implementation
            meshFaces.push(shape);
        } else if (shape.shapeType === "solid") {
            // Extract faces from solid and convert each to 3DFACE
            const explorer = new (wasm as any).TopExp_Explorer(occShape, (wasm as any).TopAbs_ShapeEnum.TopAbs_FACE);
            
            while (explorer.More()) {
                const face = explorer.Current();
                meshFaces.push(OcctHelper.wrapShape(face));
                explorer.Next();
            }
            
            explorer.delete();
        }
        
        return meshFaces;
    }
}