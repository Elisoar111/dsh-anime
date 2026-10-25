/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPipelineDescriptor } from '../../interfaces';
export declare class DoG implements Anime4KPipeline {
    textures: GPUTexture[];
    modules: GPUShaderModule[];
    bindGroupLayouts: GPUBindGroupLayout[];
    bindGroups: GPUBindGroup[];
    pipelineLayouts: GPUPipelineLayout[];
    pipelines: GPUComputePipeline[];
    strengthBuffer: GPUBuffer;
    inputTexWidth: number;
    inputTexHeight: number;
    inputTexture: GPUTexture;
    device: GPUDevice;
    constructor({ device, inputTexture, }: Anime4KPipelineDescriptor);
    getOutputTexture(): GPUTexture;
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
}
