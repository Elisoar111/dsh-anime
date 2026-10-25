/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPresetPipelineDescriptor } from '../../interfaces';
export declare class ModeA implements Anime4KPipeline {
    pipelines: Anime4KPipeline[];
    outputTexture: GPUTexture;
    constructor({ device, inputTexture, nativeDimensions, targetDimensions, }: Anime4KPresetPipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
