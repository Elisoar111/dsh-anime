/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPipelineDescriptor } from '../../interfaces';
export declare class CNNx2M implements Anime4KPipeline {
    pipelines: Anime4KPipeline[];
    /**
     * Creates an instance of CNNSoftVL.
     *
     * @param {Object} options - The options for the CNNSoftVL pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for
     * creating textures and shader modules.
     * @param {GPUTexture} options.inputTexture - The input texture for the pipeline.
     */
    constructor({ device, inputTexture, }: Anime4KPipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
    private pushPipeline;
    private fillOutputTextures;
}
