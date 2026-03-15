"""ArchiMate XML parser.

Parses both:
- ArchiMate 3.0 Open Exchange Format XML (from Deriva, standard exports)
- Archi tool native .archimate format (from the Archi modeling tool)

Returns element and relationship dicts suitable for the widget's traitlets.
"""

from __future__ import annotations

from pathlib import Path
from xml.etree import ElementTree as ET

_XSI = "http://www.w3.org/2001/XMLSchema-instance"
_ARCHI_NS = "http://www.archimatetool.com/archimate"

# ArchiMate element type -> layer mapping
LAYER_MAP: dict[str, str] = {
    # Business
    "BusinessActor": "Business",
    "BusinessProcess": "Business",
    "BusinessFunction": "Business",
    "BusinessEvent": "Business",
    "BusinessObject": "Business",
    # Application
    "ApplicationComponent": "Application",
    "ApplicationInterface": "Application",
    "ApplicationService": "Application",
    "DataObject": "Application",
    # Technology
    "Node": "Technology",
    "Device": "Technology",
    "SystemSoftware": "Technology",
    "TechnologyService": "Technology",
}

# Archi native format: folder type -> layer
_ARCHI_FOLDER_LAYERS = {
    "business": "Business",
    "application": "Application",
    "technology": "Technology",
    "strategy": "Strategy",
    "motivation": "Motivation",
    "implementation_migration": "Implementation",
    "other": "Other",
    "relations": "_relations",
}

# Archi native format: xsi:type uses "archimate:" prefix and "Relationship" suffix
# e.g. "archimate:FlowRelationship" -> "Flow"
_ARCHI_REL_SUFFIX = "Relationship"


def parse_xml(source: str | Path) -> tuple[list[dict], list[dict]]:
    """Parse ArchiMate XML and return (elements, relationships).

    Supports both Open Exchange Format and Archi native .archimate format.

    Args:
        source: XML string or path to XML file.

    Returns:
        Tuple of (elements, relationships) as lists of dicts.
    """
    source_path = Path(source) if not isinstance(source, Path) else source
    if source_path.exists():
        tree = ET.parse(source_path)
        root = tree.getroot()
    else:
        root = ET.fromstring(str(source))

    ns = _detect_namespace(root)

    # Detect format: Archi native vs Open Exchange
    if ns == _ARCHI_NS or "archimatetool" in ns:
        return _parse_archi_native(root, ns)
    else:
        return _parse_open_exchange(root, ns)


def _detect_namespace(root: ET.Element) -> str:
    """Detect the namespace from the root element."""
    tag = root.tag
    if tag.startswith("{"):
        return tag[1 : tag.index("}")]
    return ""


# =============================================================================
# Open Exchange Format parser
# =============================================================================


def _parse_open_exchange(root: ET.Element, ns: str) -> tuple[list[dict], list[dict]]:
    """Parse ArchiMate Open Exchange Format XML."""
    nsmap = {"am": ns} if ns else {}
    elements = []
    relationships = []

    elements_section = root.find("am:elements", nsmap) if ns else root.find("elements")
    if elements_section is not None:
        for elem in elements_section:
            parsed = _parse_oef_element(elem, ns)
            if parsed:
                elements.append(parsed)

    rels_section = root.find("am:relationships", nsmap) if ns else root.find("relationships")
    if rels_section is not None:
        for rel in rels_section:
            parsed = _parse_oef_relationship(rel, ns)
            if parsed:
                relationships.append(parsed)

    return elements, relationships


def _parse_oef_element(elem: ET.Element, ns: str) -> dict | None:
    """Parse an element in Open Exchange Format."""
    xsi_type = elem.get(f"{{{_XSI}}}type") or ""
    identifier = elem.get("identifier", "")

    if not xsi_type or not identifier:
        return None

    name = _get_text(elem, "name", ns)
    documentation = _get_text(elem, "documentation", ns)
    layer = LAYER_MAP.get(xsi_type, "Other")

    return {
        "id": identifier,
        "name": name or identifier,
        "type": xsi_type,
        "layer": layer,
        "documentation": documentation or "",
    }


def _parse_oef_relationship(rel: ET.Element, ns: str) -> dict | None:
    """Parse a relationship in Open Exchange Format."""
    xsi_type = rel.get(f"{{{_XSI}}}type") or ""
    identifier = rel.get("identifier", "")
    source = rel.get("source", "")
    target = rel.get("target", "")

    if not xsi_type or not source or not target:
        return None

    name = _get_text(rel, "name", ns)

    return {
        "id": identifier or f"{source}-{xsi_type}-{target}",
        "source": source,
        "target": target,
        "type": xsi_type,
        "name": name or "",
    }


