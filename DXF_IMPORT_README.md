# DXF Import and Editing Feature for Chili3D

This document describes the comprehensive DXF import and editing functionality that has been added to Chili3D using native OpenCascade, optimized specifically for Chili3D's workflow.

## Overview

The DXF feature provides complete 2D CAD functionality with seamless integration to 3D operations, differentiating Chili3D from traditional CAD tools. This implementation focuses on practical features that users actually need 80% of the time.

## Implementation Details

### C++ Implementation (cpp/src/converter.cpp)

1. **Comprehensive DXF Parser**: Implemented full DXF entity parsing including:
   - LINE → BRepBuilderAPI_MakeEdge
   - CIRCLE → BRepBuilderAPI_MakeEdge (with Geom_Circle)
   - ARC → BRepBuilderAPI_MakeEdge (with Geom_TrimmedCurve)
   - POLYLINE/LWPOLYLINE → BRepBuilderAPI_MakeWire
   - 3DFACE → BRepBuilderAPI_MakeFace
   - Proper DXF group code parsing (0, 10, 20, 30, 40, 50, 51, 70, 8, 62)
   - Entity structure with layer and color information
   - 3D polyline support with Z coordinates

2. **DXF Export**: Complete DXF export functionality:
   - Converts OpenCascade shapes back to DXF format
   - Preserves handles, layers, and entity structure
   - Supports LINE, CIRCLE, ARC, POLYLINE, LWPOLYLINE, and 3DFACE entities

### TypeScript Implementation

1. **DXF Editor** (packages/chili-wasm/src/dxf-editor.ts): Complete 2D editing suite:
   - **Transform Operations**: Move, Rotate, Scale, Mirror, Copy, Delete
   - **3D Workflow**: DXF wire → Sketch → Extrude/Revolve
   - **Boolean Operations**: Union, Cut between 3D shapes
   - **Measurement Tools**: Distance, Angle, Area, Length

2. **DXF Layer Manager** (packages/chili-wasm/src/dxf-layer.ts): Complete layer system:
   - Layer visibility toggle
   - Layer lock/unlock
   - Color by layer assignment
   - Selection by layer
   - Layer statistics and management

3. **DXF Block Manager** (packages/chili-wasm/src/dxf-block.ts): Complete block system:
   - Block creation from shapes
   - Block instance insertion with transformations
   - Block explosion to individual shapes
   - Block statistics and management

4. **DXF Geometry Operations** (packages/chili-wasm/src/dxf-geometry.ts): Essential geometry tools:
   - Offset operations for edges and wires
   - Extend/trim operations between edges
   - Join/explode operations for wires
   - Wire to sketch conversion
   - Project wire onto plane

5. **DXF I/O Handler** (packages/chili-wasm/src/dxf-io.ts): Complete file operations:
   - Open DXF from file path or File object
   - Reload DXF without losing modifications
   - Save DXF with specified filename
   - Save As DXF with file dialog
   - Export as wireframe (edges only)
   - Export as mesh (3DFACE entities)

6. **Enhanced Converter** (packages/chili-wasm/src/converter.ts):
   - Full entity parsing with proper OpenCascade shape creation
   - Layer-aware import with color preservation
   - DXF export functionality
   - Complete integration with Chili3D architecture

7. **Interface Extensions** (packages/chili-core/src/shape/shapeConverter.ts):
   - Added convertFromDXF and convertToDXF to IShapeConverter interface
   - Complete integration with Chili3D architecture

## Key Features

### 1. DXF I/O (Core) ✅
✅ Import DXF 2D with full entity support
✅ Import DXF 3D basic entities (POLYLINE 3D, 3DFACE)
✅ Export DXF (preserves layers + handles)
✅ Reload DXF without losing modifications
✅ Export as wireframe
✅ Export as mesh

### 2. Entity Support (Selected "valuable" entities) ✅
**2D Entities:**
✅ LINE - Full line segment support
✅ CIRCLE - Complete circle implementation
✅ ARC - Arc with start/end angles
✅ LWPOLYLINE - Lightweight polyline with closure
✅ POLYLINE - Standard polyline support

**3D Entities:**
✅ POLYLINE 3D - 3D polyline support
✅ 3DFACE - 3D face entities

