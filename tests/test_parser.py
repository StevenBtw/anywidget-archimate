"""Tests for the ArchiMate XML parser."""

from pathlib import Path

from anywidget_archimate.parser import LAYER_MAP, parse_xml

SAMPLE_XML = Path(__file__).parent.parent / "examples" / "sample.xml"

MINIMAL_XML = """\
<?xml version='1.0' encoding='UTF-8'?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       identifier="test-model">
  <elements>
    <element identifier="ac1" xsi:type="ApplicationComponent">
      <name xml:lang="en">Component A</name>
    </element>
    <element identifier="ba1" xsi:type="BusinessActor">
      <name xml:lang="en">Actor B</name>
      <documentation xml:lang="en">Some docs</documentation>
    </element>
  </elements>
  <relationships>
    <relationship identifier="r1" xsi:type="Serving" source="ac1" target="ba1"/>
  </relationships>
</model>
"""


def test_parse_xml_from_string():
    elements, rels = parse_xml(MINIMAL_XML)
    assert len(elements) == 2
    assert len(rels) == 1

    ac = next(e for e in elements if e["id"] == "ac1")
    assert ac["name"] == "Component A"
    assert ac["type"] == "ApplicationComponent"
    assert ac["layer"] == "Application"

    ba = next(e for e in elements if e["id"] == "ba1")
    assert ba["name"] == "Actor B"
    assert ba["layer"] == "Business"
    assert ba["documentation"] == "Some docs"

    r = rels[0]
    assert r["source"] == "ac1"
    assert r["target"] == "ba1"
    assert r["type"] == "Serving"


def test_parse_xml_from_file():
    elements, rels = parse_xml(SAMPLE_XML)
    assert len(elements) == 12
    assert len(rels) == 12

    layers = {e["layer"] for e in elements}
    assert layers == {"Business", "Application", "Technology"}


# Every ArchiMate 3.2 element type by layer (Physical elements belong to Technology; Junction, Grouping and Location
# to Other). Archi writes a junction as "Junction", the Open Exchange Format as "AndJunction" or "OrJunction".
ARCHIMATE_32_TYPES = {
    "Motivation": [
        "Stakeholder", "Driver", "Assessment", "Goal", "Outcome",
        "Principle", "Requirement", "Constraint", "Meaning", "Value",
    ],
    "Strategy": ["Resource", "Capability", "ValueStream", "CourseOfAction"],
    "Business": [
        "BusinessActor", "BusinessRole", "BusinessCollaboration", "BusinessInterface", "BusinessProcess",
        "BusinessFunction", "BusinessInteraction", "BusinessEvent", "BusinessService", "BusinessObject",
        "Contract", "Representation", "Product",
    ],
    "Application": [
        "ApplicationComponent", "ApplicationCollaboration", "ApplicationInterface", "ApplicationFunction",
        "ApplicationInteraction", "ApplicationProcess", "ApplicationEvent", "ApplicationService", "DataObject",
    ],
    "Technology": [
        "Node", "Device", "SystemSoftware", "TechnologyCollaboration", "TechnologyInterface", "Path",
        "CommunicationNetwork", "TechnologyFunction", "TechnologyProcess", "TechnologyInteraction",
        "TechnologyEvent", "TechnologyService", "Artifact",
        "Equipment", "Facility", "DistributionNetwork", "Material",
    ],
    "Implementation": ["WorkPackage", "Deliverable", "ImplementationEvent", "Plateau", "Gap"],
    "Other": ["Location", "Grouping", "Junction", "AndJunction", "OrJunction"],
}  # fmt: skip


def test_layer_map_covers_every_archimate_32_type():
    expected = {t: layer for layer, types in ARCHIMATE_32_TYPES.items() for t in types}
    assert LAYER_MAP == expected


LAYERS_XML = """\
<?xml version='1.0' encoding='UTF-8'?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       identifier="layers">
  <elements>
    <element identifier="g1" xsi:type="Goal"><name>Grow</name></element>
    <element identifier="c1" xsi:type="Capability"><name>Sell</name></element>
    <element identifier="w1" xsi:type="WorkPackage"><name>Migrate</name></element>
    <element identifier="e1" xsi:type="Equipment"><name>Robot</name></element>
    <element identifier="j1" xsi:type="AndJunction"/>
  </elements>
  <relationships>
    <relationship identifier="r1" xsi:type="Influence" source="c1" target="g1"/>
  </relationships>
</model>
"""


def test_parse_assigns_the_motivation_strategy_implementation_and_physical_layers():
    elements, rels = parse_xml(LAYERS_XML)
    layers = {e["id"]: e["layer"] for e in elements}
    assert layers == {"g1": "Motivation", "c1": "Strategy", "w1": "Implementation", "e1": "Technology", "j1": "Other"}
    assert next(e for e in elements if e["id"] == "j1")["type"] == "AndJunction"
    assert rels[0]["type"] == "Influence"


def test_parse_preserves_relationship_types():
    _, rels = parse_xml(SAMPLE_XML)
    rel_types = {r["type"] for r in rels}
    assert "Composition" in rel_types
    assert "Serving" in rel_types
    assert "Realization" in rel_types
    assert "Access" in rel_types


ARCHI_JUNCTIONS_XML = """\
<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:archimate="http://www.archimatetool.com/archimate" name="m" id="m1">
  <folder name="Other" id="f1" type="other">
    <element xsi:type="archimate:Junction" id="j1" type="or"/>
    <element xsi:type="archimate:Junction" id="j2"/>
  </folder>
</archimate:model>
"""


def test_archi_junctions_keep_and_or():
    elements, _ = parse_xml(ARCHI_JUNCTIONS_XML)
    assert {e["id"]: (e["type"], e["layer"]) for e in elements} == {
        "j1": ("OrJunction", "Other"),
        "j2": ("AndJunction", "Other"),
    }