# =============================================================================
# Archi native format parser
# =============================================================================


def _parse_archi_native(root: ET.Element, ns: str) -> tuple[list[dict], list[dict]]:
    """Parse Archi tool native .archimate format.

    Structure: <model> contains <folder type="business|application|...">
    with nested <element> and <folder> children.
    Relations are in <folder type="relations">.
    """
    elements = []
    relationships = []

    for folder in root:
        tag = folder.tag
        if tag == f"{{{ns}}}folder" or tag == "folder":
            folder_type = folder.get("type", "")
            if folder_type == "relations":
                _collect_archi_relationships(folder, ns, relationships)
            elif folder_type in _ARCHI_FOLDER_LAYERS:
                _collect_archi_elements(folder, ns, elements)
            else:
                # Recurse into unknown folders too
                _collect_archi_elements(folder, ns, elements)

    return elements, relationships


def _collect_archi_elements(folder: ET.Element, ns: str, elements: list[dict]) -> None:
    """Recursively collect elements from Archi folder structure."""
    for child in folder:
        tag = _local_tag(child.tag)
        if tag == "element":
            parsed = _parse_archi_element(child)
            if parsed:
                elements.append(parsed)
        elif tag == "folder":
            _collect_archi_elements(child, ns, elements)


def _collect_archi_relationships(folder: ET.Element, ns: str, relationships: list[dict]) -> None:
    """Recursively collect relationships from Archi relations folder."""
    for child in folder:
        tag = _local_tag(child.tag)
        if tag == "element":
            parsed = _parse_archi_relationship(child)
            if parsed:
                relationships.append(parsed)
        elif tag == "folder":
            _collect_archi_relationships(child, ns, relationships)


def _parse_archi_element(elem: ET.Element) -> dict | None:
    """Parse an element in Archi native format.

    xsi:type is like "archimate:BusinessProcess"
    """
    xsi_type_raw = elem.get(f"{{{_XSI}}}type") or ""
    elem_id = elem.get("id", "")
    name = elem.get("name", "")

    if not xsi_type_raw or not elem_id:
        return None

    # Strip "archimate:" prefix
    element_type = _strip_archi_prefix(xsi_type_raw)

    # Skip relationship types that might be in wrong folder
    if element_type.endswith(_ARCHI_REL_SUFFIX):
        return None

    layer = LAYER_MAP.get(element_type, "Other")
    documentation = _get_archi_documentation(elem)

    return {
        "id": elem_id,
        "name": name or elem_id,
        "type": element_type,
        "layer": layer,
        "documentation": documentation,
    }


def _parse_archi_relationship(elem: ET.Element) -> dict | None:
    """Parse a relationship in Archi native format.

    xsi:type is like "archimate:FlowRelationship"
    """
    xsi_type_raw = elem.get(f"{{{_XSI}}}type") or ""
    rel_id = elem.get("id", "")
    source = elem.get("source", "")
    target = elem.get("target", "")

    if not xsi_type_raw or not source or not target:
        return None

    # "archimate:FlowRelationship" -> "Flow"
    rel_type = _strip_archi_prefix(xsi_type_raw)
    if rel_type.endswith(_ARCHI_REL_SUFFIX):
        rel_type = rel_type[: -len(_ARCHI_REL_SUFFIX)]

    name = elem.get("name", "")

    return {
        "id": rel_id or f"{source}-{rel_type}-{target}",
        "source": source,
        "target": target,
        "type": rel_type,
        "name": name or "",
    }


def _get_archi_documentation(elem: ET.Element) -> str:
    """Get documentation from Archi element (stored as 'documentation' attribute or child)."""
    # Try attribute first (some Archi versions)
    doc = elem.get("documentation", "")
    if doc:
        return doc
    # Try child element
    for child in elem:
        if _local_tag(child.tag) == "documentation":
            return (child.text or "").strip()
    return ""


# =============================================================================
# Shared helpers
# =============================================================================


def _get_text(parent: ET.Element, tag: str, ns: str) -> str:
    """Get text content of a child element (Open Exchange Format)."""
    if ns:
        child = parent.find(f"{{{ns}}}{tag}")
    else:
        child = parent.find(tag)
    return child.text.strip() if child is not None and child.text else ""


def _local_tag(tag: str) -> str:
    """Strip namespace from a tag: '{ns}name' -> 'name'."""
    if tag.startswith("{"):
        return tag[tag.index("}") + 1 :]
    return tag


def _strip_archi_prefix(xsi_type: str) -> str:
    """Strip 'archimate:' prefix from Archi native xsi:type values."""
    if ":" in xsi_type:
        return xsi_type.split(":", 1)[1]
    return xsi_type
