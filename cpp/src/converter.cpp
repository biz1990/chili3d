// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <IGESCAFControl_Reader.hxx>
#include <IGESControl_Writer.hxx>
#include <Quantity_Color.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <STEPControl_Writer.hxx>
#include <StlAPI_Reader.hxx>
#include <StlAPI_Writer.hxx>
#include <TDF_ChildIterator.hxx>
#include <TDF_Label.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TopoDS_Iterator.hxx>
#include <TopoDS_Shape.hxx>
#include <XCAFDoc_ColorTool.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XCAFApp_Application.hxx>
#include <TDF_LabelSequence.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopExp_Explorer.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <RWStepVisual_RWStyledItem.hxx>
#include <StepVisual_StyledItem.hxx>
#include <StepVisual_Colour.hxx>
#include <StepVisual_ColourRgb.hxx>
#include <TCollection_HAsciiString.hxx>
#include <Interface_Static.hxx>
#include <sstream>
#include <map>
#include <vector>
#include <algorithm>
#include <cmath>

#include "shared.hpp"
#include "utils.hpp"

using namespace emscripten;

class VectorBuffer : public std::streambuf {
public:
    VectorBuffer(const std::vector<uint8_t>& v)
    {
        setg((char*)v.data(), (char*)v.data(), (char*)(v.data() + v.size()));
    }
};

EMSCRIPTEN_DECLARE_VAL_TYPE(ShapeNodeArray)

struct ShapeNode {
    std::optional<TopoDS_Shape> shape;
    std::optional<std::string> color;
    std::vector<ShapeNode> children;
    std::string name;

    ShapeNodeArray getChildren() const
    {
        return ShapeNodeArray(val::array(children));
    }
};

// copy from https://github.com/kovacsv/occt-import-js/blob/main/occt-import-js/src/importer-xcaf.cpp
std::string getLabelNameNoRef(const TDF_Label& label)
{
    Handle(TDataStd_Name) nameAttribute = new TDataStd_Name();
    if (!label.FindAttribute(nameAttribute->GetID(), nameAttribute)) {
        return std::string();
    }

    Standard_Integer utf8NameLength = nameAttribute->Get().LengthOfCString();
    char* nameBuf = new char[utf8NameLength + 1];
    nameAttribute->Get().ToUTF8CString(nameBuf);
    std::string name(nameBuf, utf8NameLength);
    delete[] nameBuf;
    return name;
}

std::string getLabelName(const TDF_Label& label, const Handle(XCAFDoc_ShapeTool) & shapeTool)
{
    if (XCAFDoc_ShapeTool::IsReference(label)) {
        TDF_Label referredShapeLabel;
        shapeTool->GetReferredShape(label, referredShapeLabel);
        return getLabelName(referredShapeLabel, shapeTool);
    }
    return getLabelNameNoRef(label);
}

std::string getShapeName(const TopoDS_Shape& shape, const Handle(XCAFDoc_ShapeTool) & shapeTool)
{
    TDF_Label shapeLabel;
    if (!shapeTool->Search(shape, shapeLabel)) {
        return std::string();
    }
    return getLabelName(shapeLabel, shapeTool);
}

bool getLabelColorNoRef(const TDF_Label& label, const Handle(XCAFDoc_ColorTool) & colorTool, std::string& color)
{
    static const std::vector<XCAFDoc_ColorType> colorTypes = { XCAFDoc_ColorSurf, XCAFDoc_ColorCurv, XCAFDoc_ColorGen };

    Quantity_Color qColor;
    for (XCAFDoc_ColorType colorType : colorTypes) {
        if (colorTool->GetColor(label, colorType, qColor)) {
            color = std::string(Quantity_Color::ColorToHex(qColor).ToCString());
            return true;
        }
    }

    return false;
}

