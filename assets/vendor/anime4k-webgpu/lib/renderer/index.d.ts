/// <reference types="@webgpu/types" />
import { Anime4KPipeline } from '../pipelines';
export interface RendererOptions {
    video: HTMLVideoElement;
    canvas: HTMLCanvasElement;
    pipelineBuilder: (device: GPUDevice, inputTexture: GPUTexture) => [
        ...Anime4KPipeline[],
        Anime4KPipeline
    ];
}
/**
 * Renders a video using a custom pipeline.
 *
 * @param {RendererOptions} options - The options for rendering.
 * @param {HTMLVideoElement} options.video - The video element to render.
 * @param {HTMLCanvasElement} options.canvas - The canvas element to render to.
 * @param {Function} options.pipelineBuilder - A function that builds the custom pipeline.
 * It takes a GPUDevice and a GPUTexture as parameters
 * and returns an array of Anime4KPipeline instances.
 * The pipelines returned will be executed in order in the render loop.
 * The output texture of the last pipeline will be rendered to the canvas.
 *
 * @returns {Promise<void>} A promise that resolves when redering is binded.
 *
 * @throws {Error} Will throw an error if WebGPU is not supported.
 */
export declare function render(options: RendererOptions): Promise<void>;
