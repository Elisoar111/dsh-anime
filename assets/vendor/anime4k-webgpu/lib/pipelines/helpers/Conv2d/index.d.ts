/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Conv2dPipelineDescriptor } from '../../interfaces';
/**
 * Conv2d pipeline
 *    Takes in n input textures output texture. All input textures and output texture
 * have the same dimensions.
*/
export declare class Conv2d implements Anime4KPipeline {
    outputTexture: GPUTexture;
    pipeline: GPUComputePipeline;
    bindGroup: GPUBindGroup;
    name: string;
    /**
     * Creates an instance of Conv2d.
     *
     * @param {Object} options - The options for the Conv2d pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for
     * creating textures and shader modules.
     * @param {GPUTexture[]} options.inputTextures - The input textures for the pipeline.
     * All input textures must have the same dimensions.
     * @param {string} options.shaderWGSL - The shader code in WGSL format.
     * @param {string} [options.name='conv2d'] - The name of the pipeline. Defaults to 'conv2d'.
     *
     * @throws {Error} Will throw an error if no input textures are provided.
     * @throws {Error} Will throw an error if the shader is not defined.
     */
    constructor({ device, inputTextures, shaderWGSL, name, }: Conv2dPipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