bool getLabelColor(const TDF_Label& label, const Handle(XCAFDoc_ShapeTool) & shapeTool,
    const Handle(XCAFDoc_ColorTool) & colorTool, std::string& color)
{
    if (getLabelColorNoRef(label, colorTool, color)) {
        return true;
    }

    if (XCAFDoc_ShapeTool::IsReference(label)) {
        TDF_Label referredShape;
        shapeTool->GetReferredShape(label, referredShape);
        return getLabelColor(referredShape, shapeTool, colorTool, color);
    }

    return false;
}

bool getShapeColor(const TopoDS_Shape& shape, const Handle(XCAFDoc_ShapeTool) & shapeTool,
    const Handle(XCAFDoc_ColorTool) & colorTool, std::string& color)
{
    TDF_Label shapeLabel;
    if (!shapeTool->Search(shape, shapeLabel)) {
        return false;
    }
    return getLabelColor(shapeLabel, shapeTool, colorTool, color);
}

bool isFreeShape(const TDF_Label& label, const Handle(XCAFDoc_ShapeTool) & shapeTool)
{
    TopoDS_Shape tmpShape;
    return shapeTool->GetShape(label, tmpShape) && shapeTool->IsFree(label);
}

bool isMeshNode(const TDF_Label& label, const Handle(XCAFDoc_ShapeTool) & shapeTool)
{
    // if there are no children, it is a mesh node
    if (!label.HasChild()) {
        return true;
    }

    // if it has a subshape child, treat it as mesh node
    bool hasSubShapeChild = false;
    for (TDF_ChildIterator it(label); it.More(); it.Next()) {
        TDF_Label childLabel = it.Value();
        if (shapeTool->IsSubShape(childLabel)) {
            hasSubShapeChild = true;
            break;
        }
    }
    if (hasSubShapeChild) {
        return true;
    }

    // if it doesn't have a freeshape child, treat it as a mesh node
    bool hasFreeShapeChild = false;
    for (TDF_ChildIterator it(label); it.More(); it.Next()) {
        TDF_Label childLabel = it.Value();
        if (isFreeShape(childLabel, shapeTool)) {
            hasFreeShapeChild = true;
            break;
        }
    }
    if (!hasFreeShapeChild) {
        return true;
    }

    return false;
}

ShapeNode initLabelNode(const TDF_Label label, const Handle(XCAFDoc_ShapeTool) shapeTool,
    const Handle(XCAFDoc_ColorTool) colorTool)
{
    std::string color;
    getLabelColor(label, shapeTool, colorTool, color);

    ShapeNode node = {
        .shape = std::nullopt,
        .color = color,
        .children = {},
        .name = getLabelName(label, shapeTool),
    };

    return node;
}

ShapeNode initShapeNode(const TopoDS_Shape& shape, const Handle(XCAFDoc_ShapeTool) & shapeTool,
    const Handle(XCAFDoc_ColorTool) & colorTool)
{
    std::string color;
    getShapeColor(shape, shapeTool, colorTool, color);
    ShapeNode childShapeNode = { .shape = shape, .color = color, .children = {}, .name = getShapeName(shape, shapeTool) };
    return childShapeNode;
}

ShapeNode initGroupNode(const TopoDS_Shape& shape, const Handle_XCAFDoc_ShapeTool& shapeTool)
{
    ShapeNode groupNode = {
        .shape = std::nullopt, .color = std::nullopt, .children = {}, .name = getShapeName(shape, shapeTool)
    };

    return groupNode;
}

ShapeNode parseShape(TopoDS_Shape& shape, const Handle_XCAFDoc_ShapeTool& shapeTool,
    const Handle_XCAFDoc_ColorTool& colorTool)
{
    if (shape.ShapeType() == TopAbs_COMPOUND || shape.ShapeType() == TopAbs_COMPSOLID) {
        auto node = initGroupNode(shape, shapeTool);
        TopoDS_Iterator iterator(shape);
        while (iterator.More()) {
            auto subShape = iterator.Value();
            node.children.push_back(parseShape(subShape, shapeTool, colorTool));
            iterator.Next();
        }
        return node;
    }
    return initShapeNode(shape, shapeTool, colorTool);
}

