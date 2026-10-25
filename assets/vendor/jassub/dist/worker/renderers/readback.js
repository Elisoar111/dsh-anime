// Return the canvas pixels as straight RGBA. A WebGL drawing buffer must be
// read in the same task as the draw.
export function readCanvasPixels(canvas) {
    if (!canvas)
        return null;
    const { width, height } = canvas;
    const surface = new OffscreenCanvas(width, height);
    const ctx = surface.getContext('2d');
    if (!ctx)
        return null;
    ctx.drawImage(canvas, 0, 0);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}
//# sourceMappingURL=readback.js.map