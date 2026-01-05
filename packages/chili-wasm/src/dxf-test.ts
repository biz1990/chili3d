// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Result } from "chili-core";
import { ShapeFactory } from "./factory";

/**
 * Test function to demonstrate DXF import functionality
 * This creates a simple DXF content and tests the import
 */
export function testDxfImport(): Result<string, string> {
    try {
        // Create a simple DXF file content for testing
        // This is a minimal DXF with basic entities
        const dxfContent = `  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1015
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LINE
  8
0
 10
0.0
 20
0.0
 30
0.0
 11
100.0
 21
100.0
 31
0.0
  0
CIRCLE
  8
0
 10
50.0
 20
50.0
 30
0.0
 40
25.0
  0
ENDSEC
  0
EOF`;

        // Convert string to Uint8Array
        const encoder = new TextEncoder();
        const dxfBytes = encoder.encode(dxfContent);

        // Create a mock document (in real usage, this would be a proper IDocument)
        const mockDocument = {
            modelManager: {
                materials: []
            }
        } as any;

        // Test the DXF import
        const factory = new ShapeFactory();
        const result = factory.converter.convertFromDXF(mockDocument, dxfBytes);

        if (result.isOk) {
            return Result.ok("DXF import test successful! Imported " + result.value.children.length + " shapes.");
        } else {
            return Result.err("DXF import test failed: " + result.error);
        }
    } catch (error) {
        return Result.err("DXF import test error: " + error);
    }
}

/**
 * Example usage of DXF import in a real application
 */
export function importDxfFile(document: any, dxfFile: File): Promise<Result<string, string>> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                const dxfBytes = new Uint8Array(event.target.result as ArrayBuffer);
                const factory = new ShapeFactory();
                const result = factory.converter.convertFromDXF(document, dxfBytes);
                
                if (result.isOk) {
                    resolve(Result.ok("Successfully imported DXF file with " + result.value.children.length + " shapes"));
                } else {
                    resolve(Result.err("Failed to import DXF file: " + result.error));
                }
            } else {
                resolve(Result.err("Failed to read DXF file"));
            }
        };
        reader.onerror = () => resolve(Result.err("Error reading DXF file"));
        reader.readAsArrayBuffer(dxfFile);
    });
}