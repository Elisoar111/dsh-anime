/// <reference types="@webgpu/types" />
import { Anime4KPipeline, DownscalePipelineDescriptor } from '../../interfaces';
export declare class Downscale implements Anime4KPipeline {
    outputTexture: GPUTexture;
    pipeline: GPURenderPipeline;
    bindGroup: GPUBindGroup;
    name: string;
    constructor({ device, inputTexture, targetDimensions, name, }: DownscalePipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