ShapeNode parseLabelToNode(const TDF_Label& label, const Handle(XCAFDoc_ShapeTool) & shapeTool,
    const Handle(XCAFDoc_ColorTool) & colorTool)
{
    if (isMeshNode(label, shapeTool)) {
        auto shape = shapeTool->GetShape(label);
        return parseShape(shape, shapeTool, colorTool);
    }

    auto node = initLabelNode(label, shapeTool, colorTool);
    for (TDF_ChildIterator it(label); it.More(); it.Next()) {
        auto childLabel = it.Value();
        if (isFreeShape(childLabel, shapeTool)) {
            auto childNode = parseLabelToNode(childLabel, shapeTool, colorTool);
            node.children.push_back(childNode);
        }
    }
    return node;
}

ShapeNode parseRootLabelToNode(const Handle(XCAFDoc_ShapeTool) & shapeTool, const Handle(XCAFDoc_ColorTool) & colorTool)
{
    auto label = shapeTool->Label();

    ShapeNode node = initLabelNode(label, shapeTool, colorTool);
    for (TDF_ChildIterator it(label); it.More(); it.Next()) {
        auto childLabel = it.Value();
        if (isFreeShape(childLabel, shapeTool)) {
            auto childNode = parseLabelToNode(childLabel, shapeTool, colorTool);
            node.children.push_back(childNode);
        }
    }

    return node;
}

static ShapeNode parseNodeFromDocument(Handle(TDocStd_Document) document)
{
    TDF_Label mainLabel = document->Main();
    Handle(XCAFDoc_ShapeTool) shapeTool = XCAFDoc_DocumentTool::ShapeTool(mainLabel);
    Handle(XCAFDoc_ColorTool) colorTool = XCAFDoc_DocumentTool::ColorTool(mainLabel);

    return parseRootLabelToNode(shapeTool, colorTool);
}

class Converter {
private:
    static TopoDS_Shape sewShapes(const std::vector<TopoDS_Shape>& shapes)
    {
        BRepBuilderAPI_Sewing sewing;
        for (const auto& shape : shapes) {
            sewing.Add(shape);
        }
        sewing.Perform();
        return sewing.SewedShape();
    }

    static void writeBufferToFile(const std::string& fileName, const Uint8Array& buffer)
    {
        std::vector<uint8_t> input = convertJSArrayToNumberVector<uint8_t>(buffer);
        std::ofstream dummyFile;
        dummyFile.open(fileName, std::ios::binary);
        dummyFile.write((char*)input.data(), input.size());
        dummyFile.close();
    }

public:
    static std::string convertToBrep(const TopoDS_Shape& input)
    {
        std::ostringstream oss;
        BRepTools::Write(input, oss);
        return oss.str();
    }

    static TopoDS_Shape convertFromBrep(const std::string& input)
    {
        std::istringstream iss(input);
        TopoDS_Shape output;
        BRep_Builder builder;
        BRepTools::Read(output, iss, builder);
        return output;
    }

    static std::optional<ShapeNode> convertFromStep(const Uint8Array& buffer)
    {
        std::vector<uint8_t> input = convertJSArrayToNumberVector<uint8_t>(buffer);
        VectorBuffer vectorBuffer(input);
        std::istream iss(&vectorBuffer);

        STEPCAFControl_Reader cafReader;
        cafReader.SetColorMode(true);
        cafReader.SetNameMode(true);
        IFSelect_ReturnStatus readStatus = cafReader.ReadStream("stp", iss);

        if (readStatus != IFSelect_RetDone) {
            return std::nullopt;
        }

        Handle(TDocStd_Document) document = new TDocStd_Document("bincaf");
        if (!cafReader.Transfer(document)) {
            return std::nullopt;
        }

        return parseNodeFromDocument(document);
    }

