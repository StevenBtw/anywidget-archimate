import marimo

__generated_with = "0.25.2"
app = marimo.App(width="full")


@app.cell
def _():
    from anywidget_archimate import ArchiMate

    # The path of an Archi model file (.archimate)
    widget = ArchiMate.from_xml("model.archimate", height=800)
    widget  # noqa: B018  (the cell's output)
    return (widget,)


if __name__ == "__main__":
    app.run()
