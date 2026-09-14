# Isolate the React content publishing workbench

The existing extension remains WXT + Vue, while the content publishing workbench is delivered as an isolated React + shadcn feature package behind adapters for source content, AI completion, settings, draft storage, and image export. This avoids a whole-extension migration while making the workbench portable to other projects; Chrome is the first-class side-panel host, and Firefox may host the same package in a standalone extension page.