    static std::optional<ShapeNode> convertFromIges(const Uint8Array& buffer)
    {
        std::string dummyFileName = "temp.igs";
        writeBufferToFile(dummyFileName, buffer);

        IGESCAFControl_Reader igesCafReader;
        igesCafReader.SetColorMode(true);
        igesCafReader.SetNameMode(true);
        if (igesCafReader.ReadFile(dummyFileName.c_str()) != IFSelect_RetDone) {
            std::remove(dummyFileName.c_str());
            return std::nullopt;
        }

        Handle(TDocStd_Document) document = new TDocStd_Document("bincaf");
        if (!igesCafReader.Transfer(document)) {
            std::remove(dummyFileName.c_str());
            return std::nullopt;
        }
        std::remove(dummyFileName.c_str());
        return parseNodeFromDocument(document);
    }

    static std::string convertToStep(const ShapeArray& input)
    {
        auto shapes = vecFromJSArray<TopoDS_Shape>(input);
        std::ostringstream oss;
        STEPControl_Writer stepWriter;
        for (const auto& shape : shapes) {
            stepWriter.Transfer(shape, STEPControl_AsIs);
        }
        stepWriter.WriteStream(oss);
        return oss.str();
    }

    static std::string convertToIges(const ShapeArray& input)
    {
        auto shapes = vecFromJSArray<TopoDS_Shape>(input);
        std::ostringstream oss;
        IGESControl_Writer igesWriter;
        for (const auto& shape : shapes) {
            igesWriter.AddShape(shape);
        }
        igesWriter.ComputeModel();
        igesWriter.Write(oss);
        return oss.str();
    }

    static std::optional<ShapeNode> convertFromStl(const Uint8Array& buffer)
    {
        std::string dummyFileName = "temp.stl";
        writeBufferToFile(dummyFileName, buffer);

        StlAPI_Reader stlReader;
        TopoDS_Shape shape;
        if (!stlReader.Read(shape, dummyFileName.c_str())) {
            return std::nullopt;
        }

        ShapeNode node = { .shape = shape, .color = std::nullopt, .children = {}, .name = "STL Shape" };

        return node;
    }

    struct DxfEntity {
        std::string type;
        std::map<int, std::string> groupCodes;
        std::string layer;
        std::string color;
        
        DxfEntity(const std::string& entityType) : type(entityType) {}
    };

    struct DxfLayer {
        std::string name;
        std::string color;
        bool isVisible = true;
        bool isLocked = false;
    };
    
    struct DxfBlock {
        std::string name;
        std::vector<DxfEntity> entities;
        std::map<int, std::string> groupCodes;
        
        DxfBlock(const std::string& blockName) : name(blockName) {}
    };

    static std::vector<DxfEntity> parseDxfEntities(const std::string& content)
    {
        std::vector<DxfEntity> entities;
        std::istringstream stream(content);
        std::string line;
        DxfEntity* currentEntity = nullptr;
        std::string currentLayer = "0"; // Default layer
        
        while (std::getline(stream, line)) {
            // Trim whitespace
            line.erase(0, line.find_first_not_of(" \t\r\n"));
            line.erase(line.find_last_not_of(" \t\r\n") + 1);
            
            if (line.empty()) continue;
            
            // Check if this is a group code (integer) or value
            if (std::isdigit(line[0]) || (line[0] == '-' && line.length() > 1 && std::isdigit(line[1]))) {
                int groupCode = std::stoi(line);
                
                if (std::getline(stream, line)) {
                    line.erase(0, line.find_first_not_of(" \t\r\n"));
                    line.erase(line.find_last_not_of(" \t\r\n") + 1);
                    
                    if (groupCode == 0) {
                        // New entity type or section
                        if (currentEntity) {
                            currentEntity->layer = currentLayer;
                            entities.push_back(*currentEntity);
                            delete currentEntity;
                        }
                        currentEntity = new DxfEntity(line);
                    } else if (currentEntity) {
                        currentEntity->groupCodes[groupCode] = line;
                        
                        // Store layer information
                        if (groupCode == 8) {
                            currentLayer = line;
                        }
                        
                        // Store color information
                        if (groupCode == 62) {
                            currentEntity->color = line;
                        }
                    }
                }
            }
        }
        
        if (currentEntity) {
            currentEntity->layer = currentLayer;
            entities.push_back(*currentEntity);
            delete currentEntity;
        }
        
        return entities;
    }

