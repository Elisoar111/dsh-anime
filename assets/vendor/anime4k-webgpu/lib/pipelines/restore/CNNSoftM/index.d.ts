/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPipelineDescriptor } from '../../interfaces';
export declare class CNNSoftM implements Anime4KPipeline {
    /**
     * 7 conv2d pipelines and output
     */
    pipelines: Anime4KPipeline[];
    /**
     * Creates an instance of CNNUL.
     *
     * @param {Object} options - The options for the CNNM pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for
     * creating textures and shader modules.
     * @param {GPUTexture} options.inputTexture - The input texture for the pipeline.
     */
    constructor({ device, inputTexture, }: Anime4KPipelineDescriptor);
    private fillOutputTextures;
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
