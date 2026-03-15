import marimo

__generated_with = "0.20.4"
app = marimo.App(width="full")


@app.cell
def _():
    from anywidget_archimate import ArchiMate

    widget = ArchiMate.from_xml(r"H:\Deriva\deriva\reference\reference_bigdata.archimate", height=800)
    widget
    return (widget,)


if __name__ == "__main__":
    app.run()