    static TopoDS_Shape createLineFromDxf(const DxfEntity& entity)
    {
        auto itX1 = entity.groupCodes.find(10);
        auto itY1 = entity.groupCodes.find(20);
        auto itX2 = entity.groupCodes.find(11);
        auto itY2 = entity.groupCodes.find(21);
        
        if (itX1 != entity.groupCodes.end() && itY1 != entity.groupCodes.end() &&
            itX2 != entity.groupCodes.end() && itY2 != entity.groupCodes.end()) {
            
            double x1 = std::stod(itX1->second);
            double y1 = std::stod(itY1->second);
            double x2 = std::stod(itX2->second);
            double y2 = std::stod(itY2->second);
            
            gp_Pnt p1(x1, y1, 0);
            gp_Pnt p2(x2, y2, 0);
            
            BRepBuilderAPI_MakeEdge edge(p1, p2);
            return edge.Edge();
        }
        
        return TopoDS_Shape();
    }

    static TopoDS_Shape createCircleFromDxf(const DxfEntity& entity)
    {
        auto itX = entity.groupCodes.find(10);
        auto itY = entity.groupCodes.find(20);
        auto itR = entity.groupCodes.find(40);
        
        if (itX != entity.groupCodes.end() && itY != entity.groupCodes.end() && itR != entity.groupCodes.end()) {
            double centerX = std::stod(itX->second);
            double centerY = std::stod(itY->second);
            double radius = std::stod(itR->second);
            
            gp_Pnt center(centerX, centerY, 0);
            gp_Dir normal(0, 0, 1);
            gp_Ax2 axis(center, normal);
            
            Handle(Geom_Circle) circle = new Geom_Circle(axis, radius);
            BRepBuilderAPI_MakeEdge edge(circle, 0, 2 * M_PI);
            return edge.Edge();
        }
        
        return TopoDS_Shape();
    }

    static TopoDS_Shape createArcFromDxf(const DxfEntity& entity)
    {
        auto itX = entity.groupCodes.find(10);
        auto itY = entity.groupCodes.find(20);
        auto itR = entity.groupCodes.find(40);
        auto itStartAngle = entity.groupCodes.find(50);
        auto itEndAngle = entity.groupCodes.find(51);
        
        if (itX != entity.groupCodes.end() && itY != entity.groupCodes.end() &&
            itR != entity.groupCodes.end() && itStartAngle != entity.groupCodes.end() &&
            itEndAngle != entity.groupCodes.end()) {
            
            double centerX = std::stod(itX->second);
            double centerY = std::stod(itY->second);
            double radius = std::stod(itR->second);
            double startAngle = std::stod(itStartAngle->second) * M_PI / 180.0;
            double endAngle = std::stod(itEndAngle->second) * M_PI / 180.0;
            
            gp_Pnt center(centerX, centerY, 0);
            gp_Dir normal(0, 0, 1);
            gp_Ax2 axis(center, normal);
            
            Handle(Geom_Circle) circle = new Geom_Circle(axis, radius);
            BRepBuilderAPI_MakeEdge edge(circle, startAngle, endAngle);
            return edge.Edge();
        }
        
        return TopoDS_Shape();
    }

