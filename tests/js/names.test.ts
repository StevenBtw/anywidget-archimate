// Type names as the widget shows them: without the layer prefix (the layer is the subheader, band and colour).
// Run through tests/test_ui.py::test_javascript.
import assert from "node:assert/strict";
import { test } from "node:test";

import { typeName } from "../../src/anywidget_archimate/ui/names.ts";

test("the layer prefix is dropped, the rest spaced", () => {
  assert.equal(typeName("BusinessActor"), "Actor");
  assert.equal(typeName("BusinessObject"), "Object");
  assert.equal(typeName("ApplicationInterface"), "Interface");
  assert.equal(typeName("ApplicationComponent"), "Component");
  assert.equal(typeName("TechnologyService"), "Service");
  assert.equal(typeName("ImplementationEvent"), "Event");
});

test("types without a layer prefix keep their full name", () => {
  assert.equal(typeName("DataObject"), "Data Object");
  assert.equal(typeName("SystemSoftware"), "System Software");
  assert.equal(typeName("CommunicationNetwork"), "Communication Network");
  assert.equal(typeName("WorkPackage"), "Work Package");
  assert.equal(typeName(""), "");
  assert.equal(typeName(undefined), "");
});
