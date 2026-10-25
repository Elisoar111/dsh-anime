/// <reference types="@webgpu/types" />
import { Anime4KPipeline, ClampHighlightsPipelineDescriptor } from '../../interfaces';
export declare class ClampHighlights implements Anime4KPipeline {
    name: string;
    pipelines: {
        luminationXPipeline: GPUComputePipeline;
        luminationYPipeline: GPUComputePipeline;
        clampPipeline: GPUComputePipeline;
    };
    bindGroups: {
        luminationXBindGroup: GPUBindGroup;
        luminationYBindGroup: GPUBindGroup;
        clampBindGroup: GPUBindGroup;
    };
    outputTexture: GPUTexture;
    constructor({ device, inputTexture, name, }: ClampHighlightsPipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
