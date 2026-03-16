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


def test_layer_map_covers_all_types():
    expected_types = {
        "ApplicationComponent",
        "ApplicationInterface",
        "ApplicationService",
        "DataObject",
        "BusinessActor",
        "BusinessProcess",
        "BusinessFunction",
        "BusinessEvent",
        "BusinessObject",
        "Node",
        "Device",
        "SystemSoftware",
        "TechnologyService",
    }
    assert set(LAYER_MAP.keys()) == expected_types


def test_parse_preserves_relationship_types():
    _, rels = parse_xml(SAMPLE_XML)
    rel_types = {r["type"] for r in rels}
    assert "Composition" in rel_types
    assert "Serving" in rel_types
    assert "Realization" in rel_types
    assert "Access" in rel_types