    static TopoDS_Shape createPolylineFromDxf(const DxfEntity& entity)
    {
        std::vector<gp_Pnt> points;
        
        // Extract all vertex coordinates (group codes 10, 20, 30)
        // For 3D polylines, also extract Z coordinates (group code 30)
        bool is3D = (entity.type == "POLYLINE" && entity.groupCodes.find(70) != entity.groupCodes.end() &&
                     (std::stoi(entity.groupCodes.at(70)) & 8)); // Bit 3 indicates 3D polyline
        
        // Collect all vertices
        std::vector<int> xCodes, yCodes, zCodes;
        for (const auto& pair : entity.groupCodes) {
            if (pair.first == 10) xCodes.push_back(std::stoi(pair.second));
            else if (pair.first == 20) yCodes.push_back(std::stoi(pair.second));
            else if (pair.first == 30) zCodes.push_back(std::stoi(pair.second));
        }
        
        // Build points from coordinates
        size_t numPoints = std::min({xCodes.size(), yCodes.size(), zCodes.size()});
        if (is3D) {
            for (size_t i = 0; i < numPoints; i++) {
                points.push_back(gp_Pnt(xCodes[i], yCodes[i], zCodes[i]));
            }
        } else {
            for (size_t i = 0; i < std::min(xCodes.size(), yCodes.size()); i++) {
                points.push_back(gp_Pnt(xCodes[i], yCodes[i], 0));
            }
        }
        
        if (points.size() >= 2) {
            BRepBuilderAPI_MakeWire wireBuilder;
            for (size_t i = 0; i < points.size() - 1; i++) {
                BRepBuilderAPI_MakeEdge edge(points[i], points[i + 1]);
                wireBuilder.Add(edge.Edge());
            }
            
            if (entity.type == "LWPOLYLINE" && points.size() > 2) {
                // Check if polyline is closed (group code 70, bit 0)
                bool isClosed = false;
                auto itFlags = entity.groupCodes.find(70);
                if (itFlags != entity.groupCodes.end()) {
                    isClosed = (std::stoi(itFlags->second) & 1);
                }
                
                if (isClosed) {
                    BRepBuilderAPI_MakeEdge edge(points.back(), points.front());
                    wireBuilder.Add(edge.Edge());
                }
            }
            
            return wireBuilder.Wire();
        }
        
        return TopoDS_Shape();
    }

    static TopoDS_Shape create3DFaceFromDxf(const DxfEntity& entity)
    {
        std::vector<gp_Pnt> points;
        
        // Extract corner coordinates (group codes 10, 20, 30 for first corner, 11, 21, 31 for second, etc.)
        for (int i = 0; i < 4; i++) {
            int xCode = 10 + i;
            int yCode = 20 + i;
            int zCode = 30 + i;
            
            auto itX = entity.groupCodes.find(xCode);
            auto itY = entity.groupCodes.find(yCode);
            auto itZ = entity.groupCodes.find(zCode);
            
            if (itX != entity.groupCodes.end() && itY != entity.groupCodes.end() && itZ != entity.groupCodes.end()) {
                double x = std::stod(itX->second);
                double y = std::stod(itY->second);
                double z = std::stod(itZ->second);
                points.push_back(gp_Pnt(x, y, z));
            }
        }
        
        if (points.size() >= 3) {
            // Create a face from the points
            BRepBuilderAPI_MakePolygon polygon;
            for (const auto& point : points) {
                polygon.Add(point);
            }
            
            if (points.size() == 3) {
                // Triangle
                BRepBuilderAPI_MakeFace face(polygon.Wire());
                return face.Face();
            } else if (points.size() == 4) {
                // Quadrilateral
                polygon.Close();
                BRepBuilderAPI_MakeFace face(polygon.Wire());
                return face.Face();
            }
        }
        
        return TopoDS_Shape();
    }

