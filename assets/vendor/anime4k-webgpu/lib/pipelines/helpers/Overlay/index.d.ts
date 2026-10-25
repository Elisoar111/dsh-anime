/// <reference types="@webgpu/types" />
import { Anime4KPipeline, OverlayPipelineDescriptor } from '../../interfaces';
/**
 * Render Pipeline:
 *      Takes in n input textures output texture.
 */
export declare class Overlay implements Anime4KPipeline {
    outputTexture: GPUTexture;
    pipeline: GPURenderPipeline;
    bindGroup: GPUBindGroup;
    name: string;
    /**
     * Creates an instance of Overlay.
     *
     * @param {Object} options - The options for the Overlay pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for creating
     *  textures and shader modules.
     * @param {Array<GPUTexture>} options.inputTextures - The input textures for the pipeline.
     * All input textures must have the same dimensions.
     * @param {Array<number>} options.outputTextureSize - The size of the output texture.
     * @param {string} [options.fragmentWGSL=overlay2WGSL] - The fragment shader code in WGSL format.
     * Defaults to 'overlay2WGSL' (overlay 2 textures).
     * @param {string} [options.name='overlay'] - The name of the pipeline. Defaults to 'overlay'.
     *
     * @throws {Error} Will throw an error if the shader is not defined.
     */
    constructor({ device, inputTextures, outputTextureSize, fragmentWGSL, name, }: OverlayPipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
