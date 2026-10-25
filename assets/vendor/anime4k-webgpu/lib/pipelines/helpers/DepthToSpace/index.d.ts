/// <reference types="@webgpu/types" />
import { Anime4KPipeline, DepthToSpacePipelineDescriptor } from '../../interfaces';
export declare class DepthToSpace implements Anime4KPipeline {
    outputTexture: GPUTexture;
    pipeline: GPUComputePipeline;
    bindGroup: GPUBindGroup;
    name: string;
    /**
     * Creates an instance of DepthToSpace.
     *
     * @param {Object} options - The options for the DepthToSpace pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for
     *  creating textures and shader modules.
     * @param {Array<GPUTexture>} options.inputTextures - The input textures for the pipeline.
     *  All input textures must have the same dimensions.
     * @param {string} [options.name='depth to space'] - The name of the pipeline.
     *  Defaults to 'depth to space'.
     *
     * @throws {Error} Will throw an error if the number of input textures is not 3.
     */
    constructor({ device, inputTextures, name, }: DepthToSpacePipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