    static std::optional<ShapeNode> convertFromDxf(const Uint8Array& buffer)
    {
        std::string dummyFileName = "temp.dxf";
        writeBufferToFile(dummyFileName, buffer);

        // Read the DXF file as a text file and parse entities
        std::ifstream file(dummyFileName, std::ios::binary);
        if (!file.is_open()) {
            std::remove(dummyFileName.c_str());
            return std::nullopt;
        }

        // Read file content
        std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
        file.close();
        std::remove(dummyFileName.c_str());

        // Parse DXF entities
        std::vector<DxfEntity> entities = parseDxfEntities(content);

        // Create a compound shape to hold all DXF entities
        BRep_Builder builder;
        TopoDS_Compound compound;
        builder.MakeCompound(compound);

        // Process each entity and convert to OpenCascade shapes
        for (const auto& entity : entities) {
            TopoDS_Shape shape;
            
            if (entity.type == "LINE") {
                shape = createLineFromDxf(entity);
            } else if (entity.type == "CIRCLE") {
                shape = createCircleFromDxf(entity);
            } else if (entity.type == "ARC") {
                shape = createArcFromDxf(entity);
            } else if (entity.type == "POLYLINE" || entity.type == "LWPOLYLINE") {
                shape = createPolylineFromDxf(entity);
            } else if (entity.type == "3DFACE") {
                shape = create3DFaceFromDxf(entity);
            }
            
            if (!shape.IsNull()) {
                builder.Add(compound, shape);
            }
        }

        // Create a shape node for the compound
        ShapeNode node = {
            .shape = compound,
            .color = std::nullopt,
            .children = {},
            .name = "DXF Import (" + std::to_string(entities.size()) + " entities)"
        };

        return node;
    }

