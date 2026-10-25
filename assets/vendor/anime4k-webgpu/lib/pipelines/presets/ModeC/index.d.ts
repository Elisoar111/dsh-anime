/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPresetPipelineDescriptor } from '../../interfaces';
export declare class ModeC implements Anime4KPipeline {
    pipelines: Anime4KPipeline[];
    outputTexture: GPUTexture;
    /**
     * Constructs a new instance of the preset class.
     *
     * @param {Anime4KPresetPipelineDescriptor} options - An object containing
     * the following properties:
     * @param {GPUDevice} options.device - The GPU device to use for the pipeline.
     * @param {GPUTexture} options.inputTexture - The input texture to process.
     * @param {Dimensions} options.nativeDimensions - The original dimensions of the input texture.
     * @param {Dimensions} options.targetDimensions - The target dimension for the output texture.
     */
    constructor({ device, inputTexture, nativeDimensions, targetDimensions, }: Anime4KPresetPipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