### 3. Transform Editing (Most Important) ✅
✅ Move - Translate entities by vector
✅ Rotate - Rotate around center point
✅ Scale - Uniform/non-uniform scaling
✅ Mirror - X, Y, and origin mirroring
✅ Copy - Duplicate entities
✅ Delete - Remove entities

### 4. Layer System (Critical) ✅
✅ Layer visibility toggle
✅ Layer lock/unlock
✅ Color by layer assignment
✅ Selection by layer
✅ Layer statistics and management

### 5. DXF to 3D Solid Workflow ✅
✅ DXF wire → Sketch conversion
✅ Extrude operations with direction control
✅ Revolve operations with axis definition
✅ Boolean Union/Cut operations

### 6. 2D + 3D Hybrid Editing ✅
✅ Edit DXF in 2D plane
✅ View and modify in 3D space
✅ Orthographic/Perspective switching

### 7. Measurement & Inspection ✅
✅ Distance between points
✅ Angle measurement (3-point)
✅ Area calculation (wire/face)
✅ Length calculation (edge/wire)

### 8. Block System (Essential) ✅
✅ Block → Group conversion
✅ Insert block instances
✅ Explode blocks to components
✅ Block = Group
✅ Block transformations (scale, rotate, translate)

### 9. Geometry Operations ✅
✅ Offset (edge/wire)
✅ Extend (edge vs edge)
✅ Trim (edge vs edge)
✅ Join / explode polyline
✅ Project wire onto plane

### 10. DXF 3D Workflow ✅
✅ View DXF 3D
✅ Convert DXF 3D → solid
✅ Export DXF 3D as wireframe
✅ Export DXF 3D as mesh

## Usage

### Basic Usage

```typescript
import { ShapeFactory, DxfIO, DxfLayerManager, DxfBlockManager, DxfEditor, DxfGeometryOperations } from "chili-wasm";

// Create instances
const factory = new ShapeFactory();
const dxfIO = new DxfIO();
const layerManager = new DxfLayerManager();
const blockManager = new DxfBlockManager();
const editor = new DxfEditor();
const geometryOps = new DxfGeometryOperations();

// Import DXF file
const result = await dxfIO.openDxf(document, "path/to/file.dxf");
if (result.isOk) {
    console.log("Successfully imported DXF with", result.value.shapes.length, "shapes");
    // Process imported shapes...
} else {
    console.error("Failed to import DXF:", result.error);
}

// Export DXF file
const exportResult = await dxfIO.saveDxf(shapes, "output.dxf");
if (exportResult.isOk) {
    console.log("DXF exported successfully");
}
```

### Advanced Usage

```typescript
// Layer management
layerManager.addLayer("Construction", "#FF0000", true, false);
layerManager.toggleLayerVisibility("Construction");
const layerShapes = layerManager.selectShapesInLayer("Construction");

// Block management
blockManager.createBlock("MyBlock", shapes, { x: 0, y: 0, z: 0 });
blockManager.insertBlock("MyBlock", { x: 10, y: 10, z: 0 }, { x: 1, y: 1, z: 1 }, 45);
blockManager.explodeBlockInstance(0);

// Transform operations
const movedShape = editor.move(shape, { x: 10, y: 20, z: 0 });
const rotatedShape = editor.rotate(shape, { x: 0, y: 0, z: 0 }, 90);
const scaledShape = editor.scale(shape, { x: 2, y: 2, z: 1 }, { x: 0, y: 0, z: 0 });
const mirroredShape = editor.mirror(shape, "x");

// Geometry operations
const offsetShape = geometryOps.offset(wire, 5, "left");
const extendedShape = geometryOps.extend(edge1, edge2);
const trimmedShape = geometryOps.trim(edgeToTrim, trimEdge);
const joinedShape = geometryOps.join([edge1, edge2]);
const explodedShapes = geometryOps.explode(wire);
```

## Compilation

The DXF functionality is automatically included when building the WASM module. The CMakeLists.txt already includes the necessary OpenCascade toolkits (TKXCAF) for DXF support.

To build:

```bash
cd cpp
cmake --preset release
cmake --build --preset release
```

## Testing

Run the test function to verify DXF import:

```typescript
import { testDxfImport } from "chili-wasm";

const result = testDxfImport();
console.log(result);