    static std::string convertToDxf(const ShapeArray& input)
    {
        auto shapes = vecFromJSArray<TopoDS_Shape>(input);
        std::ostringstream dxfStream;
        
        // DXF Header
        dxfStream << "  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  9\n$INSUNITS\n  70\n4\n  0\nENDSEC\n";
        
        // Tables Section (for layers)
        dxfStream << "  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n  0\nLAYER\n  2\n0\n  70\n0\n  62\n7\n  6\nCONTINUOUS\n";
        dxfStream << "  0\nENDTAB\n  0\nENDSEC\n";
        
        // Entities Section
        dxfStream << "  0\nSECTION\n  2\nENTITIES\n";
        
        // Process each shape and convert to DXF entities
        for (const auto& shape : shapes) {
            TopExp_Explorer explorer(shape, TopAbs_EDGE);
            
            while (explorer.More()) {
                const TopoDS_Edge& edge = TopoDS::Edge(explorer.Current());
                Standard_Real first, last;
                Handle(Geom_Curve) curve = BRep_Tool::Curve(edge, first, last);
                
                if (!curve.IsNull()) {
                    // Check curve type
                    if (curve->DynamicType() == STANDARD_TYPE(Geom_Line)) {
                        Handle(Geom_Line) line = Handle(Geom_Line)::DownCast(curve);
                        gp_Pnt p1 = line->Value(first);
                        gp_Pnt p2 = line->Value(last);
                        
                        dxfStream << "  0\nLINE\n  8\n0\n";
                        dxfStream << " 10\n" << p1.X() << "\n 20\n" << p1.Y() << "\n 30\n" << p1.Z() << "\n";
                        dxfStream << " 11\n" << p2.X() << "\n 21\n" << p2.Y() << "\n 31\n" << p2.Z() << "\n";
                    }
                    else if (curve->DynamicType() == STANDARD_TYPE(Geom_Circle)) {
                        Handle(Geom_Circle) circle = Handle(Geom_Circle)::DownCast(curve);
                        gp_Pnt center = circle->Location();
                        double radius = circle->Radius();
                        
                        dxfStream << "  0\nCIRCLE\n  8\n0\n";
                        dxfStream << " 10\n" << center.X() << "\n 20\n" << center.Y() << "\n 30\n" << center.Z() << "\n";
                        dxfStream << " 40\n" << radius << "\n";
                    }
                    else if (curve->DynamicType() == STANDARD_TYPE(Geom_TrimmedCurve)) {
                        Handle(Geom_TrimmedCurve) trimmed = Handle(Geom_TrimmedCurve)::DownCast(curve);
                        Handle(Geom_Circle) circle = Handle(Geom_Circle)::DownCast(trimmed->BasisCurve());
                        
                        if (!circle.IsNull()) {
                            gp_Pnt center = circle->Location();
                            double radius = circle->Radius();
                            double startAngle = trimmed->FirstParameter();
                            double endAngle = trimmed->LastParameter();
                            
                            dxfStream << "  0\nARC\n  8\n0\n";
                            dxfStream << " 10\n" << center.X() << "\n 20\n" << center.Y() << "\n 30\n" << center.Z() << "\n";
                            dxfStream << " 40\n" << radius << "\n";
                            dxfStream << " 50\n" << (startAngle * 180.0 / M_PI) << "\n";
                            dxfStream << " 51\n" << (endAngle * 180.0 / M_PI) << "\n";
                        }
                    }
                }
                
                explorer.Next();
            }
            
            // Handle wires (polylines)
            if (shape.ShapeType() == TopAbs_WIRE) {
                BRepTools_WireExplorer wireExplorer(TopoDS::Wire(shape));
                std::vector<gp_Pnt> points;
                
                while (wireExplorer.More()) {
                    const TopoDS_Edge& edge = wireExplorer.Current();
                    Standard_Real first, last;
                    Handle(Geom_Curve) curve = BRep_Tool::Curve(edge, first, last);
                    
                    if (!curve.IsNull()) {
                        gp_Pnt p1 = curve->Value(first);
                        points.push_back(p1);
                    }
                    
                    wireExplorer.Next();
                }
                
                if (!points.empty()) {
                    dxfStream << "  0\nLWPOLYLINE\n  8\n0\n  90\n" << points.size() << "\n  70\n1\n";
                    for (const auto& point : points) {
                        dxfStream << " 10\n" << point.X() << "\n 20\n" << point.Y() << "\n 30\n" << point.Z() << "\n";
                    }
                }
            }
            
            // Handle faces (3DFACE)
            if (shape.ShapeType() == TopAbs_FACE) {
                TopExp_Explorer faceExplorer(shape, TopAbs_EDGE);
                std::vector<gp_Pnt> vertices;
                
                // Extract vertices from face edges
                while (faceExplorer.More()) {
                    const TopoDS_Edge& edge = TopoDS::Edge(faceExplorer.Current());
                    Standard_Real first, last;
                    Handle(Geom_Curve) curve = BRep_Tool::Curve(edge, first, last);
                    
                    if (!curve.IsNull()) {
                        gp_Pnt p1 = curve->Value(first);
                        vertices.push_back(p1);
                    }
                    
                    faceExplorer.Next();
                }
                
                if (vertices.size() >= 3) {
                    dxfStream << "  0\n3DFACE\n  8\n0\n";
                    for (size_t i = 0; i < std::min(vertices.size(), size_t(4)); i++) {
                        dxfStream << " 10\n" << vertices[i].X() << "\n 20\n" << vertices[i].Y() << "\n 30\n" << vertices[i].Z() << "\n";
                    }
                }
            }
        }
        
        dxfStream << "  0\nENDSEC\n  0\nEOF\n";
        
        return dxfStream.str();
    }
};

EMSCRIPTEN_BINDINGS(Converter)
{
    register_optional<ShapeNode>();

    register_type<ShapeNodeArray>("Array<ShapeNode>");

    class_<ShapeNode>("ShapeNode")
        .property("shape", &ShapeNode::shape, return_value_policy::reference())
        .property("color", &ShapeNode::color)
        .property("name", &ShapeNode::name)
        .function("getChildren", &ShapeNode::getChildren);

    class_<Converter>("Converter")
        .class_function("convertToBrep", &Converter::convertToBrep)
        .class_function("convertFromBrep", &Converter::convertFromBrep)
        .class_function("convertFromStep", &Converter::convertFromStep)
        .class_function("convertFromIges", &Converter::convertFromIges)
        .class_function("convertToStep", &Converter::convertToStep)
        .class_function("convertToIges", &Converter::convertToIges)
        .class_function("convertFromStl", &Converter::convertFromStl)
        .class_function("convertFromDxf", &Converter::convertFromDxf)
        .class_function("convertToDxf", &Converter::convertToDxf);
}