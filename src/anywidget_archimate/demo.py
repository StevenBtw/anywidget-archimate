"""Demo module for anywidget-archimate.

Creates a pre-populated ArchiMate widget with a sample enterprise
architecture model spanning Business, Application, and Technology layers.
Renders immediately without any external files.

Usage:
    from anywidget_archimate.demo import demo_archimate
    widget = demo_archimate()
"""

from __future__ import annotations

from typing import Any

from anywidget_archimate.widget import ArchiMate

# Sample ArchiMate Open Exchange Format XML: a web shop with order processing,
# REST API, database service, and Kubernetes infrastructure.
DEMO_XML = """\
<?xml version='1.0' encoding='UTF-8'?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       identifier="demo-model"
       xsi:schemaLocation="http://www.opengroup.org/xsd/archimate/3.0/ http://www.opengroup.org/xsd/archimate/3.1/archimate3_Model.xsd">
  <name xml:lang="en">Demo ArchiMate Model</name>
  <elements>
    <!-- Business Layer -->
    <element identifier="ba_customer" xsi:type="BusinessActor">
      <name xml:lang="en">Customer</name>
      <documentation xml:lang="en">External customer interacting with the system</documentation>
    </element>
    <element identifier="bp_order" xsi:type="BusinessProcess">
      <name xml:lang="en">Order Processing</name>
      <documentation xml:lang="en">End-to-end order processing workflow</documentation>
    </element>
    <element identifier="bf_payment" xsi:type="BusinessFunction">
      <name xml:lang="en">Payment Handling</name>
      <documentation xml:lang="en">Capability for processing payments</documentation>
    </element>
    <element identifier="bo_order" xsi:type="BusinessObject">
      <name xml:lang="en">Order</name>
      <documentation xml:lang="en">A purchase order from a customer</documentation>
    </element>

    <!-- Application Layer -->
    <element identifier="ac_webshop" xsi:type="ApplicationComponent">
      <name xml:lang="en">Web Shop</name>
      <documentation xml:lang="en">Online storefront application</documentation>
    </element>
    <element identifier="ai_rest" xsi:type="ApplicationInterface">
      <name xml:lang="en">REST API</name>
      <documentation xml:lang="en">Public HTTP REST interface</documentation>
    </element>
    <element identifier="as_order" xsi:type="ApplicationService">
      <name xml:lang="en">Order Service</name>
      <documentation xml:lang="en">Manages order lifecycle</documentation>
    </element>
    <element identifier="do_order" xsi:type="DataObject">
      <name xml:lang="en">Order Record</name>
      <documentation xml:lang="en">Persistent order data</documentation>
    </element>

    <!-- Technology Layer -->
    <element identifier="nd_cluster" xsi:type="Node">
      <name xml:lang="en">K8s Cluster</name>
      <documentation xml:lang="en">Kubernetes cluster hosting the application</documentation>
    </element>
    <element identifier="ss_postgres" xsi:type="SystemSoftware">
      <name xml:lang="en">PostgreSQL</name>
      <documentation xml:lang="en">Relational database for persistence</documentation>
    </element>
    <element identifier="ts_db" xsi:type="TechnologyService">
      <name xml:lang="en">Database Service</name>
      <documentation xml:lang="en">Managed database service</documentation>
    </element>
    <element identifier="dv_server" xsi:type="Device">
      <name xml:lang="en">App Server</name>
      <documentation xml:lang="en">Physical server hardware</documentation>
    </element>
  </elements>
  <relationships>
    <relationship identifier="r1" xsi:type="Assignment" source="ba_customer" target="bp_order"/>
    <relationship identifier="r2" xsi:type="Triggering" source="bp_order" target="bf_payment"/>
    <relationship identifier="r3" xsi:type="Access" source="bp_order" target="bo_order"/>
    <relationship identifier="r4" xsi:type="Composition" source="ac_webshop" target="ai_rest"/>
    <relationship identifier="r5" xsi:type="Composition" source="ac_webshop" target="as_order"/>
    <relationship identifier="r6" xsi:type="Access" source="as_order" target="do_order"/>
    <relationship identifier="r7" xsi:type="Serving" source="as_order" target="bp_order"/>
    <relationship identifier="r8" xsi:type="Realization" source="ac_webshop" target="bf_payment"/>
    <relationship identifier="r9" xsi:type="Flow" source="as_order" target="bf_payment"/>
    <relationship identifier="r10" xsi:type="Realization" source="ss_postgres" target="ts_db"/>
    <relationship identifier="r11" xsi:type="Aggregation" source="nd_cluster" target="dv_server"/>
    <relationship identifier="r12" xsi:type="Serving" source="ts_db" target="ac_webshop"/>
  </relationships>
</model>
"""


def demo_archimate(**kwargs: Any) -> ArchiMate:
    """Create a demo ArchiMate widget with a sample enterprise architecture model.

    The model contains 12 elements across three layers (Business, Application,
    Technology) connected by 12 relationships, representing a web shop with
    order processing, a REST API, and Kubernetes infrastructure.

    Parameters
    ----------
    **kwargs
        Additional keyword arguments passed to ArchiMate constructor.
        Overrides demo defaults.

    Returns
    -------
    ArchiMate
        A ready-to-use ArchiMate widget with the demo model rendered.

    Example
    -------
    >>> from anywidget_archimate.demo import demo_archimate
    >>> widget = demo_archimate()
    >>> widget  # renders in notebook
    """
    defaults: dict[str, Any] = {
        "height": kwargs.pop("height", 700),
    }
    defaults.update(kwargs)

    return ArchiMate.from_xml(DEMO_XML, **defaults)
