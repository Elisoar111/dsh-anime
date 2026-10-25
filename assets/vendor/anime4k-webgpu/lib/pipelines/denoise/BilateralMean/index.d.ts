/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPipelineDescriptor } from '../../interfaces';
export declare class BilateralMean implements Anime4KPipeline {
    texture: GPUTexture;
    module: GPUShaderModule;
    bindGroupLayout: GPUBindGroupLayout;
    bindGroup: GPUBindGroup;
    pipelineLayout: GPUPipelineLayout;
    pipeline: GPUComputePipeline;
    strengthBuffer: GPUBuffer;
    strengthBuffer2: GPUBuffer;
    inputTexWidth: number;
    inputTexHeight: number;
    inputTexture: GPUTexture;
    device: GPUDevice;
    constructor({ device, inputTexture, }: Anime4KPipelineDescriptor);
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
    updateParam(param: string, value: any): void;
}
