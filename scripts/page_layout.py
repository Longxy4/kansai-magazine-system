"""Keep PDF page geometry aligned with Poppler's displayed orientation."""


def displayed_size(page):
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    return (height, width) if page.rotation % 180 else (width, height)


def document_layout(reader):
    orientations = {width > height for width, height in map(displayed_size, reader.pages)}
    if len(orientations) != 1:
        raise ValueError('PDF mixes displayed single pages and two-page spreads; use one layout per issue')
    return 'spreads' if orientations == {True} else 'single'


def normalized_rect(page, rectangle):
    media = page.mediabox
    x0, y0, x1, y1 = map(float, rectangle)
    points = []
    for x, y in ((x0, y0), (x0, y1), (x1, y0), (x1, y1)):
        u = (x - float(media.left)) / float(media.width)
        v = (float(media.top) - y) / float(media.height)
        rotation = page.rotation % 360
        if rotation == 90:
            u, v = 1 - v, u
        elif rotation == 180:
            u, v = 1 - u, 1 - v
        elif rotation == 270:
            u, v = v, 1 - u
        points.append((u, v))
    return (min(p[0] for p in points), min(p[1] for p in points),
            max(p[0] for p in points), max(p[1] for p in points))
