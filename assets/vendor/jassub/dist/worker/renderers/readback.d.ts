export interface PixelBuffer {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}
export declare function readCanvasPixels(canvas: OffscreenCanvas | null): PixelBuffer | null;
