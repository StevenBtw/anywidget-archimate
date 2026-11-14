import marimo

__generated_with = "0.25.2"
app = marimo.App(width="full")


@app.cell
def _():
    from pathlib import Path

    from anywidget_archimate import ArchiMate

    # The sample model next to this file; any Open Exchange (.xml) or Archi (.archimate) file works
    widget = ArchiMate.from_xml(Path(__file__).parent / "sample.xml", height=800)
    widget  # noqa: B018  (the cell's output)
    return (widget,)


if __name__ == "__main__":
    app.run()
